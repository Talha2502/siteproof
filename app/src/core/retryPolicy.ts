// Decides what to do after a failed exchange with the server: wait and retry,
// or stop and ask the user. Pure functions, so every rule is unit-tested.
//
// Every retry restarts the report's upload from a HEAD per unfinished image, so
// "re-HEAD and continue" (tus 409) and "recreate from zero" (expired upload,
// 404/410) need no special action here: the next HEAD finds the true offset,
// or a 404 that leads to a fresh POST.

export type Operation =
  | 'headUpload'
  | 'createUpload'
  | 'patchUpload'
  | 'putReport';

export type Failure =
  /** No response: offline, DNS failure, connection reset. */
  | { kind: 'network' }
  /** No bytes progressed, or no response headers, within the stall timeout. */
  | { kind: 'stall' }
  /** A response with a status the engine did not expect. */
  | { kind: 'http'; operation: Operation; status: number; retryAfter?: string }
  /** The server broke the protocol (e.g. no Upload-Offset), or saving progress failed. */
  | { kind: 'unexpected'; message: string }
  /** A photo is missing or shorter than recorded on this phone: it can never be sent. */
  | { kind: 'localFile'; message: string };

export interface Classification {
  kind: 'transient' | 'permanent';
  /** For transient: a log-style note. For permanent: shown to the user as "Not sent · <message>". */
  message: string;
}

export type Decision =
  | { retry: true; delayMs: number; message: string }
  | { retry: false; message: string };

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 60_000;
/** A Retry-After longer than this is treated as this, so one bad header cannot park a report for days. */
export const RETRY_AFTER_CAP_MS = 60 * 60_000;

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const UPLOAD_OPERATIONS = new Set<Operation>([
  'headUpload',
  'createUpload',
  'patchUpload',
]);

const PERMANENT_MESSAGES: Partial<Record<number, string>> = {
  400: 'The server rejected the request as invalid',
  401: 'The server refused access',
  403: 'The server refused access',
  413: 'A photo is too large for the server',
  415: "A photo is in a format the server doesn't accept",
  422: "The server couldn't accept the report's photos",
};

function transient(message: string): Classification {
  return { kind: 'transient', message };
}

function permanent(message: string, status: number): Classification {
  return { kind: 'permanent', message: `${message} (HTTP ${status})` };
}

export function classify(failure: Failure): Classification {
  if (failure.kind === 'network')
    return transient('No connection to the server');
  if (failure.kind === 'stall') return transient('The connection stalled');
  // Retrying beats stranding the report: a glitch may pass, and a persistent
  // one keeps the report safely on the phone, backing off up to once a minute.
  if (failure.kind === 'unexpected') return transient(failure.message);
  if (failure.kind === 'localFile')
    return { kind: 'permanent', message: failure.message };

  const { operation, status } = failure;
  if (TRANSIENT_STATUSES.has(status))
    return transient(`Server temporarily unavailable (HTTP ${status})`);

  if (status === 409) {
    // On uploads, 409 means our offset is stale (or the upload already exists): re-HEAD and carry on.
    // On the report, it means different content under the same ID: a bug that retrying cannot fix.
    return operation === 'putReport'
      ? permanent(
          'A different report with this ID is already on the server',
          status,
        )
      : transient('Upload out of step with the server; checking its offset');
  }
  if ((status === 404 || status === 410) && UPLOAD_OPERATIONS.has(operation)) {
    return transient('Upload no longer on the server; starting it again');
  }

  const known = PERMANENT_MESSAGES[status];
  if (known) return permanent(known, status);
  // Unlisted 5xx: the server is struggling, and giving up would strand the report.
  if (status >= 500 && status <= 599)
    return transient(`Server error (HTTP ${status})`);
  // Unlisted 4xx (and anything stranger): retrying the same request will not change the answer.
  return permanent('Unexpected response from the server', status);
}

/** Exponential backoff with full jitter: a random delay in [0, min(cap, base * 2^attempt)). */
export function backoffDelay(attempt: number, random: () => number): number {
  const ceiling = Math.min(
    BACKOFF_CAP_MS,
    BACKOFF_BASE_MS * 2 ** Math.max(0, attempt),
  );
  return Math.floor(random() * ceiling);
}

/** Parses `Retry-After` (seconds or an HTTP date) into a delay in ms, or undefined if absent or invalid. */
export function parseRetryAfter(
  value: string | undefined,
  now: number,
): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  let delay: number;
  if (/^\d+$/.test(trimmed)) {
    delay = Number(trimmed) * 1000;
  } else {
    // HTTP dates start with a weekday ("Tue, 03 Nov ..."). Checking this first matters:
    // Date.parse alone accepts junk like "-5" (as the year 5 BC).
    if (!/^[A-Za-z]{3}/.test(trimmed)) return undefined;
    const at = Date.parse(trimmed);
    if (Number.isNaN(at)) return undefined;
    delay = at - now;
  }
  return Math.min(Math.max(0, delay), RETRY_AFTER_CAP_MS);
}

/**
 * The full decision for one failure. `attempt` counts consecutive failures for
 * this report (0 for the first). There is no attempt limit: giving up on a
 * transient failure would lose the report.
 */
export function decide(
  failure: Failure,
  attempt: number,
  env: { now: number; random: () => number },
): Decision {
  const { kind, message } = classify(failure);
  if (kind === 'permanent') return { retry: false, message };

  const retryAfter =
    failure.kind === 'http'
      ? parseRetryAfter(failure.retryAfter, env.now)
      : undefined;
  const delayMs = retryAfter ?? backoffDelay(attempt, env.random);
  return { retry: true, delayMs, message };
}
