import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import type { ReportRepository } from '../core/ports';
import type {
  ImageProgress,
  LocalImage,
  LocalReport,
  ReportState,
  ReportStatus,
} from '../core/types';

type Row = Record<string, Scalar>;

const STATUSES: readonly ReportStatus[] = [
  'queued',
  'uploading',
  'committing',
  'delivered',
  'needs_attention',
];

// Each entry upgrades the schema by one version (PRAGMA user_version).
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE reports (
      id TEXT PRIMARY KEY NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_error_kind TEXT,
      last_error_message TEXT,
      last_error_at TEXT,
      delivered_at TEXT
    )`,
    `CREATE TABLE images (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      local_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      upload_url TEXT,
      uploaded_bytes INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0
    )`,
    'CREATE INDEX images_by_report ON images (report_id, position)',
  ],
];

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Column ${key} is not text`);
  return value;
}

function optionalText(row: Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' ? value : undefined;
}

function int(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== 'number')
    throw new Error(`Column ${key} is not a number`);
  return value;
}

function status(row: Row): ReportStatus {
  const value = text(row, 'status');
  const known = STATUSES.find(s => s === value);
  if (!known) throw new Error(`Unknown report status ${value}`);
  return known;
}

function toImage(row: Row): LocalImage {
  return {
    id: text(row, 'id'),
    localPath: text(row, 'local_path'),
    sizeBytes: int(row, 'size_bytes'),
    width: int(row, 'width'),
    height: int(row, 'height'),
    uploadUrl: optionalText(row, 'upload_url'),
    uploadedBytes: int(row, 'uploaded_bytes'),
    done: int(row, 'done') === 1,
  };
}

function toReport(row: Row, images: LocalImage[]): LocalReport {
  const errorKind = optionalText(row, 'last_error_kind');
  const errorMessage = optionalText(row, 'last_error_message');
  const errorAt = optionalText(row, 'last_error_at');
  return {
    id: text(row, 'id'),
    description: text(row, 'description'),
    createdAt: text(row, 'created_at'),
    images,
    status: status(row),
    attempts: int(row, 'attempts'),
    nextAttemptAt: optionalText(row, 'next_attempt_at'),
    lastError:
      (errorKind === 'transient' || errorKind === 'permanent') &&
      errorMessage !== undefined &&
      errorAt !== undefined
        ? { kind: errorKind, message: errorMessage, at: errorAt }
        : undefined,
    deliveredAt: optionalText(row, 'delivered_at'),
  };
}

function stateParams(state: ReportState): Scalar[] {
  return [
    state.status,
    state.attempts,
    state.nextAttemptAt ?? null,
    state.lastError?.kind ?? null,
    state.lastError?.message ?? null,
    state.lastError?.at ?? null,
    state.deliveredAt ?? null,
  ];
}

/**
 * The outbox in SQLite. Every write runs in a transaction: op-sqlite queues
 * transactions, so a write can never land inside another one's BEGIN and be
 * rolled back with it.
 */
export class SqliteReportRepository implements ReportRepository {
  private readonly db: DB;

  private constructor(db: DB) {
    this.db = db;
  }

  static async open(
    name = 'siteproof.sqlite',
  ): Promise<SqliteReportRepository> {
    const db = open({ name });
    await db.execute('PRAGMA foreign_keys = ON');
    await db.execute('PRAGMA journal_mode = WAL');
    // FULL: a committed "Saved on this phone" survives power loss, not just a crash.
    await db.execute('PRAGMA synchronous = FULL');
    const repository = new SqliteReportRepository(db);
    await repository.migrate();
    return repository;
  }

  private async migrate(): Promise<void> {
    const result = await this.db.execute('PRAGMA user_version');
    const current = Number(result.rows[0]?.user_version ?? 0);
    for (let version = current; version < MIGRATIONS.length; version++) {
      const statements = MIGRATIONS[version] ?? [];
      await this.db.transaction(async tx => {
        for (const sql of statements) await tx.execute(sql);
        await tx.execute(`PRAGMA user_version = ${version + 1}`);
      });
    }
  }

  async list(): Promise<LocalReport[]> {
    const reports = await this.db.execute(
      'SELECT * FROM reports ORDER BY created_at, id',
    );
    const images = await this.db.execute(
      'SELECT * FROM images ORDER BY report_id, position',
    );
    const byReport = new Map<string, LocalImage[]>();
    for (const row of images.rows) {
      const reportId = text(row, 'report_id');
      const list = byReport.get(reportId) ?? [];
      list.push(toImage(row));
      byReport.set(reportId, list);
    }
    return reports.rows.map(row =>
      toReport(row, byReport.get(text(row, 'id')) ?? []),
    );
  }

  async get(id: string): Promise<LocalReport | undefined> {
    const reports = await this.db.execute(
      'SELECT * FROM reports WHERE id = ?',
      [id],
    );
    const row = reports.rows[0];
    if (!row) return undefined;
    const images = await this.db.execute(
      'SELECT * FROM images WHERE report_id = ? ORDER BY position',
      [id],
    );
    return toReport(row, images.rows.map(toImage));
  }

  async insert(report: LocalReport): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.execute(
        `INSERT INTO reports (id, description, created_at, status, attempts, next_attempt_at,
           last_error_kind, last_error_message, last_error_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          report.id,
          report.description,
          report.createdAt,
          ...stateParams(report),
        ],
      );
      for (const [position, image] of report.images.entries()) {
        await tx.execute(
          `INSERT INTO images (id, report_id, position, local_path, size_bytes, width, height,
             upload_url, uploaded_bytes, done)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            image.id,
            report.id,
            position,
            image.localPath,
            image.sizeBytes,
            image.width,
            image.height,
            image.uploadUrl ?? null,
            image.uploadedBytes,
            image.done ? 1 : 0,
          ],
        );
      }
    });
  }

  async saveState(id: string, state: ReportState): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.execute(
        `UPDATE reports SET status = ?, attempts = ?, next_attempt_at = ?, last_error_kind = ?,
           last_error_message = ?, last_error_at = ?, delivered_at = ?
         WHERE id = ?`,
        [...stateParams(state), id],
      );
    });
  }

  async saveImageProgress(
    reportId: string,
    imageId: string,
    progress: ImageProgress,
  ): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.execute(
        `UPDATE images SET upload_url = ?, uploaded_bytes = ?, done = ?
         WHERE id = ? AND report_id = ?`,
        [
          progress.uploadUrl ?? null,
          progress.uploadedBytes,
          progress.done ? 1 : 0,
          imageId,
          reportId,
        ],
      );
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.transaction(async tx => {
      // Images go with it (ON DELETE CASCADE).
      await tx.execute('DELETE FROM reports WHERE id = ?', [id]);
    });
  }
}
