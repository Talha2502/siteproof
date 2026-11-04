import type { OutboxSnapshot } from './engine';
import {
  bannerText,
  summaryText,
  describeReport,
  pendingCount,
  type StatusContext,
} from './reportStatus';
import type { LocalImage, LocalReport, ReportStatus } from './types';

const NOW = Date.parse('2026-11-03T14:00:00Z');

function image(id: string, sizeBytes: number, uploadedBytes = 0): LocalImage {
  return {
    id,
    localPath: `reports/r/${id}.jpg`,
    sizeBytes,
    width: 2048,
    height: 1536,
    uploadedBytes,
    done: uploadedBytes === sizeBytes,
  };
}

function report(
  status: ReportStatus,
  extra: Partial<LocalReport> = {},
): LocalReport {
  return {
    id: 'r',
    description: 'Cracked lintel',
    createdAt: '2026-11-03T13:00:00.000Z',
    images: [image('a', 1000)],
    status,
    attempts: 0,
    ...extra,
  };
}

const ctx = (extra: Partial<StatusContext> = {}): StatusContext => ({
  online: true,
  now: NOW,
  formatTime: iso => iso.slice(11, 16),
  ...extra,
});

describe('describeReport: the wording table', () => {
  it('queued + offline: saved, waiting for connection', () => {
    expect(describeReport(report('queued'), ctx({ online: false }))).toEqual({
      tone: 'saved',
      text: 'Saved on this phone · waiting for connection',
      canRemove: false,
    });
  });

  it('queued + online + backoff: saved, retrying in N s', () => {
    const r = report('queued', {
      nextAttemptAt: new Date(NOW + 19_200).toISOString(),
    });
    expect(describeReport(r, ctx()).text).toBe(
      'Saved on this phone · retrying in 20 s',
    );
  });

  it('long waits are shown in minutes', () => {
    const r = report('queued', {
      nextAttemptAt: new Date(NOW + 5 * 60_000).toISOString(),
    });
    expect(describeReport(r, ctx()).text).toBe(
      'Saved on this phone · retrying in 5 min',
    );
  });

  it('queued + online, no wait (behind another report): waiting to send', () => {
    const past = report('queued', {
      nextAttemptAt: new Date(NOW - 1000).toISOString(),
    });
    expect(describeReport(past, ctx()).text).toBe(
      'Saved on this phone · waiting to send',
    );
    expect(describeReport(report('queued'), ctx()).text).toBe(
      'Saved on this phone · waiting to send',
    );
  });

  it('uploading: which photo, and the whole-report percentage including bytes in flight', () => {
    const r = report('uploading', {
      images: [
        image('a', 1000, 1000),
        image('b', 1000, 300),
        image('c', 1000),
        image('d', 1000),
        image('e', 1000),
      ],
    });
    const view = describeReport(
      r,
      ctx({ sending: { reportId: 'r', imageId: 'b', sentBytes: 130 } }),
    );
    // The text and the bar show the same number: 1430 of 5000 bytes.
    expect(view.text).toBe('Uploading · photo 2 of 5 · 28%');
    expect(view.headline).toBe('Uploading · photo 2 of 5');
    expect(view.percent).toBe(28);
    expect(view.tone).toBe('moving');
    expect(view.progress).toBeCloseTo(1430 / 5000);
  });

  it('says "connecting" until bytes move in this attempt, not "Uploading"', () => {
    const r = report('uploading', { images: [image('a', 1000, 500)] });
    for (const sending of [
      undefined,
      { reportId: 'other', imageId: 'x', sentBytes: 400 },
    ]) {
      const view = describeReport(r, ctx({ sending }));
      expect(view.text).toBe('Saved on this phone · connecting…');
      expect(view.tone).toBe('saved');
      expect(view.progress).toBeUndefined();
    }
  });

  it('keeps showing progress between chunks of a moving attempt', () => {
    const r = report('uploading', { images: [image('a', 1000, 500)] });
    const view = describeReport(
      r,
      ctx({ sending: { reportId: 'r', imageId: 'a', sentBytes: 0 } }),
    );
    expect(view.text).toBe('Uploading · photo 1 of 1 · 50%');
  });

  it('never shows 100% before the server confirms', () => {
    const r = report('uploading', { images: [image('a', 1000, 0)] });
    const view = describeReport(
      r,
      ctx({ sending: { reportId: 'r', imageId: 'a', sentBytes: 1000 } }),
    );
    expect(view.text).toBe('Uploading · photo 1 of 1 · 99%');
  });

  it('committing: finishing upload', () => {
    expect(describeReport(report('committing'), ctx()).text).toBe(
      'Finishing upload…',
    );
  });

  it('delivered: on the server, with the local time', () => {
    const r = report('delivered', { deliveredAt: '2026-11-03T14:32:10.000Z' });
    expect(describeReport(r, ctx())).toEqual({
      tone: 'done',
      text: 'On the server · 14:32',
      canRemove: false,
    });
  });

  it('needs attention: not sent, with the reason, and can be removed', () => {
    const r = report('needs_attention', {
      lastError: {
        kind: 'permanent',
        message: 'A photo is too large for the server (HTTP 413)',
        at: '',
      },
    });
    expect(describeReport(r, ctx())).toEqual({
      tone: 'attention',
      text: 'Not sent · A photo is too large for the server (HTTP 413)',
      canRemove: true,
    });
  });

  it('never mixes "saved" and "on the server" in one sentence', () => {
    const statuses: ReportStatus[] = [
      'queued',
      'uploading',
      'committing',
      'delivered',
      'needs_attention',
    ];
    for (const status of statuses) {
      for (const online of [true, false]) {
        const text = describeReport(
          report(status, { deliveredAt: '2026-11-03T14:32:00Z' }),
          ctx({ online }),
        ).text;
        expect(
          text.includes('Saved on this phone') &&
            text.includes('On the server'),
        ).toBe(false);
      }
    }
  });
});

