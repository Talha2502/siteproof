// In-memory stand-ins for every port, for tests. FakeServer follows the same
// rules as the real server (tus offsets, 409 on duplicate create, 422 on
// incomplete images, 200 on an identical report retry) and can be told to
// misbehave on the next request of a given kind.

import type { NewImage } from '../engine';
import {
  TransportFailure,
  type Clock,
  type CreateUploadRequest,
  type FileCleaner,
  type FileReader,
  type NetworkMonitor,
  type PatchUploadRequest,
  type ReportPayload,
  type ReportRepository,
  type TransportResponse,
  type UploadResponse,
  type UploadTransport,
} from '../ports';
import type { Operation } from '../retryPolicy';
import type { ImageProgress, LocalReport, ReportState } from '../types';

/** Lets every pending promise callback and zero-delay timer run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++)
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
}

function clone<T>(value: T): T {
  // Everything stored here is plain JSON data.
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

// ---------------------------------------------------------------- clock

export class FakeClock implements Clock {
  private time: number;
  private seq = 0;
  private timers: { at: number; seq: number; callback: () => void }[] = [];

  constructor(start = Date.parse('2026-11-03T09:00:00Z')) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, ms: number): () => void {
    const timer = {
      at: this.time + Math.max(0, ms),
      seq: this.seq++,
      callback,
    };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter(t => t !== timer);
    };
  }

  get pendingTimers(): number {
    return this.timers.length;
  }

  /** Jumps to the next timer and runs it. Returns false if there is none. */
  runNext(): boolean {
    this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const next = this.timers.shift();
    if (!next) return false;
    this.time = Math.max(this.time, next.at);
    next.callback();
    return true;
  }

  /** Moves time forward, running every timer that falls due on the way. */
  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    for (;;) {
      await settle();
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.timers[0];
      if (!next || next.at > target) break;
      this.runNext();
    }
    this.time = target;
    await settle();
  }
}

/** Runs timers until `done()` is true. Fails loudly if work stops with `done()` still false. */
export async function runUntil(
  clock: FakeClock,
  done: () => boolean,
  maxTimers = 2000,
): Promise<void> {
  for (let i = 0; i < maxTimers; i++) {
    await settle();
    if (done()) return;
    if (!clock.runNext()) {
      await settle();
      if (done()) return;
      throw new Error('Nothing left to run, but the condition is still false');
    }
  }
  throw new Error(`Condition still false after ${maxTimers} timers`);
}

// ---------------------------------------------------------------- repository

export class InMemoryRepository implements ReportRepository {
  readonly rows = new Map<string, LocalReport>();

