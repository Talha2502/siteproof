// The outbox. Sends reports one at a time, oldest first, retrying transient
// failures forever and parking permanent ones for the user. The UI only reads
// its snapshot and calls submit/remove/wake; it never drives uploads.

import { deliverReport, type DeliveryOutcome } from './deliverReport';
import type {
  Clock,
  FileCleaner,
  FileReader,
  NetworkMonitor,
  ReportRepository,
  UploadTransport,
} from './ports';
import { decide } from './retryPolicy';
import type {
  ImageProgress,
  LocalImage,
  LocalReport,
  ReportState,
} from './types';

export const MIN_IMAGES = 1;
export const MAX_IMAGES = 5;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface EngineDeps {
  repository: ReportRepository;
  transport: UploadTransport;
  files: FileReader;
  cleaner: FileCleaner;
  network: NetworkMonitor;
  clock: Clock;
  random?: () => number;
}

/** A processed image, already saved under reports/<reportId>/ in app storage. */
export type NewImage = Pick<
  LocalImage,
  'id' | 'localPath' | 'sizeBytes' | 'width' | 'height'
>;

export interface NewReport {
  id: string;
  description: string;
  createdAt: string;
  images: NewImage[];
}

export interface SendingProgress {
  reportId: string;
  imageId: string;
  /** Bytes of the current chunk sent but not yet confirmed. */
  sentBytes: number;
}

export interface OutboxSnapshot {
  /** Oldest first: the order they will be sent. */
  reports: readonly LocalReport[];
  online: boolean | undefined;
  sending?: SendingProgress;
}

