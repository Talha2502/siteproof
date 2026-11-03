import {
  BACKOFF_CAP_MS,
  RETRY_AFTER_CAP_MS,
  backoffDelay,
  classify,
  decide,
  parseRetryAfter,
  type Failure,
  type Operation,
} from './retryPolicy';

const UPLOAD_OPS: Operation[] = ['headUpload', 'createUpload', 'patchUpload'];
const ALL_OPS: Operation[] = [...UPLOAD_OPS, 'putReport'];

function http(
  operation: Operation,
  status: number,
  retryAfter?: string,
): Failure {
  return { kind: 'http', operation, status, retryAfter };
}

const NOW = Date.parse('2026-11-03T12:00:00Z');
const env = (random = 0.5) => ({ now: NOW, random: () => random });

describe('classify', () => {
  it('treats no response as transient', () => {
    expect(classify({ kind: 'network' }).kind).toBe('transient');
    expect(classify({ kind: 'stall' }).kind).toBe('transient');
  });

  it.each([408, 425, 429, 500, 502, 503, 504])(
    'treats HTTP %i as transient on every operation',
    status => {
      for (const op of ALL_OPS)
        expect(classify(http(op, status)).kind).toBe('transient');
    },
  );

  it.each([400, 401, 403, 413, 415, 422])(
    'treats HTTP %i as permanent on every operation',
    status => {
      for (const op of ALL_OPS)
        expect(classify(http(op, status)).kind).toBe('permanent');
    },
  );

  it('treats 409 on an upload as transient (re-HEAD) but 409 on the report as permanent', () => {
    for (const op of UPLOAD_OPS)
      expect(classify(http(op, 409)).kind).toBe('transient');
    expect(classify(http('putReport', 409))).toEqual({
      kind: 'permanent',
      message:
        'A different report with this ID is already on the server (HTTP 409)',
    });
  });

  it('treats an upload that vanished (404/410) as transient, so it is recreated', () => {
    for (const op of UPLOAD_OPS) {
      expect(classify(http(op, 404)).kind).toBe('transient');
      expect(classify(http(op, 410)).kind).toBe('transient');
    }
  });

  it('treats 404 on the report endpoint as permanent (wrong server, not a vanished upload)', () => {
    expect(classify(http('putReport', 404)).kind).toBe('permanent');
  });

  it('treats unlisted 5xx as transient and unlisted 4xx or 3xx as permanent', () => {
    expect(classify(http('patchUpload', 507)).kind).toBe('transient');
    expect(classify(http('putReport', 418)).kind).toBe('permanent');
    expect(classify(http('putReport', 302)).kind).toBe('permanent');
  });

  it('gives permanent failures a message fit for "Not sent · <reason>"', () => {
    expect(classify(http('patchUpload', 413)).message).toBe(
      'A photo is too large for the server (HTTP 413)',
    );
    expect(classify(http('putReport', 418)).message).toBe(
      'Unexpected response from the server (HTTP 418)',
    );
  });
});

describe('backoffDelay', () => {
  it('grows exponentially from 1 s, with full jitter', () => {
    expect(backoffDelay(0, () => 0.999)).toBe(999);
    expect(backoffDelay(3, () => 0.999)).toBe(7992);
    expect(backoffDelay(3, () => 0)).toBe(0);
    expect(backoffDelay(3, () => 0.5)).toBe(4000);
  });

  it('never exceeds the 60 s cap, even after many attempts', () => {
    for (const attempt of [6, 10, 100, 5000]) {
      expect(backoffDelay(attempt, () => 0.999999)).toBeLessThan(
        BACKOFF_CAP_MS,
      );
    }
  });

  it('treats a negative attempt like the first', () => {
    expect(backoffDelay(-5, () => 0.5)).toBe(500);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds', () => {
    expect(parseRetryAfter('5', NOW)).toBe(5000);
    expect(parseRetryAfter(' 0 ', NOW)).toBe(0);
  });

  it('reads an HTTP date relative to now, never negative', () => {
    expect(parseRetryAfter('Tue, 03 Nov 2026 12:00:30 GMT', NOW)).toBe(30_000);
    expect(parseRetryAfter('Tue, 03 Nov 2026 11:00:00 GMT', NOW)).toBe(0);
  });

  it('caps absurd values', () => {
    expect(parseRetryAfter('999999', NOW)).toBe(RETRY_AFTER_CAP_MS);
  });

  it('ignores missing or garbage values', () => {
    expect(parseRetryAfter(undefined, NOW)).toBeUndefined();
    expect(parseRetryAfter('soon', NOW)).toBeUndefined();
    expect(parseRetryAfter('-5', NOW)).toBeUndefined();
  });
});

describe('decide', () => {
  it('retries transient failures with backoff', () => {
    expect(decide({ kind: 'network' }, 2, env(0.5))).toEqual({
      retry: true,
      delayMs: 2000,
      message: 'No connection to the server',
    });
  });

  it('honours Retry-After instead of backoff', () => {
    expect(decide(http('putReport', 503, '5'), 10, env(0.999))).toMatchObject({
      retry: true,
      delayMs: 5000,
    });
  });

  it('falls back to backoff when Retry-After is invalid', () => {
    expect(decide(http('putReport', 503, 'later'), 1, env(0.5))).toMatchObject({
      retry: true,
      delayMs: 1000,
    });
  });

  it('never gives up on a transient failure, however many attempts', () => {
    expect(decide({ kind: 'stall' }, 1_000_000, env()).retry).toBe(true);
  });

  it('stops on a permanent failure, ignoring Retry-After', () => {
    expect(decide(http('putReport', 422, '5'), 0, env())).toEqual({
      retry: false,
      message: "The server couldn't accept the report's photos (HTTP 422)",
    });
  });
});
