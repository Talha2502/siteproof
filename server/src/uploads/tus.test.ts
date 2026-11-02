import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { MAX_IMAGE_BYTES } from '../config';
import { createTusServer, NonTruncatingFileStore, uploadRoutes } from './tus';

const TUS = { 'Tus-Resumable': '1.0.0' };

function metadata(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`)
    .join(',');
}

describe('tus uploads', () => {
  let dir: string;
  let http: HttpServer;
  let base: string;

  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'siteproof-tus-'));
    const app = express();
    app.use(uploadRoutes(createTusServer(new NonTruncatingFileStore({ directory: dir }))));
    http = app.listen(0);
    await new Promise((resolve) => http.once('listening', resolve));
    base = `http://localhost:${(http.address() as AddressInfo).port}`;
  });

  after(async () => {
    http.close();
    await rm(dir, { recursive: true, force: true });
  });

  function create(id: string, size: number, filetype = 'image/jpeg') {
    return fetch(`${base}/uploads`, {
      method: 'POST',
      headers: { ...TUS, 'Upload-Length': String(size), 'Upload-Metadata': metadata({ uploadId: id, filetype }) },
    });
  }

  function patch(id: string, offset: number, body: Uint8Array<ArrayBuffer>) {
    return fetch(`${base}/uploads/${id}`, {
      method: 'PATCH',
      headers: { ...TUS, 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
      body,
    });
  }

  async function offsetOf(id: string): Promise<number | undefined> {
    const res = await fetch(`${base}/uploads/${id}`, { method: 'HEAD', headers: TUS });
    return res.status === 200 ? Number(res.headers.get('Upload-Offset')) : undefined;
  }

  it('uses the client-chosen ID, lowercased', async () => {
    const id = 'AAAAAAAA-0000-4000-8000-000000000001';
    const res = await create(id, 10);
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('Location'), `/uploads/${id.toLowerCase()}`);
    assert.equal(await offsetOf(id), 0);
  });

  it('never truncates on a duplicate POST', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000002';
    assert.equal((await create(id, 10)).status, 201);
    assert.equal((await patch(id, 0, new Uint8Array(4))).status, 204);

    const duplicate = await create(id, 10);
    assert.equal(duplicate.status, 409);
    assert.equal(await offsetOf(id), 4);
  });

  it('resumes from the server offset', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000003';
    await create(id, 6);
    await patch(id, 0, new Uint8Array(3));
    const res = await patch(id, 3, new Uint8Array(3));
    assert.equal(res.status, 204);
    assert.equal(await offsetOf(id), 6);
  });

  it('rejects a stale offset with 409', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000004';
    await create(id, 6);
    await patch(id, 0, new Uint8Array(3));
    assert.equal((await patch(id, 0, new Uint8Array(3))).status, 409);
  });

  it('rejects bad IDs, non-JPEGs and oversized uploads', async () => {
    assert.equal((await create('not-a-uuid', 10)).status, 400);
    assert.equal((await create('aaaaaaaa-0000-4000-8000-000000000005', 10, 'image/png')).status, 415);
    assert.equal((await create('aaaaaaaa-0000-4000-8000-000000000006', MAX_IMAGE_BYTES + 1)).status, 413);
    assert.equal((await create('aaaaaaaa-0000-4000-8000-000000000007', MAX_IMAGE_BYTES)).status, 201);
  });

  it('returns 404 for unknown or malformed upload IDs', async () => {
    assert.equal(await offsetOf('aaaaaaaa-0000-4000-8000-0000000000ff'), undefined);
    const res = await fetch(`${base}/uploads/..%2Fsecret`, { method: 'HEAD', headers: TUS });
    assert.equal(res.status, 404);
  });
});
