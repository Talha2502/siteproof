// The engine's view of the outside world. adapters/ implements each of these
// with a native library; tests implement them with fakes.

import type { ImageProgress, LocalReport, ReportState } from './types';

/** Durable storage for the outbox (SQLite). The source of truth across launches. */
export interface ReportRepository {
  /** All reports, oldest `createdAt` first (the upload order). */
  list(): Promise<LocalReport[]>;
  get(id: string): Promise<LocalReport | undefined>;
  /** Writes the report and all its images in one transaction. */
  insert(report: LocalReport): Promise<void>;
  saveState(id: string, state: ReportState): Promise<void>;
  saveImageProgress(
    reportId: string,
    imageId: string,
    progress: ImageProgress,
  ): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Reads byte ranges of processed images in app storage. */
export interface FileReader {
  /** Returns up to `length` bytes starting at `offset`. */
  readChunk(path: string, offset: number, length: number): Promise<Uint8Array>;
}

/** Removes image files the app owns. */
export interface FileCleaner {
  /** Deletes `reports/<reportId>/` and everything in it. Succeeds if already gone. */
  deleteReportFiles(reportId: string): Promise<void>;
  /** Report IDs that have a folder on disk, to find orphans from a crash mid-Submit. */
  listReportFolders(): Promise<string[]>;
}

/** What the server said. A response of any status resolves; only a failed exchange rejects. */
export interface TransportResponse {
  status: number;
  /** Raw `Retry-After` header, if present. */
  retryAfter?: string;
}

export interface UploadResponse extends TransportResponse {
  /** `Upload-Offset` header, if present. */
  offset?: number;
  /** `Location` header, if present (on creation). */
  location?: string;
}

export interface CreateUploadRequest {
  imageId: string;
  reportId: string;
  sizeBytes: number;
}

export interface PatchUploadRequest {
  imageId: string;
  offset: number;
  chunk: Uint8Array;
  /** Called with the bytes of this chunk sent so far, so the engine can detect stalls. */
  onProgress?: (bytesSent: number) => void;
}

export interface ReportPayload {
  id: string;
  description: string;
  createdAt: string;
  imageIds: string[];
}

/**
 * HTTP to the server. Every call rejects with a `TransportFailure` when no
 * response arrives (offline, DNS, connection reset, aborted by `signal`).
 */
export interface UploadTransport {
  headUpload(imageId: string, signal: AbortSignal): Promise<UploadResponse>;
  createUpload(
    request: CreateUploadRequest,
    signal: AbortSignal,
  ): Promise<UploadResponse>;
  patchUpload(
    request: PatchUploadRequest,
    signal: AbortSignal,
  ): Promise<UploadResponse>;
  putReport(
    report: ReportPayload,
    signal: AbortSignal,
  ): Promise<TransportResponse>;
}

/** Thrown by an UploadTransport when the exchange failed without a response. */
export class TransportFailure extends Error {
  readonly aborted: boolean;

  constructor(message: string, options: { aborted?: boolean } = {}) {
    super(message);
    this.name = 'TransportFailure';
    this.aborted = options.aborted ?? false;
  }
}

export interface NetworkMonitor {
  /** Last known reachability; undefined until the first reading. */
  isReachable(): boolean | undefined;
  /** Calls `listener` whenever reachability changes. Returns an unsubscribe function. */
  subscribe(listener: (reachable: boolean) => void): () => void;
}

export interface Clock {
  /** Milliseconds since the epoch. */
  now(): number;
  /** Runs `callback` after `ms`. Returns a function that cancels it. */
  setTimeout(callback: () => void, ms: number): () => void;
}

export interface IdGenerator {
  /** A new random UUID (v4). */
  newId(): string;
}
