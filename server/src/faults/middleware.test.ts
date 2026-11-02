import assert from 'node:assert/strict';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { DEFAULT_FAULTS, type FaultConfig, FaultState } from './config';
import { faultMiddleware } from './middleware';

// fetch sends no Content-Type for raw bytes, and the body parser needs one.
const BINARY = { 'Content-Type': 'application/octet-stream' };

describe('faultMiddleware', () => {
  const state = new FaultState();
  let roll = 0;
  let http: HttpServer;
  let base: string;

  before(async () => {
    const app = express();
    app.use(faultMiddleware(state, () => roll));
    app.use(express.raw({ type: '*/*', limit: '10mb' }));
    const ok: express.RequestHandler = (req, res) => {
      res.json({ ok: true, bytes: Buffer.isBuffer(req.body) ? req.body.length : 0 });
    };
    app.all(['/uploads', '/uploads/*splat', '/reports', '/health', '/admin/faults', '/files/x'], ok);
    http = app.listen(0);
    await new Promise((resolve) => http.once('listening', resolve));
    base = `http://localhost:${(http.address() as AddressInfo).port}`;
  });

  after(() => {
    http.closeAllConnections();
    http.close();
  });

  beforeEach(() => {
    state.reset();
    roll = 0;
  });

  function use(config: Partial<FaultConfig>): void {
    state.set({ ...DEFAULT_FAULTS, ...config });
  }

  async function status(path: string, init?: RequestInit): Promise<number> {
    return (await fetch(`${base}${path}`, init)).status;
  }

  it('passes everything through when mode is none', async () => {
    assert.equal(await status('/reports'), 200);
    assert.equal(await status('/uploads/abc'), 200);
  });

  it('returns the injected status, with Retry-After on 503', async () => {
    for (const [mode, code] of [['error500', 500], ['reject400', 400], ['reject413', 413]] as const) {
      use({ mode });
      assert.equal(await status('/reports'), code);
    }
    use({ mode: 'error503' });
    const res = await fetch(`${base}/reports`);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('Retry-After'), '5');
  });

  it('only faults the chosen target', async () => {
    use({ mode: 'error500', target: 'uploads' });
    assert.equal(await status('/uploads'), 500);
    assert.equal(await status('/uploads/abc'), 500);
    assert.equal(await status('/reports'), 200);
    assert.equal(await status('/files/x'), 200);
    use({ mode: 'error500', target: 'all' });
    assert.equal(await status('/files/x'), 500);
  });

  it('never faults admin or health', async () => {
    use({ mode: 'hang', target: 'all' });
    assert.equal(await status('/health'), 200);
    assert.equal(await status('/admin/faults'), 200);
  });

  it('applies the fault only when the roll is below probability', async () => {
    use({ mode: 'error500', probability: 0.3 });
    roll = 0.29;
    assert.equal(await status('/reports'), 500);
    roll = 0.3;
    assert.equal(await status('/reports'), 200);
  });

  it('hang never responds', async () => {
    use({ mode: 'hang' });
    await assert.rejects(fetch(`${base}/reports`, { signal: AbortSignal.timeout(300) }), { name: 'TimeoutError' });
  });

  it('drop cuts the connection', async () => {
    use({ mode: 'drop' });
    await assert.rejects(fetch(`${base}/reports`));
    await assert.rejects(fetch(`${base}/uploads/abc`, { method: 'PATCH', headers: BINARY, body: new Uint8Array(1024 * 1024) }));
  });

  it('adds latency', async () => {
    use({ latencyMs: 200 });
    const start = Date.now();
    assert.equal(await status('/reports'), 200);
    assert.ok(Date.now() - start >= 190);
  });

  it('throttles the request body and still delivers every byte', async () => {
    use({ bytesPerSecond: 1024 * 1024 });
    const start = Date.now();
    const res = await fetch(`${base}/uploads/abc`, { method: 'PATCH', headers: BINARY, body: new Uint8Array(2 * 1024 * 1024) });
    const elapsed = Date.now() - start;
    assert.deepEqual(await res.json(), { ok: true, bytes: 2 * 1024 * 1024 });
    // 2 MB at 1 MB/s: about 2 s. The first chunk is free, so allow some slack.
    assert.ok(elapsed >= 1500, `took only ${elapsed} ms`);
  });
});
