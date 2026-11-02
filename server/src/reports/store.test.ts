import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { ReportInput } from '../types';
import { ReportStore } from './store';

const ID = '0b6a7c1e-5f2d-4e3a-9b8c-0123456789ab';
const IMG = '6f1c2a8e-1d3b-4c5e-9f00-112233445566';

const input: ReportInput = {
  description: 'Cracked lintel',
  createdAt: '2026-11-03T09:15:00.000Z',
  imageIds: [IMG],
};

describe('ReportStore', () => {
  let dir: string;
  let store: ReportStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'siteproof-store-'));
    store = new ReportStore(dir);
    await store.init();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates once, then returns the stored copy for an identical retry', async () => {
    const first = await store.put(ID, input, new Date('2026-11-03T10:00:00Z'));
    const retry = await store.put(ID, input, new Date('2026-11-03T10:05:00Z'));

    assert.equal(first.outcome, 'created');
    assert.equal(retry.outcome, 'unchanged');
    // The retry must not overwrite the original receivedAt.
    assert.equal(retry.report.receivedAt, '2026-11-03T10:00:00.000Z');
    assert.equal((await store.list()).length, 1);
  });

  it('reports a conflict for different content and keeps the original', async () => {
    await store.put(ID, input);
    const result = await store.put(ID, { ...input, description: 'Something else' });

    assert.equal(result.outcome, 'conflict');
    assert.equal((await store.get(ID))?.description, 'Cracked lintel');
  });

  it('treats image order as part of the content', async () => {
    const other = '7a2d3b9f-2e4c-4d6f-8a11-223344556677';
    await store.put(ID, { ...input, imageIds: [IMG, other] });
    assert.equal((await store.put(ID, { ...input, imageIds: [other, IMG] })).outcome, 'conflict');
  });

  it('treats IDs case-insensitively', async () => {
    await store.put(ID.toUpperCase(), input);
    assert.equal((await store.put(ID, input)).outcome, 'unchanged');
    assert.equal((await store.get(ID.toUpperCase()))?.id, ID);
  });

  it('serialises concurrent first PUTs for the same ID into one create', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => store.put(ID, input)));
    assert.equal(results.filter((r) => r.outcome === 'created').length, 1);
    assert.equal(results.filter((r) => r.outcome === 'unchanged').length, 19);
  });

  it('leaves no temp files behind', async () => {
    await store.put(ID, input);
    assert.deepEqual(await readdir(dir), [`${ID}.json`]);
  });

  it('lists newest receivedAt first', async () => {
    const older = '11111111-1111-4111-8111-111111111111';
    const newer = '22222222-2222-4222-8222-222222222222';
    await store.put(older, input, new Date('2026-11-03T08:00:00Z'));
    await store.put(newer, input, new Date('2026-11-03T09:00:00Z'));
    assert.deepEqual((await store.list()).map((r) => r.id), [newer, older]);
  });

  it('returns undefined for an unknown ID and refuses non-UUID IDs', async () => {
    assert.equal(await store.get(ID), undefined);
    await assert.rejects(store.get('../../etc/passwd'));
    await assert.rejects(store.put('../escape', input));
  });
});