/** Throws if the report breaks a rule the server would also enforce. The UI should prevent these. */
export function validateNewReport(report: NewReport): void {
  const description = report.description.trim();
  if (description.length === 0) throw new Error('A report needs a description');
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `A description can be at most ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }
  if (report.images.length < MIN_IMAGES || report.images.length > MAX_IMAGES) {
    throw new Error(`A report needs ${MIN_IMAGES} to ${MAX_IMAGES} photos`);
  }
  for (const image of report.images) {
    if (image.sizeBytes <= 0 || image.sizeBytes > MAX_IMAGE_BYTES) {
      throw new Error('Every photo must be between 1 byte and 5 MB');
    }
  }
}

function stateOf(report: LocalReport): ReportState {
  return {
    status: report.status,
    attempts: report.attempts,
    nextAttemptAt: report.nextAttemptAt,
    lastError: report.lastError,
    deliveredAt: report.deliveredAt,
  };
}

function byCreatedAt(a: LocalReport, b: LocalReport): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export class UploadEngine {
  private readonly deps: EngineDeps;
  private readonly random: () => number;
  private readonly reports = new Map<string, LocalReport>();
  private readonly listeners = new Set<() => void>();
  private snapshot: OutboxSnapshot = { reports: [], online: undefined };
  private sending?: SendingProgress;
  private active?: {
    reportId: string;
    controller: AbortController;
    finished: Promise<void>;
  };
  private started?: Promise<void>;
  private stopped = false;
  private pumping = false;
  private pumpAgain = false;
  private cancelTimer?: () => void;
  private unsubscribeNetwork?: () => void;

  constructor(deps: EngineDeps) {
    this.deps = deps;
    this.random = deps.random ?? Math.random;
  }

  /** Loads the outbox from storage and starts sending. Safe to call more than once. */
  start(): Promise<void> {
    this.started ??= this.recover();
    return this.started;
  }

  /** Stops all work without saving anything: what a force-quit does. For tests and teardown. */
  stop(): void {
    this.stopped = true;
    this.cancelTimer?.();
    this.unsubscribeNetwork?.();
    this.active?.controller.abort();
  }

  getSnapshot(): OutboxSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Saves a new report durably, then starts sending. Resolves once it is safe on the phone.
   *
   * start() must have been called (and the UI should wait for it) before any photos are
   * written for a new report: start() deletes report folders that have no saved row, and
   * a submission's photos exist on disk before its row does.
   */
  async submit(input: NewReport): Promise<void> {
    validateNewReport(input);
    if (!this.started) throw new Error('Call start() before submit()');
    await this.started;
    const report: LocalReport = {
      id: input.id,
      description: input.description.trim(),
      createdAt: input.createdAt,
      images: input.images.map(image => ({
        ...image,
        uploadedBytes: 0,
        done: false,
      })),
      status: 'queued',
      attempts: 0,
    };
    await this.deps.repository.insert(report);
    this.reports.set(report.id, report);
    this.emit();
    this.wake();
  }

  /**
   * Retry now: clears any backoff wait. Called on app start, return to
   * foreground, network coming back, and new submissions.
   */
  wake(): void {
    if (this.stopped || !this.started) return;
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    for (const report of this.reports.values()) {
      if (
        report.status === 'queued' &&
        (report.nextAttemptAt || report.attempts > 0)
      ) {
        this.update(report.id, { attempts: 0, nextAttemptAt: undefined });
      }
    }
    this.requestPump();
  }

  /** Deletes a report from the phone (and its photos), aborting it first if it is being sent. */
  async remove(id: string): Promise<void> {
    await this.start();
    if (!this.reports.delete(id)) return;
    this.emit();
    if (this.active?.reportId === id) {
      this.active.controller.abort();
      await this.active.finished;
    }
    // Row first: if we crash before the files go, they are an orphan cleaned up on next start.
    await this.deps.repository.remove(id);
    await this.deps.cleaner.deleteReportFiles(id);
    this.requestPump();
  }

  /** Deletes every report and every report folder on the phone. Does not touch the server. */
  async removeAll(): Promise<void> {
    await this.start();
    for (const id of [...this.reports.keys()]) await this.remove(id);
    for (const folder of await this.deps.cleaner.listReportFolders()) {
      await this.deps.cleaner.deleteReportFiles(folder);
    }
  }

  private async recover(): Promise<void> {
    const { repository, cleaner, network } = this.deps;
    const stored = await repository.list();
    for (const report of stored) {
      // Whatever was in flight when the app died resumes; HEAD will tell us the true offsets.
      if (report.status === 'uploading' || report.status === 'committing') {
        report.status = 'queued';
        await repository.saveState(report.id, stateOf(report));
      }
      this.reports.set(report.id, report);
    }

    const known = new Set(stored.map(report => report.id));
    for (const folder of await cleaner.listReportFolders()) {
      const report = this.reports.get(folder);
      // No row: a crash mid-Submit left files behind. Delivered: the photos live on the server now.
      if (!known.has(folder) || report?.status === 'delivered') {
        await cleaner.deleteReportFiles(folder);
      }
    }

    this.unsubscribeNetwork = network.subscribe(reachable => {
      this.emit();
      if (reachable) this.wake();
    });
    this.emit();
    this.wake();
  }

  private requestPump(): void {
    if (this.stopped) return;
    if (this.pumping) {
      this.pumpAgain = true;
      return;
    }
    this.pump().catch(() => {
      // deliver() handles its own errors; this only guards against a bug leaving pumping stuck.
      this.pumping = false;
    });
  }

  private async pump(): Promise<void> {
    this.pumping = true;
    try {
      do {
        this.pumpAgain = false;
        while (!this.stopped) {
          const next = this.nextPending();
          if (!next) break;
          // Offline: wait for the network monitor to wake us rather than burning retries.
          if (this.deps.network.isReachable() === false) break;
          const wait = next.nextAttemptAt
            ? Date.parse(next.nextAttemptAt) - this.deps.clock.now()
            : 0;
          if (wait > 0) {
            this.schedule(wait);
            break;
          }
          await this.deliver(next);
        }
      } while (this.pumpAgain && !this.stopped);
    } finally {
      this.pumping = false;
    }
  }

  /** Strict FIFO: the oldest report not yet delivered or parked. Later ones wait behind it. */
  private nextPending(): LocalReport | undefined {
    return [...this.reports.values()]
      .filter(report => report.status === 'queued')
      .sort(byCreatedAt)[0];
  }

  private schedule(ms: number): void {
    this.cancelTimer?.();
    this.cancelTimer = this.deps.clock.setTimeout(() => {
      this.cancelTimer = undefined;
      this.requestPump();
    }, ms);
  }

  private async deliver(report: LocalReport): Promise<void> {
    const id = report.id;
    const controller = new AbortController();
    let markFinished = () => {};
    const finished = new Promise<void>(resolve => {
      markFinished = resolve;
    });
    this.active = { reportId: id, controller, finished };

    try {
      await this.save(id, { status: 'uploading', nextAttemptAt: undefined });
      const outcome = await deliverReport(
        this.reports.get(id) ?? report,
        this.deps,
        {
          onImageProgress: (imageId, progress) =>
            this.saveImageProgress(id, imageId, progress),
          onSending: (imageId, sentBytes) => {
            this.sending = { reportId: id, imageId, sentBytes };
            this.emit();
          },
          onCommitting: () => this.save(id, { status: 'committing' }),
        },
        controller.signal,
      );
      await this.apply(id, outcome);
    } catch (err) {
      // Saving state failed. Keep the report queued in memory and retry later.
      const message = err instanceof Error ? err.message : String(err);
      await this.apply(id, {
        kind: 'failed',
        failure: { kind: 'unexpected', message },
        progressed: false,
      }).catch(() => {});
    } finally {
      this.active = undefined;
      this.sending = undefined;
      this.emit();
      markFinished();
    }
  }

  private async apply(id: string, outcome: DeliveryOutcome): Promise<void> {
    // Force-quit (stop) saves nothing; a removed report must not be written back.
    if (this.stopped || !this.reports.has(id)) return;
    const report = this.reports.get(id);
    if (!report) return;
    const now = this.deps.clock.now();

    if (outcome.kind === 'delivered') {
      await this.save(id, {
        status: 'delivered',
        attempts: 0,
        nextAttemptAt: undefined,
        lastError: undefined,
        deliveredAt: new Date(now).toISOString(),
      });
      // The photos live on the server now. If this fails, the next start retries it.
      await this.deps.cleaner.deleteReportFiles(id).catch(() => {});
      return;
    }

    if (outcome.kind === 'cancelled') {
      await this.save(id, { status: 'queued' });
      return;
    }

    // Progress during this attempt means the link works: restart backoff from the bottom.
    const attempt = outcome.progressed ? 0 : report.attempts;
    const decision = decide(outcome.failure, attempt, {
      now,
      random: this.random,
    });
    const at = new Date(now).toISOString();
    if (decision.retry) {
      await this.save(id, {
        status: 'queued',
        attempts: attempt + 1,
        nextAttemptAt: new Date(now + decision.delayMs).toISOString(),
        lastError: { kind: 'transient', message: decision.message, at },
      });
    } else {
      await this.save(id, {
        status: 'needs_attention',
        attempts: attempt + 1,
        nextAttemptAt: undefined,
        lastError: { kind: 'permanent', message: decision.message, at },
      });
    }
  }

  /** Updates the in-memory report and the snapshot. Returns the new report, if it still exists. */
  private update(
    id: string,
    changes: Partial<ReportState>,
  ): LocalReport | undefined {
    const current = this.reports.get(id);
    if (!current) return undefined;
    const next = { ...current, ...changes };
    this.reports.set(id, next);
    this.emit();
    if (!this.stopped) {
      this.deps.repository.saveState(id, stateOf(next)).catch(() => {});
    }
    return next;
  }

  /** Like update, but waits for the write: used where the next step depends on it being durable. */
  private async save(id: string, changes: Partial<ReportState>): Promise<void> {
    const current = this.reports.get(id);
    if (!current || this.stopped) return;
    const next = { ...current, ...changes };
    this.reports.set(id, next);
    this.emit();
    await this.deps.repository.saveState(id, stateOf(next));
  }

  private async saveImageProgress(
    reportId: string,
    imageId: string,
    progress: ImageProgress,
  ): Promise<void> {
    const current = this.reports.get(reportId);
    if (!current || this.stopped) return;
    this.reports.set(reportId, {
      ...current,
      images: current.images.map(image =>
        image.id === imageId ? { ...image, ...progress } : image,
      ),
    });
    // The confirmed offset now includes what was "in flight".
    if (this.sending?.imageId === imageId) this.sending = undefined;
    this.emit();
    await this.deps.repository.saveImageProgress(reportId, imageId, progress);
  }

  private emit(): void {
    this.snapshot = {
      reports: [...this.reports.values()].sort(byCreatedAt),
      online: this.deps.network.isReachable(),
      sending: this.sending,
    };
    for (const listener of this.listeners) listener();
  }
}
