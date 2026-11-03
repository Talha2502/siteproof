import { MAX_IMAGE_BYTES } from './engine';
import {
  RESIZE_LADDER,
  TARGET_IMAGE_BYTES,
  nextResizeStep,
  type ResizeAttempt,
} from './imagePolicy';

const MB = 1024 * 1024;

/** Simulates running the ladder where each step produces the given size. */
function run(sizes: number[]) {
  const attempts: ResizeAttempt[] = [];
  for (;;) {
    const decision = nextResizeStep(attempts);
    if (decision.kind !== 'try') return { decision, attempts };
    const sizeBytes = sizes[attempts.length];
    if (sizeBytes === undefined) throw new Error('Ran out of sizes');
    attempts.push({ step: decision.step, sizeBytes });
  }
}

describe('nextResizeStep', () => {
  it('starts at 2048 px, quality 80', () => {
    expect(nextResizeStep([])).toEqual({
      kind: 'try',
      step: { maxEdge: 2048, quality: 80 },
    });
  });

  it('accepts the first result under the 1.5 MB target', () => {
    const { decision, attempts } = run([0.9 * MB]);
    expect(decision).toEqual({ kind: 'accept', index: 0 });
    expect(attempts).toHaveLength(1);
  });

  it('steps quality down (70, 60, 50) before reducing resolution', () => {
    const { decision, attempts } = run([2.4 * MB, 2 * MB, 1.7 * MB, 1.4 * MB]);
    expect(attempts.map(a => a.step)).toEqual([
      { maxEdge: 2048, quality: 80 },
      { maxEdge: 2048, quality: 70 },
      { maxEdge: 2048, quality: 60 },
      { maxEdge: 2048, quality: 50 },
    ]);
    expect(decision).toEqual({ kind: 'accept', index: 3 });
  });

  it('drops to 1600 px when quality alone is not enough', () => {
    const { decision, attempts } = run([
      3 * MB,
      2.6 * MB,
      2.2 * MB,
      1.9 * MB,
      1.2 * MB,
    ]);
    expect(attempts.at(-1)?.step).toEqual({ maxEdge: 1600, quality: 80 });
    expect(decision).toEqual({ kind: 'accept', index: 4 });
  });

  it('accepts a result exactly at the target', () => {
    expect(run([TARGET_IMAGE_BYTES]).decision).toEqual({
      kind: 'accept',
      index: 0,
    });
  });

  it('falls back to the smallest result if the target is never reached but it is under 5 MB', () => {
    const sizes = [4.9, 4.5, 4.2, 4.0, 3.1, 2.8, 2.6, 2.7].map(n => n * MB);
    const { decision, attempts } = run(sizes);
    expect(attempts).toHaveLength(RESIZE_LADDER.length);
    expect(decision).toEqual({ kind: 'accept', index: 6 });
  });

  it('refuses a photo that is over 5 MB even at the smallest setting', () => {
    const sizes = RESIZE_LADDER.map(() => MAX_IMAGE_BYTES + 1);
    expect(run(sizes).decision).toEqual({
      kind: 'reject',
      reason: 'This photo is too large to send, even after shrinking it',
    });
  });
});
