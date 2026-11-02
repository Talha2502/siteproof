import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Upload } from '@tus/server';
import { UploadedImages } from './files';
import { NonTruncatingFileStore } from './tus';

const ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe('UploadedImages.check', () => {
  let dir: string;
  let store: NonTruncatingFileStore;
  let images: UploadedImages;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'siteproof-files-'));
    store = new NonTruncatingFileStore({ directory: dir });
    images = new UploadedImages(store);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function upload(bytes: Buffer, size = bytes.length, filetype = 'image/jpeg') {
    await store.create(new Upload({ id: ID, size, offset: 0, metadata: { filetype } }));
    await store.write(Readable.from([bytes]), ID, 0);
  }

  it('accepts a complete JPEG', async () => {
    await upload(JPEG);
    const result = await images.check(ID);
    assert.equal(result.ok, true);
  });

  it('reports a missing upload', async () => {
    const result = await images.check(ID);
    assert.equal(result.ok === false && result.code, 'image_missing');
  });

  it('reports a partial upload', async () => {
    await upload(JPEG.subarray(0, 4), JPEG.length);
    const result = await images.check(ID);
    assert.equal(result.ok === false && result.code, 'image_incomplete');
  });

  it('rejects bytes that are not a JPEG, even if declared as one', async () => {
    await upload(Buffer.from('not a jpeg'));
    const result = await images.check(ID);
    assert.equal(result.ok === false && result.code, 'image_not_jpeg');
  });
});
