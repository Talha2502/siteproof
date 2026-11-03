import { CHUNK_SIZE, STALL_TIMEOUT_MS } from './deliverReport';
import { UploadEngine, type OutboxSnapshot } from './engine';
import type { PatchUploadRequest, UploadResponse } from './ports';
import { BACKOFF_CAP_MS } from './retryPolicy';
import {
  FakeClock,
  FakeFiles,
  FakeNetwork,
  FakeServer,
  InMemoryRepository,
  runUntil,
  sameBytes,
  settle,
} from './testing/fakes';

function setup() {
  const clock = new FakeClock();
  const repository = new InMemoryRepository();
  const files = new FakeFiles();
  const network = new FakeNetwork(true);
  const server = new FakeServer();
  const originals = new Map<string, Uint8Array>();
  let count = 0;

  const makeEngine = () =>
    new UploadEngine({
      repository,
      transport: server,
      files,
      cleaner: files,
      network,
      clock,
      random: () => 0.5,
    });

  const h = {
    clock,
    repository,
    files,
    network,
    server,
    engine: makeEngine(),
    /** Simulates a force-quit and relaunch: the old engine dies without saving, a new one starts from storage. */
    async relaunch() {
      h.engine.stop();
      await settle();
      h.engine = makeEngine();
      await h.engine.start();
    },
    async submit(sizes: number[], description = 'Cracked lintel above door') {
      await h.engine.start();
      count++;
      const id = `report-${count}`;
      const images = sizes.map((size, i) => {
        const image = files.addImage(id, `${id}-img${i + 1}`, size);
        originals.set(
          image.id,
          files.bytes(image.localPath) ?? new Uint8Array(),
        );
        return image;
      });
      await h.engine.submit({
        id,
        description,
        createdAt: new Date(clock.now() + count).toISOString(),
        images,
      });
      return id;
    },
    report(id: string) {
      return h.engine.getSnapshot().reports.find(r => r.id === id);
    },
    status(id: string) {
      return h.report(id)?.status;
    },
    settled() {
      return h.engine
        .getSnapshot()
        .reports.every(
          r => r.status === 'delivered' || r.status === 'needs_attention',
        );
    },
    run(done = () => h.settled()) {
      return runUntil(clock, done);
    },
    /** True if the server holds exactly the bytes the phone had for this image. */
    intact(imageId: string) {
      const upload = server.uploads.get(imageId);
      const original = originals.get(imageId);
      return (
        !!upload &&
        !!original &&
        upload.offset === original.length &&
        sameBytes(upload.bytes, original)
      );
    },
  };
  return h;
}

const BIG = 2 * CHUNK_SIZE + 100_000; // 3 chunks

