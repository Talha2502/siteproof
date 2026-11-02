import type { Request, RequestHandler } from 'express';
import { UPLOAD_PATH } from '../config';
import type { FaultConfig, FaultMode, FaultTarget, FaultState } from './config';

const ERRORS: Partial<Record<FaultMode, { status: number; code: string }>> = {
  error500: { status: 500, code: 'fault_error500' },
  error503: { status: 503, code: 'fault_error503' },
  reject400: { status: 400, code: 'fault_reject400' },
  reject413: { status: 413, code: 'fault_reject413' },
};

const THROTTLE_TICK_MS = 50;

/** Which fault target a request belongs to, or undefined if it is never faulted. */
function targetOf(req: Request): Exclude<FaultTarget, 'all'> | 'other' | undefined {
  if (req.path.startsWith('/admin') || req.path === '/health') return undefined;
  if (req.path === UPLOAD_PATH || req.path.startsWith(`${UPLOAD_PATH}/`)) return 'uploads';
  if (req.path.startsWith('/reports')) return 'reports';
  return 'other';
}

function matches(config: FaultConfig, req: Request): boolean {
  const target = targetOf(req);
  if (target === undefined) return false;
  return config.target === 'all' || config.target === target;
}

function bodyLength(req: Request): number {
  return Number(req.headers['content-length'] ?? 0) || 0;
}

/**
 * Limits how fast whoever reads the body (tus, the JSON parser) receives it.
 *
 * Pausing the socket does not work: Node's HTTP parser keeps reading it. Pausing
 * the request does, and a paused request stops pulling from the socket, so TCP
 * backpressure holds the client back as on a slow link. Readers call pause() and
 * resume() for their own backpressure, so those are wrapped: the request only
 * flows when the reader wants data *and* the byte budget allows it.
 */
function throttle(req: Request, bytesPerSecond: number): void {
  const pause = req.pause.bind(req);
  const resume = req.resume.bind(req);
  const startTime = Date.now();
  let received = 0;
  let readerPaused = false;

  const overBudget = () => received > ((Date.now() - startTime) / 1000) * bytesPerSecond;
  // Our own listener is one; only flow once a real reader is attached, or its data would be lost.
  const readerAttached = () => req.listenerCount('data') > 1;
  const update = () => {
    if (overBudget()) pause();
    else if (!readerPaused && readerAttached()) resume();
  };

  req.pause = () => {
    readerPaused = true;
    pause();
    return req;
  };
  req.resume = () => {
    readerPaused = false;
    update();
    return req;
  };

  pause();
  req.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (overBudget()) pause();
  });
  const timer = setInterval(update, THROTTLE_TICK_MS);
  req.once('close', () => clearInterval(timer));
}

/**
 * Cuts the connection once about half the body has arrived, or at once if there
 * is no body. Counts bytes as Node's HTTP parser hands them to the request, so
 * the reader still gets the first half and an upload keeps a partial file.
 */
function dropMidRequest(req: Request): void {
  const half = bodyLength(req) / 2;
  if (half === 0) {
    req.socket.destroy();
    return;
  }
  const push = req.push.bind(req);
  let received = 0;
  req.push = (chunk: unknown, encoding?: BufferEncoding) => {
    if (chunk instanceof Buffer) {
      received += chunk.length;
      if (received >= half) {
        req.socket.destroy();
        return false;
      }
    }
    return push(chunk, encoding);
  };
}

export function faultMiddleware(state: FaultState, random: () => number = Math.random): RequestHandler {
  return async (req, res, next) => {
    const config = state.get();
    if (!matches(config, req)) {
      next();
      return;
    }

    if (config.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, config.latencyMs));
    if (config.bytesPerSecond !== undefined) throttle(req, config.bytesPerSecond);

    const faulted = config.mode !== 'none' && random() < config.probability;
    if (!faulted) {
      next();
      return;
    }

    const error = ERRORS[config.mode];
    if (error) {
      if (config.mode === 'error503') res.set('Retry-After', '5');
      res.status(error.status).json({ error: { code: error.code, message: `Injected fault: ${config.mode}` } });
      return;
    }
    if (config.mode === 'hang') return; // Accept the request and never respond.
    if (config.mode === 'drop') {
      dropMidRequest(req);
      // Let an upload start, so the server keeps a partial file the client must resume from.
      if (bodyLength(req) > 0) next();
    }
  };
}