describe('banner', () => {
  const snapshot = (
    online: boolean | undefined,
    statuses: ReportStatus[],
  ): OutboxSnapshot => ({
    online,
    reports: statuses.map((status, i) => report(status, { id: `r${i}` })),
  });

  it('says nothing while online', () => {
    expect(bannerText(snapshot(true, ['queued']))).toBeUndefined();
    expect(bannerText(snapshot(undefined, ['queued']))).toBeUndefined();
  });

  it('counts reports still on their way when offline', () => {
    const s = snapshot(false, [
      'queued',
      'uploading',
      'committing',
      'delivered',
      'needs_attention',
    ]);
    expect(pendingCount(s)).toBe(3);
    expect(bannerText(s)).toBe('Offline · 3 reports saved on this phone');
    expect(bannerText(snapshot(false, ['queued']))).toBe(
      'Offline · 1 report saved on this phone',
    );
  });

  it('reassures when offline with nothing pending', () => {
    expect(bannerText(snapshot(false, ['delivered']))).toBe(
      'Offline · new reports will be saved on this phone',
    );
  });
});

describe('summary', () => {
  const snapshot = (statuses: ReportStatus[]): OutboxSnapshot => ({
    online: true,
    reports: statuses.map((status, i) => report(status, { id: `r${i}` })),
  });

  it('counts what is on the phone, what needs the user, and what is on the server', () => {
    expect(summaryText(snapshot(['queued', 'uploading', 'delivered']))).toBe(
      '2 saved on this phone · 1 on the server',
    );
    expect(
      summaryText(snapshot(['needs_attention', 'delivered', 'delivered'])),
    ).toBe('1 needs you · 2 on the server');
    expect(summaryText(snapshot(['needs_attention', 'needs_attention']))).toBe(
      '2 need you',
    );
  });

  it('says so when there is nothing', () => {
    expect(summaryText(snapshot([]))).toBe('Nothing to send');
  });
});