describe('UploadEngine', () => {
  it('delivers a multi-chunk report, then deletes its local photos', async () => {
    const h = setup();
    const id = await h.submit([BIG, 1000]);
    await h.run();

    expect(h.status(id)).toBe('delivered');
    expect(h.server.created).toEqual([id]);
    expect(h.intact(`${id}-img1`)).toBe(true);
    expect(h.intact(`${id}-img2`)).toBe(true);
    expect(h.server.log.slice(0, 5)).toEqual([
      `HEAD ${id}-img1`,
      `POST ${id}-img1`,
      `PATCH ${id}-img1@0`,
      `PATCH ${id}-img1@${CHUNK_SIZE}`,
      `PATCH ${id}-img1@${2 * CHUNK_SIZE}`,
    ]);
    expect(await h.files.listReportFolders()).toEqual([]);
    expect(h.repository.rows.get(id)?.status).toBe('delivered');
  });

  it('sends reports one at a time, oldest first', async () => {
    const h = setup();
    const ids = [
      await h.submit([1000]),
      await h.submit([1000]),
      await h.submit([1000]),
    ];
    await h.run();

    expect(h.server.created).toEqual(ids);
    const firstOfSecond = h.server.log.findIndex(line =>
      line.includes('report-2'),
    );
    expect(firstOfSecond).toBeGreaterThan(h.server.log.indexOf('PUT report-1'));
  });

  it('resumes from the server offset after a connection drops mid-chunk', async () => {
    const h = setup();
    h.server.fail('patchUpload', { type: 'drop' });
    const id = await h.submit([BIG]);
    await h.run();

    expect(h.server.log).toContain(`PATCH ${id}-img1@${CHUNK_SIZE / 2}`);
    expect(h.intact(`${id}-img1`)).toBe(true);
    expect(h.server.created).toEqual([id]);
  });

  it('lost response on PUT: retries and the server still has exactly one report', async () => {
    const h = setup();
    h.server.fail('putReport', { type: 'lostResponse' });
    const id = await h.submit([1000]);
    await h.run();

    expect(h.status(id)).toBe('delivered');
    expect(h.server.count('PUT')).toBe(2);
    expect(h.server.created).toEqual([id]);
  });

  it('lost response on PATCH: continues from the server offset without resending', async () => {
    const h = setup();
    h.server.fail('patchUpload', { type: 'lostResponse' });
    const id = await h.submit([BIG]);
    await h.run();

    expect(h.server.count(`PATCH ${id}-img1@0`)).toBe(1);
    expect(h.intact(`${id}-img1`)).toBe(true);
  });

  it('lost response on upload creation: HEAD finds the upload and carries on', async () => {
    const h = setup();
    h.server.fail('createUpload', { type: 'lostResponse' });
    const id = await h.submit([1000]);
    await h.run();

    expect(h.server.count('POST')).toBe(1);
    expect(h.intact(`${id}-img1`)).toBe(true);
  });

  it('survives a force-quit mid-upload and resumes from the server offset', async () => {
    const h = setup();
    // Chunk 1 first gets a 503, then lands on the server but its response is lost.
    // The retry's HEAD learns the server has it; chunk 2 then hangs, and the app dies.
    h.server.fail(
      'patchUpload',
      { type: 'status', status: 503 },
      { type: 'lostResponse' },
      { type: 'hang' },
    );
    const id = await h.submit([BIG]);
    const img = `${id}-img1`;
    await h.run(() => h.server.log.some(line => line.endsWith('!hang')));

    // Storage was mid-upload, with the offset the server confirmed.
    expect(h.repository.rows.get(id)?.status).toBe('uploading');
    expect(h.repository.rows.get(id)?.images[0]?.uploadedBytes).toBe(
      CHUNK_SIZE,
    );

    await h.relaunch();
    await h.run();

    expect(h.status(id)).toBe('delivered');
    expect(h.intact(img)).toBe(true);
    // Chunk 1 was never sent again once the server had it.
    expect(h.server.log.filter(l => l.startsWith(`PATCH ${img}@0`))).toEqual([
      `PATCH ${img}@0 !status`,
      `PATCH ${img}@0 !lostResponse`,
    ]);
    expect(h.server.created).toEqual([id]);
  });

  it('stops on a permanent error and does not block the next report', async () => {
    const h = setup();
    h.server.fail('putReport', { type: 'status', status: 400 });
    const bad = await h.submit([1000]);
    const good = await h.submit([1000]);
    await h.run();
    await h.clock.advance(60 * 60_000);

    expect(h.status(bad)).toBe('needs_attention');
    expect(h.report(bad)?.lastError).toMatchObject({
      kind: 'permanent',
      message: 'The server rejected the request as invalid (HTTP 400)',
    });
    expect(h.server.count(`PUT ${bad}`)).toBe(1);
    expect(h.status(good)).toBe('delivered');
  });

  it('never gives up on transient errors, and backoff stays under the cap', async () => {
    const h = setup();
    const delays: number[] = [];
    h.engine.subscribe(() => {
      const report = h.engine.getSnapshot().reports[0];
      if (report?.nextAttemptAt)
        delays.push(Date.parse(report.nextAttemptAt) - h.clock.now());
    });
    h.server.fail(
      'putReport',
      ...Array.from(
        { length: 30 },
        () => ({ type: 'status', status: 503 } as const),
      ),
    );
    const id = await h.submit([1000]);
    await h.run();

    expect(h.status(id)).toBe('delivered');
    expect(h.server.count('PUT')).toBe(31);
    expect(Math.max(...delays)).toBeLessThanOrEqual(BACKOFF_CAP_MS);
    expect(delays.at(-1)).toBe(BACKOFF_CAP_MS / 2); // capped, with random() = 0.5
  });

  it('honours Retry-After', async () => {
    const h = setup();
    h.server.fail('putReport', {
      type: 'status',
      status: 503,
      retryAfter: '5',
    });
    const id = await h.submit([1000]);
    await h.run(() => h.report(id)?.lastError !== undefined);

    expect(Date.parse(h.report(id)?.nextAttemptAt ?? '') - h.clock.now()).toBe(
      5000,
    );
  });

  it('aborts a silent request after the stall timeout, not before', async () => {
    const h = setup();
    h.server.fail('patchUpload', { type: 'hang' });
    const id = await h.submit([1000]);
    await settle();

    await h.clock.advance(STALL_TIMEOUT_MS - 1000);
    expect(h.status(id)).toBe('uploading');
    expect(h.server.count('PATCH')).toBe(1);

    await h.clock.advance(1000);
    expect(h.report(id)?.lastError?.message).toBe('The connection stalled');
    await h.run();
    expect(h.status(id)).toBe('delivered');
  });

  it('does not cut off a slow transfer that keeps moving (stall timeout, not total timeout)', async () => {
    const h = setup();
    const slowPatch = h.server.patchUpload.bind(h.server);
    // Every chunk takes 3 x 20 s: well past 30 s in total, but never 30 s without progress.
    h.server.patchUpload = (request: PatchUploadRequest, signal: AbortSignal) =>
      new Promise<UploadResponse>((resolve, reject) => {
        let step = 0;
        const tick = () => {
          if (signal.aborted) return reject(new Error('aborted'));
          step++;
          request.onProgress?.(Math.floor((request.chunk.length * step) / 3));
          if (step < 3) h.clock.setTimeout(tick, 20_000);
          else slowPatch(request, signal).then(resolve, reject);
        };
        h.clock.setTimeout(tick, 20_000);
      });
    const id = await h.submit([BIG]);
    await h.run();

    expect(h.status(id)).toBe('delivered');
    expect(h.report(id)?.attempts).toBe(0);
    expect(h.server.count('PATCH')).toBe(3);
  });

  it('waits while offline, then sends as soon as the network returns', async () => {
    const h = setup();
    h.network.set(false);
    const id = await h.submit([1000]);
    await h.clock.advance(10 * 60_000);

    expect(h.server.log).toEqual([]);
    expect(h.status(id)).toBe('queued');
    expect(h.engine.getSnapshot().online).toBe(false);

    h.network.set(true);
    await h.run();
    expect(h.status(id)).toBe('delivered');
  });

  it('stops retrying while offline instead of burning attempts', async () => {
    const h = setup();
    h.server.fail('patchUpload', { type: 'network' });
    h.network.set(true);
    const id = await h.submit([1000]);
    h.network.set(false);
    await h.clock.advance(10 * 60_000);
    const requests = h.server.log.length;
    await h.clock.advance(10 * 60_000);

    expect(h.server.log.length).toBe(requests);
    h.network.set(true);
    await h.run();
    expect(h.status(id)).toBe('delivered');
  });

  it('wake() skips the backoff wait', async () => {
    const h = setup();
    h.server.fail(
      'putReport',
      ...Array.from(
        { length: 8 },
        () => ({ type: 'status', status: 503 } as const),
      ),
    );
    const id = await h.submit([1000]);
    await h.run(() => (h.report(id)?.attempts ?? 0) >= 8);
    expect(h.report(id)?.nextAttemptAt).toBeDefined();

    h.engine.wake();
    await settle();
    expect(h.status(id)).toBe('delivered');
  });

  it('recreates an upload that expired on the server, from zero', async () => {
    const h = setup();
    h.server.fail('patchUpload', { type: 'lostResponse' }, { type: 'hang' });
    const id = await h.submit([BIG]);
    const img = `${id}-img1`;
    await h.run(() => h.server.log.some(line => line.endsWith('!hang')));
    h.server.uploads.delete(img); // the server lost it; the hang ends in a stall
    await h.run();

    expect(h.server.count(`POST ${img}`)).toBe(2);
    expect(h.intact(img)).toBe(true);
    expect(h.status(id)).toBe('delivered');
  });

  it('marks a report whose photo vanished from the phone as needing attention', async () => {
    const h = setup();
    const broken = await h.submit([1000]);
    await h.files.deleteReportFiles(broken);
    const good = await h.submit([1000]);
    await h.run();

    expect(h.report(broken)?.lastError?.message).toBe(
      'A photo is missing from this phone',
    );
    expect(h.status(broken)).toBe('needs_attention');
    expect(h.status(good)).toBe('delivered');
  });

  it('remove() aborts an upload in flight and deletes the report and its photos', async () => {
    const h = setup();
    h.server.fail('patchUpload', { type: 'hang' });
    const id = await h.submit([BIG]);
    await settle();
    await h.engine.remove(id);
    const next = await h.submit([1000]);
    await h.run();

    expect(h.report(id)).toBeUndefined();
    expect(h.repository.rows.has(id)).toBe(false);
    expect(h.files.bytes(`reports/${id}/${id}-img1.jpg`)).toBeUndefined();
    expect(h.status(next)).toBe('delivered');
    expect(h.server.reports.has(id)).toBe(false);
  });

  it('on start, cleans up orphaned photos and photos of delivered reports', async () => {
    const h = setup();
    h.files.addImage('crashed-mid-submit', 'img', 100);
    const id = await h.submit([1000]);
    await h.run();
    h.files.addImage(id, 'leftover', 100); // e.g. delete after delivery failed
    await h.relaunch();

    expect(await h.files.listReportFolders()).toEqual([]);
  });

  it('removeAll() clears every report and folder on the phone, not the server', async () => {
    const h = setup();
    h.network.set(false);
    await h.submit([1000]);
    await h.submit([1000]);
    h.files.addImage('stray', 'img', 10);
    await h.engine.removeAll();

    expect(h.engine.getSnapshot().reports).toEqual([]);
    expect(h.repository.rows.size).toBe(0);
    expect(await h.files.listReportFolders()).toEqual([]);
  });

  it('refuses a submission before start(), which would race the orphan sweep', async () => {
    const h = setup();
    await expect(
      h.engine.submit({
        id: 'r',
        description: 'x',
        createdAt: '2026-11-03T09:00:00Z',
        images: [h.files.addImage('r', 'i', 10)],
      }),
    ).rejects.toThrow('start()');
  });

  it('rejects invalid reports before saving anything', async () => {
    const h = setup();
    await expect(h.submit([])).rejects.toThrow('1 to 5 photos');
    await expect(h.submit([1, 1, 1, 1, 1, 1])).rejects.toThrow('1 to 5 photos');
    await expect(h.submit([1000], '   ')).rejects.toThrow('description');
    await expect(h.submit([5 * 1024 * 1024 + 1])).rejects.toThrow('5 MB');
    expect(h.repository.rows.size).toBe(0);
  });

  it('publishes a new snapshot object on every change, for React', async () => {
    const h = setup();
    const seen: OutboxSnapshot[] = [];
    h.engine.subscribe(() => seen.push(h.engine.getSnapshot()));
    await h.submit([BIG]);
    await h.run();

    expect(new Set(seen).size).toBe(seen.length);
    const statuses = seen.map(s => s.reports[0]?.status);
    expect(statuses).toEqual(
      expect.arrayContaining([
        'queued',
        'uploading',
        'committing',
        'delivered',
      ]),
    );
    expect(seen.some(s => s.sending !== undefined)).toBe(true);
  });
});
