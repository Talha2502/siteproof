import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ReportInput, StoredReport } from '../types';
import { normaliseUuid } from './validate';

export type PutResult =
  | { outcome: 'created'; report: StoredReport }
  | { outcome: 'unchanged'; report: StoredReport }
  | { outcome: 'conflict'; report: StoredReport };

const REPORT_FILE_RE = /^[0-9a-f-]{36}\.json$/;

function sameContent(a: ReportInput, b: ReportInput): boolean {
  return (
    a.description === b.description &&
    a.createdAt === b.createdAt &&
    a.imageIds.length === b.imageIds.length &&
    a.imageIds.every((id, i) => id === b.imageIds[i])
  );
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}

/**
 * One JSON file per report, named by its (lowercase) UUID.
 * Writes go to a temp file that is fsynced and renamed into place, so a crash
 * leaves either the old file or the new one, never a partial one.
 */
export class ReportStore {
  private readonly dir: string;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(dir: string) {
    this.dir = dir;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async get(rawId: string): Promise<StoredReport | undefined> {
    const file = this.fileFor(rawId);
    try {
      return JSON.parse(await readFile(file, 'utf8')) as StoredReport;
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
  }

  /** All reports, newest `receivedAt` first. */
  async list(): Promise<StoredReport[]> {
    const names = (await readdir(this.dir)).filter((name) => REPORT_FILE_RE.test(name));
    const reports = await Promise.all(names.map((name) => this.get(name.slice(0, -'.json'.length))));
    return reports
      .filter((r): r is StoredReport => r !== undefined)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  /**
   * Idempotent create. The first PUT for an ID stores it; a retry with the same
   * content returns the stored copy; different content is a conflict.
   * Serialised per ID so two concurrent first PUTs cannot both "create".
   */
  async put(rawId: string, input: ReportInput, now: Date = new Date()): Promise<PutResult> {
    const id = this.idOrThrow(rawId);
    return this.withLock(id, async () => {
      const existing = await this.get(id);
      if (existing) {
        return { outcome: sameContent(existing, input) ? 'unchanged' : 'conflict', report: existing };
      }
      const report: StoredReport = { id, ...input, receivedAt: now.toISOString() };
      await this.writeAtomic(this.fileFor(id), JSON.stringify(report, null, 2));
      return { outcome: 'created', report };
    });
  }

  private async writeAtomic(file: string, contents: string): Promise<void> {
    const tmp = `${file}.${randomUUID()}.tmp`;
    const handle = await open(tmp, 'wx');
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  private withLock<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => undefined);
    this.locks.set(id, tail);
    // Drop the entry once nothing else has queued behind us, so the map does not grow forever.
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return run;
  }

  private idOrThrow(rawId: string): string {
    const id = normaliseUuid(rawId);
    // Callers validate first; this is defence in depth against path traversal.
    if (!id) throw new Error(`Invalid report ID: ${JSON.stringify(rawId)}`);
    return id;
  }

  private fileFor(rawId: string): string {
    return path.join(this.dir, `${this.idOrThrow(rawId)}.json`);
  }
}
