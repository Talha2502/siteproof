// How a photo is shrunk before it is queued: try progressively smaller
// settings until one lands under the 1.5 MB target. The 5 MB server limit is
// the hard ceiling; nothing over it is ever queued.

import { MAX_IMAGE_BYTES } from './engine';

/** Aim for this: small enough for 2G, still good to look at. */
export const TARGET_IMAGE_BYTES = 1.5 * 1024 * 1024;

export interface ResizeStep {
  /** Longest edge in pixels (never enlarges a smaller photo). */
  maxEdge: number;
  /** JPEG quality, 0–100. */
  quality: number;
}

/**
 * Quality goes down before resolution: at 2048 px, q60 still looks better
 * than 1600 px at q80 for site photos, where detail (cracks, labels) matters.
 */
export const RESIZE_LADDER: readonly ResizeStep[] = [
  { maxEdge: 2048, quality: 80 },
  { maxEdge: 2048, quality: 70 },
  { maxEdge: 2048, quality: 60 },
  { maxEdge: 2048, quality: 50 },
  { maxEdge: 1600, quality: 80 },
  { maxEdge: 1600, quality: 70 },
  { maxEdge: 1600, quality: 60 },
  { maxEdge: 1600, quality: 50 },
];

export interface ResizeAttempt {
  step: ResizeStep;
  sizeBytes: number;
}

export type ResizeDecision =
  | { kind: 'try'; step: ResizeStep }
  /** Use attempts[index]. */
  | { kind: 'accept'; index: number }
  | { kind: 'reject'; reason: string };

/** Given what has been tried so far, decide what to do next. */
export function nextResizeStep(
  attempts: readonly ResizeAttempt[],
): ResizeDecision {
  const last = attempts.at(-1);
  if (last && last.sizeBytes <= TARGET_IMAGE_BYTES) {
    return { kind: 'accept', index: attempts.length - 1 };
  }
  const step = RESIZE_LADDER[attempts.length];
  if (step) return { kind: 'try', step };

  // Ladder exhausted without reaching the target: take the smallest result if
  // it is still under the hard ceiling (an unusually detailed photo), else refuse.
  let smallest = 0;
  attempts.forEach((attempt, i) => {
    if (attempt.sizeBytes < (attempts[smallest]?.sizeBytes ?? Infinity))
      smallest = i;
  });
  const best = attempts[smallest];
  if (best && best.sizeBytes <= MAX_IMAGE_BYTES)
    return { kind: 'accept', index: smallest };
  return {
    kind: 'reject',
    reason: 'This photo is too large to send, even after shrinking it',
  };
}