  async list(): Promise<LocalReport[]> {
    return [...this.rows.values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }

  async get(id: string): Promise<LocalReport | undefined> {
    const row = this.rows.get(id);
    return row && clone(row);
  }

  async insert(report: LocalReport): Promise<void> {
    if (this.rows.has(report.id))
      throw new Error(`Duplicate report ${report.id}`);
    this.rows.set(report.id, clone(report));
  }

  async saveState(id: string, state: ReportState): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, ...clone(state) });
  }

  async saveImageProgress(
    reportId: string,
    imageId: string,
    progress: ImageProgress,
  ): Promise<void> {
    const row = this.rows.get(reportId);
    if (!row) return;
    this.rows.set(reportId, {
      ...row,
      images: row.images.map(image =>
        image.id === imageId ? { ...image, ...progress } : image,
      ),
    });
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

// ---------------------------------------------------------------- files

export class FakeFiles implements FileReader, FileCleaner {
  readonly files = new Map<string, Uint8Array>();
  private nextByte = 1;

  /** Creates a processed image of `size` bytes under reports/<reportId>/. */
  addImage(reportId: string, imageId: string, size: number): NewImage {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (this.nextByte + i * 7) % 256;
    this.nextByte++;
    const localPath = `reports/${reportId}/${imageId}.jpg`;
    this.files.set(localPath, bytes);
    return {
      id: imageId,
      localPath,
      sizeBytes: size,
      width: 2048,
      height: 1536,
    };
  }

  bytes(path: string): Uint8Array | undefined {
    return this.files.get(path);
  }

  async readChunk(
    path: string,
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    const bytes = this.files.get(path);
    if (!bytes) throw new Error(`ENOENT ${path}`);
    return bytes.slice(offset, offset + length);
  }

  async deleteReportFiles(reportId: string): Promise<void> {
    for (const path of [...this.files.keys()]) {
      if (path.startsWith(`reports/${reportId}/`)) this.files.delete(path);
    }
  }

  async listReportFolders(): Promise<string[]> {
    const folders = [...this.files.keys()].map(
      path => path.split('/')[1] ?? '',
    );
    return [...new Set(folders)];
  }
}

// ---------------------------------------------------------------- network

export class FakeNetwork implements NetworkMonitor {
  private reachable: boolean | undefined;
  private listeners = new Set<(reachable: boolean) => void>();

  constructor(reachable: boolean | undefined = true) {
    this.reachable = reachable;
  }

  isReachable(): boolean | undefined {
    return this.reachable;
  }

  set(reachable: boolean): void {
    this.reachable = reachable;
    for (const listener of this.listeners) listener(reachable);
  }

  subscribe(listener: (reachable: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// ---------------------------------------------------------------- server

export type Fault =
  /** Answer with this status and do nothing. */
  | { type: 'status'; status: number; retryAfter?: string }
  /** No response; the server never saw the request. */
  | { type: 'network' }
  /** PATCH only: the server stores the first half of the chunk, then the connection dies. */
  | { type: 'drop' }
  /** Never answer, until the client gives up (aborts). */
  | { type: 'hang' }
  /** The server does the work, but the response never reaches the client. */
  | { type: 'lostResponse' };

interface ServerUpload {
  reportId: string;
  size: number;
  bytes: Uint8Array;
  offset: number;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class FakeServer implements UploadTransport {
  readonly uploads = new Map<string, ServerUpload>();
  readonly reports = new Map<string, ReportPayload>();
  /** Report IDs in the order the server first stored them (one 201 each). */
  readonly created: string[] = [];
  /** One line per request, e.g. "PATCH img-1@262144". */
  readonly log: string[] = [];
  offline = false;
  private readonly faults: Record<Operation, Fault[]> = {
    headUpload: [],
    createUpload: [],
    patchUpload: [],
    putReport: [],
  };

  /** Queues faults for the next requests of this kind, in order. */
  fail(operation: Operation, ...faults: Fault[]): void {
    this.faults[operation].push(...faults);
  }

  count(prefix: string): number {
    return this.log.filter(line => line.startsWith(prefix)).length;
  }

  headUpload(imageId: string, signal: AbortSignal): Promise<UploadResponse> {
    return this.handle('headUpload', `HEAD ${imageId}`, signal, () => {
      const upload = this.uploads.get(imageId);
      return upload ? { status: 200, offset: upload.offset } : { status: 404 };
    });
  }

  createUpload(
    request: CreateUploadRequest,
    signal: AbortSignal,
  ): Promise<UploadResponse> {
    return this.handle(
      'createUpload',
      `POST ${request.imageId}`,
      signal,
      () => {
        if (this.uploads.has(request.imageId)) return { status: 409 };
        if (request.sizeBytes > MAX_UPLOAD_BYTES) return { status: 413 };
        this.uploads.set(request.imageId, {
          reportId: request.reportId,
          size: request.sizeBytes,
          bytes: new Uint8Array(request.sizeBytes),
          offset: 0,
        });
        return {
          status: 201,
          offset: 0,
          location: `/uploads/${request.imageId}`,
        };
      },
    );
  }

  patchUpload(
    request: PatchUploadRequest,
    signal: AbortSignal,
  ): Promise<UploadResponse> {
    const write = (count: number): UploadResponse => {
      const upload = this.uploads.get(request.imageId);
      if (!upload) return { status: 404 };
      if (request.offset !== upload.offset)
        return { status: 409, offset: upload.offset };
      const bytes = request.chunk.subarray(0, count);
      if (upload.offset + bytes.length > upload.size) return { status: 413 };
      upload.bytes.set(bytes, upload.offset);
      upload.offset += bytes.length;
      return { status: 204, offset: upload.offset };
    };
    return this.handle(
      'patchUpload',
      `PATCH ${request.imageId}@${request.offset}`,
      signal,
      () => {
        request.onProgress?.(request.chunk.length);
        return write(request.chunk.length);
      },
      () => {
        request.onProgress?.(Math.floor(request.chunk.length / 2));
        write(Math.floor(request.chunk.length / 2));
      },
    );
  }

  putReport(
    report: ReportPayload,
    signal: AbortSignal,
  ): Promise<TransportResponse> {
    return this.handle('putReport', `PUT ${report.id}`, signal, () => {
      for (const imageId of report.imageIds) {
        const upload = this.uploads.get(imageId);
        if (!upload || upload.offset !== upload.size) return { status: 422 };
      }
      const existing = this.reports.get(report.id);
      if (existing) {
        return {
          status:
            JSON.stringify(existing) === JSON.stringify(report) ? 200 : 409,
        };
      }
      this.reports.set(report.id, clone(report));
      this.created.push(report.id);
      return { status: 201 };
    });
  }

  private async handle<T extends TransportResponse>(
    operation: Operation,
    line: string,
    signal: AbortSignal,
    work: () => T,
    partial?: () => void,
  ): Promise<T> {
    await Promise.resolve();
    if (signal.aborted)
      throw new TransportFailure('Aborted', { aborted: true });
    if (this.offline) throw new TransportFailure('Network request failed');
    const fault = this.faults[operation].shift();
    this.log.push(fault ? `${line} !${fault.type}` : line);

    if (!fault) return work();
    switch (fault.type) {
      case 'status':
        return { status: fault.status, retryAfter: fault.retryAfter } as T;
      case 'network':
        throw new TransportFailure('Connection reset');
      case 'drop':
        partial?.();
        throw new TransportFailure('Connection reset');
      case 'lostResponse':
        work();
        throw new TransportFailure('Connection reset');
      case 'hang':
        return new Promise<T>((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(new TransportFailure('Aborted', { aborted: true })),
          );
        });
    }
  }
}
