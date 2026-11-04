// What the Outbox says about each report. One glance must tell whether work is
// safe (saved), moving, done, or needs the user, and "saved on this phone" and
// "on the server" never share a sentence.

import type { OutboxSnapshot, SendingProgress } from './engine';
import type { LocalReport } from './types';

export type StatusTone = 'saved' | 'moving' | 'done' | 'attention';

export interface StatusView {
  tone: StatusTone;
  text: string;
  /** 0–1 across all of the report's photos, while uploading. */
  progress?: number;
  /** While uploading: `text` without the percentage, for layouts that show `percent` on its own. */
  headline?: string;
  /** While uploading: the whole report's percentage (0–99), matching `progress`. */
  percent?: number;
  /** Work is happening right now (connecting, uploading, finishing): the UI shows a spinner. */
  active?: boolean;
  /** The user can (and should) act: only parked reports can be removed. */
  canRemove: boolean;
}

export interface StatusContext {
  online: boolean | undefined;
  now: number;
  sending?: SendingProgress;
  /** Formats an ISO time as the phone's local clock time, e.g. "14:32". */
  formatTime: (iso: string) => string;
}

function waitText(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.ceil(seconds / 60)} min`;
}

function uploadingView(
  report: LocalReport,
  sending?: SendingProgress,
): StatusView {
  // An attempt has started but nothing has moved yet: on a dead link this lasts until the
  // stall timeout. Saying "Uploading" here would be a claim the network hasn't backed up.
  if (sending?.reportId !== report.id) {
    return {
      tone: 'saved',
      text: 'Saved on this phone · connecting…',
      active: true,
      canRemove: false,
    };
  }
  const total = report.images.reduce((sum, image) => sum + image.sizeBytes, 0);
  const done = report.images.reduce(
    (sum, image) => sum + image.uploadedBytes,
    0,
  );
  const index = report.images.findIndex(image => !image.done);
  if (index === -1) {
    return {
      tone: 'moving',
      text: 'Uploading',
      progress: 1,
      active: true,
      canRemove: false,
    };
  }
  // One number for the whole report, so the text and the bar always agree.
  const progress =
    total > 0 ? Math.min(1, (done + sending.sentBytes) / total) : 0;
  const percent = Math.min(99, Math.floor(progress * 100)); // 100% only once the server confirms
  const headline = `Uploading · photo ${index + 1} of ${report.images.length}`;
  return {
    tone: 'moving',
    text: `${headline} · ${percent}%`,
    headline,
    percent,
    progress,
    active: true,
    canRemove: false,
  };
}

export function describeReport(
  report: LocalReport,
  ctx: StatusContext,
): StatusView {
  switch (report.status) {
    case 'delivered':
      return {
        tone: 'done',
        text: `On the server · ${ctx.formatTime(
          report.deliveredAt ?? report.createdAt,
        )}`,
        canRemove: false,
      };
    case 'needs_attention':
      return {
        tone: 'attention',
        text: `Not sent · ${
          report.lastError?.message ?? 'The server refused this report'
        }`,
        canRemove: true,
      };
    case 'committing':
      return {
        tone: 'moving',
        text: 'Finishing upload…',
        progress: 1,
        active: true,
        canRemove: false,
      };
    case 'uploading':
      return uploadingView(report, ctx.sending);
    case 'queued': {
      if (ctx.online === false) {
        return {
          tone: 'saved',
          text: 'Saved on this phone · waiting for connection',
          canRemove: false,
        };
      }
      const retryAt = report.nextAttemptAt
        ? Date.parse(report.nextAttemptAt)
        : NaN;
      if (retryAt > ctx.now) {
        return {
          tone: 'saved',
          text: `Saved on this phone · retrying in ${waitText(
            retryAt - ctx.now,
          )}`,
          canRemove: false,
        };
      }
      return {
        tone: 'saved',
        text: 'Saved on this phone · waiting to send',
        canRemove: false,
      };
    }
  }
}

/** Reports that exist only on this phone and are still on their way. */
export function pendingCount(snapshot: OutboxSnapshot): number {
  return snapshot.reports.filter(
    report =>
      report.status !== 'delivered' && report.status !== 'needs_attention',
  ).length;
}

/** The connectivity banner, or undefined when there is nothing to say. */
export function bannerText(snapshot: OutboxSnapshot): string | undefined {
  if (snapshot.online !== false) return undefined;
  const pending = pendingCount(snapshot);
  if (pending === 0) return 'Offline · new reports will be saved on this phone';
  return `Offline · ${pending} ${
    pending === 1 ? 'report' : 'reports'
  } saved on this phone`;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The Outbox subtitle while online, e.g. "2 saved on this phone · 1 on the server". */
export function summaryText(snapshot: OutboxSnapshot): string {
  const pending = pendingCount(snapshot);
  const attention = snapshot.reports.filter(
    r => r.status === 'needs_attention',
  ).length;
  const delivered = snapshot.reports.filter(
    r => r.status === 'delivered',
  ).length;
  const parts = [
    pending > 0 ? `${pending} saved on this phone` : undefined,
    attention > 0 ? `${count(attention, 'needs', 'need')} you` : undefined,
    delivered > 0 ? `${delivered} on the server` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing to send';
}
