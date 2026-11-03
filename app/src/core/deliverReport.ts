// Sends one report: each unfinished image over tus (HEAD, then POST or resume,
// then PATCH in chunks), then PUT /reports/:id. The server is the source of
// truth for how much of an image it has, so every attempt starts with a HEAD.

import {
  TransportFailure,
  type Clock,
  type FileReader,
  type TransportResponse,
  type UploadTransport,
} from './ports';
import type { Failure, Operation } from './retryPolicy';
import type { ImageProgress, LocalImage, LocalReport } from './types';

export const CHUNK_SIZE = 256 * 1024;
/** Abort if no byte moves, or no response arrives, for this long. Not a total timeout: 2G uploads take minutes. */
export const STALL_TIMEOUT_MS = 30_000;

export interface DeliveryDeps {
  transport: UploadTransport;
  files: FileReader;
  clock: Clock;
}

export interface DeliveryHooks {
  /** The server confirmed new progress for an image. Must be durably saved before resolving. */
  onImageProgress(imageId: string, progress: ImageProgress): Promise<void>;
  /** Bytes of the current chunk sent so far (not yet confirmed). For progress display only. */
  onSending?(imageId: string, sentBytes: number): void;
  /** All images are uploaded; the report itself is about to be sent. */
  onCommitting(): Promise<void>;
}

export type DeliveryOutcome =
  | { kind: 'delivered' }
  /** `progressed`: the server confirmed new bytes during this attempt (resets backoff). */
  | { kind: 'failed'; failure: Failure; progressed: boolean }
  /** The caller aborted (report removed, app reset, engine stopped). */
  | { kind: 'cancelled' };

class DeliveryFailure extends Error {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(failure.kind);
    this.failure = failure;
  }
}

class Cancelled extends Error {}

function httpFailure(
  operation: Operation,
  response: TransportResponse,
): DeliveryFailure {
  return new DeliveryFailure({
    kind: 'http',
    operation,
    status: response.status,
    retryAfter: response.retryAfter,
  });
}

function unexpected(message: string): DeliveryFailure {
  return new DeliveryFailure({ kind: 'unexpected', message });
}

/**
 * Runs one request with a stall watchdog. The watchdog restarts whenever
 * `touch` is called (on upload progress), so a slow but moving transfer is
 * never cut off; a silent one is aborted after STALL_TIMEOUT_MS.
 */
async function guarded<T>(
  clock: Clock,
  outer: AbortSignal,
  run: (signal: AbortSignal, touch: () => void) => Promise<T>,
): Promise<T> {
  if (outer.aborted) throw new Cancelled();
  const controller = new AbortController();
  let stalled = false;
  let cancelTimer = () => {};
  const touch = () => {
    cancelTimer();
    cancelTimer = clock.setTimeout(() => {
      stalled = true;
      controller.abort();
    }, STALL_TIMEOUT_MS);
  };
  const onOuterAbort = () => controller.abort();
  outer.addEventListener('abort', onOuterAbort);
  touch();
  try {
    return await run(controller.signal, touch);
  } catch (err) {
    if (outer.aborted) throw new Cancelled();
    if (stalled) throw new DeliveryFailure({ kind: 'stall' });
    if (err instanceof TransportFailure)
      throw new DeliveryFailure({ kind: 'network' });
    throw err;
  } finally {
    cancelTimer();
    outer.removeEventListener('abort', onOuterAbort);
  }
}

export async function deliverReport(
  report: LocalReport,
  deps: DeliveryDeps,
  hooks: DeliveryHooks,
  signal: AbortSignal,
): Promise<DeliveryOutcome> {
  const { transport, files, clock } = deps;
  let progressed = false;

  async function uploadImage(image: LocalImage): Promise<void> {
    const size = image.sizeBytes;
    let uploadUrl = image.uploadUrl;
    let offset: number;

    const head = await guarded(clock, signal, s =>
      transport.headUpload(image.id, s),
    );
    if (head.status === 200) {
      if (head.offset === undefined || head.offset > size) {
        throw unexpected('The server reported an invalid upload offset');
      }
      offset = head.offset;
    } else if (head.status === 404 || head.status === 410) {
      // Not created yet, or expired on the server: start this image from zero.
      const created = await guarded(clock, signal, s =>
        transport.createUpload(
          { imageId: image.id, reportId: report.id, sizeBytes: size },
          s,
        ),
      );
      if (created.status !== 201) throw httpFailure('createUpload', created);
      offset = 0;
      uploadUrl = created.location ?? uploadUrl;
    } else {
      throw httpFailure('headUpload', head);
    }

    // Record the server's offset even if it is behind what we last saved.
    await hooks.onImageProgress(image.id, {
      uploadUrl,
      uploadedBytes: offset,
      done: offset === size,
    });

    while (offset < size) {
      const length = Math.min(CHUNK_SIZE, size - offset);
      let chunk: Uint8Array;
      try {
        chunk = await files.readChunk(image.localPath, offset, length);
      } catch {
        throw new DeliveryFailure({
          kind: 'localFile',
          message: 'A photo is missing from this phone',
        });
      }
      if (chunk.length !== length) {
        throw new DeliveryFailure({
          kind: 'localFile',
          message: 'A photo on this phone is damaged',
        });
      }

      const chunkOffset = offset;
      const response = await guarded(clock, signal, (s, touch) =>
        transport.patchUpload(
          {
            imageId: image.id,
            offset: chunkOffset,
            chunk,
            onProgress: sent => {
              touch();
              hooks.onSending?.(image.id, sent);
            },
          },
          s,
        ),
      );
      if (response.status !== 204) throw httpFailure('patchUpload', response);
      const next = response.offset;
      if (next === undefined || next <= chunkOffset || next > size) {
        throw unexpected('The server reported an invalid upload offset');
      }

      offset = next;
      progressed = true;
      await hooks.onImageProgress(image.id, {
        uploadUrl,
        uploadedBytes: offset,
        done: offset === size,
      });
    }
  }

  try {
    for (const image of report.images) {
      if (!image.done) await uploadImage(image);
    }

    await hooks.onCommitting();
    const response = await guarded(clock, signal, s =>
      transport.putReport(
        {
          id: report.id,
          description: report.description,
          createdAt: report.createdAt,
          imageIds: report.images.map(image => image.id),
        },
        s,
      ),
    );
    // 201: created now. 200: it was already there (our earlier response was lost).
    if (response.status === 201 || response.status === 200) {
      return { kind: 'delivered' };
    }
    throw httpFailure('putReport', response);
  } catch (err) {
    if (err instanceof Cancelled || signal.aborted)
      return { kind: 'cancelled' };
    if (err instanceof DeliveryFailure) {
      return { kind: 'failed', failure: err.failure, progressed };
    }
    // Saving progress failed, or a bug: keep the report and retry later.
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: 'failed',
      failure: { kind: 'unexpected', message },
      progressed,
    };
  }
}
