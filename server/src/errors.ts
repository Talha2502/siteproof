import type { ErrorRequestHandler } from 'express';

/** An error that maps directly to an HTTP response `{ error: { code, message } }`. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // express.json() raises errors carrying a `status` (400 bad JSON, 413 too large).
  if (err instanceof Error && 'status' in err && typeof err.status === 'number' && err.status < 500) {
    res.status(err.status).json({ error: { code: 'bad_request', message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Internal server error' } });
};
