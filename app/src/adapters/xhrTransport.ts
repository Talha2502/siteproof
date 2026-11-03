import {
  TransportFailure,
  type CreateUploadRequest,
  type PatchUploadRequest,
  type ReportPayload,
  type TransportResponse,
  type UploadResponse,
  type UploadTransport,
} from '../core/ports';

// XMLHttpRequest rather than fetch: React Native's fetch has no upload
// progress, and progress is what feeds the stall watchdog and the UI.

const TUS_VERSION = '1.0.0';
const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of an ASCII string (tus metadata values are IDs and MIME types). */
/* eslint-disable no-bitwise -- base64 is bit manipulation */
export function asciiToBase64(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 3) {
    const a = value.charCodeAt(i);
    const b = i + 1 < value.length ? value.charCodeAt(i + 1) : NaN;
    const c = i + 2 < value.length ? value.charCodeAt(i + 2) : NaN;
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += BASE64[(n >> 18) & 63];
    out += BASE64[(n >> 12) & 63];
    out += Number.isNaN(b) ? '=' : BASE64[(n >> 6) & 63];
    out += Number.isNaN(c) ? '=' : BASE64[n & 63];
  }
  return out;
}
/* eslint-enable no-bitwise */

interface RawResponse {
  status: number;
  header(name: string): string | undefined;
}

interface RequestOptions {
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal: AbortSignal;
  onUploadProgress?: (loaded: number) => void;
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

export interface XhrTransportOptions {
  /** Server base URL, read on every request so a Settings change applies immediately. */
  baseUrl: () => string;
  /** For tests. */
  createXhr?: () => XMLHttpRequest;
}

export class XhrTransport implements UploadTransport {
  private readonly baseUrl: () => string;
  private readonly createXhr: () => XMLHttpRequest;

  constructor(options: XhrTransportOptions) {
    this.baseUrl = options.baseUrl;
    this.createXhr = options.createXhr ?? (() => new XMLHttpRequest());
  }

  async headUpload(
    imageId: string,
    signal: AbortSignal,
  ): Promise<UploadResponse> {
    const res = await this.request('HEAD', `/uploads/${imageId}`, {
      headers: { 'Tus-Resumable': TUS_VERSION, 'Cache-Control': 'no-store' },
      signal,
    });
    return this.uploadResponse(res);
  }

  async createUpload(
    request: CreateUploadRequest,
    signal: AbortSignal,
  ): Promise<UploadResponse> {
    const metadata = [
      `uploadId ${asciiToBase64(request.imageId)}`,
      `reportId ${asciiToBase64(request.reportId)}`,
      `filetype ${asciiToBase64('image/jpeg')}`,
    ].join(',');
    const res = await this.request('POST', '/uploads', {
      headers: {
        'Tus-Resumable': TUS_VERSION,
        'Upload-Length': String(request.sizeBytes),
        'Upload-Metadata': metadata,
      },
      signal,
    });
    return this.uploadResponse(res);
  }

  async patchUpload(
    request: PatchUploadRequest,
    signal: AbortSignal,
  ): Promise<UploadResponse> {
    const res = await this.request('PATCH', `/uploads/${request.imageId}`, {
      headers: {
        'Tus-Resumable': TUS_VERSION,
        'Upload-Offset': String(request.offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      body: request.chunk,
      signal,
      onUploadProgress: request.onProgress,
    });
    return this.uploadResponse(res);
  }

  async putReport(
    report: ReportPayload,
    signal: AbortSignal,
  ): Promise<TransportResponse> {
    const res = await this.request('PUT', `/reports/${report.id}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: report.description,
        createdAt: report.createdAt,
        imageIds: report.imageIds,
      }),
      signal,
    });
    return { status: res.status, retryAfter: res.header('Retry-After') };
  }

  private uploadResponse(res: RawResponse): UploadResponse {
    return {
      status: res.status,
      retryAfter: res.header('Retry-After'),
      offset: toInt(res.header('Upload-Offset')),
      location: res.header('Location'),
    };
  }

  private request(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<RawResponse> {
    const { headers = {}, body, signal, onUploadProgress } = options;
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new TransportFailure('Aborted', { aborted: true }));
        return;
      }
      const xhr = this.createXhr();
      const onAbort = () => xhr.abort();
      const settle = (fn: () => void) => {
        signal.removeEventListener('abort', onAbort);
        fn();
      };

      xhr.open(method, `${this.baseUrl().replace(/\/+$/, '')}${path}`);
      for (const [name, value] of Object.entries(headers)) {
        xhr.setRequestHeader(name, value);
      }
      // No total timeout: the engine's stall watchdog decides when to give up.
      xhr.timeout = 0;
      xhr.onload = () =>
        settle(() => {
          // Some platforms report a failed exchange as a "load" with status 0.
          if (xhr.status === 0) {
            reject(new TransportFailure('Network request failed'));
            return;
          }
          resolve({
            status: xhr.status,
            header: name => xhr.getResponseHeader(name) ?? undefined,
          });
        });
      xhr.onerror = () =>
        settle(() => reject(new TransportFailure('Network request failed')));
      xhr.ontimeout = () =>
        settle(() => reject(new TransportFailure('Request timed out')));
      xhr.onabort = () =>
        settle(() =>
          reject(new TransportFailure('Aborted', { aborted: true })),
        );
      if (onUploadProgress) {
        xhr.upload.onprogress = event => onUploadProgress(event.loaded);
      }
      signal.addEventListener('abort', onAbort);
      xhr.send(body ?? null);
    });
  }
}
