// A report being composed: its rules and what to tell the user about them.
// Pure functions over plain data, so the Compose screen only renders.

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGES,
  type NewImage,
  type NewReport,
} from './engine';

export type DraftPhoto =
  | { id: string; previewUri: string; state: 'processing' }
  | { id: string; previewUri: string; state: 'ready'; image: NewImage }
  | { id: string; previewUri: string; state: 'failed'; message: string };

export interface Draft {
  /** Also the report ID: processed photos are stored under reports/<id>/. */
  id: string;
  description: string;
  /** Display order. */
  photos: DraftPhoto[];
}

export function emptyDraft(id: string): Draft {
  return { id, description: '', photos: [] };
}

/** Photos that count toward the limit: failed ones are only shown until removed. */
export function photoCount(draft: Draft): number {
  return draft.photos.filter(photo => photo.state !== 'failed').length;
}

export function slotsLeft(draft: Draft): number {
  return Math.max(0, MAX_IMAGES - photoCount(draft));
}

export function hasContent(draft: Draft): boolean {
  return draft.description.trim().length > 0 || draft.photos.length > 0;
}

export function setDescription(draft: Draft, description: string): Draft {
  return { ...draft, description };
}

/** Adds picked photos as "processing". Anything beyond the limit is dropped (the UI caps the picker). */
export function addPhotos(
  draft: Draft,
  picked: { id: string; previewUri: string }[],
): Draft {
  const accepted = picked
    .slice(0, slotsLeft(draft))
    .map(p => ({ ...p, state: 'processing' as const }));
  return { ...draft, photos: [...draft.photos, ...accepted] };
}

export function photoReady(draft: Draft, id: string, image: NewImage): Draft {
  return {
    ...draft,
    photos: draft.photos.map(photo =>
      photo.id === id
        ? { id, previewUri: photo.previewUri, state: 'ready', image }
        : photo,
    ),
  };
}

export function photoFailed(draft: Draft, id: string, message: string): Draft {
  return {
    ...draft,
    photos: draft.photos.map(photo =>
      photo.id === id
        ? { id, previewUri: photo.previewUri, state: 'failed', message }
        : photo,
    ),
  };
}

export function removePhoto(draft: Draft, id: string): Draft {
  return { ...draft, photos: draft.photos.filter(photo => photo.id !== id) };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Shown under the photo grid, e.g. "3 of 5 photos". */
export function photoCounterText(draft: Draft): string {
  return `${photoCount(draft)} of ${MAX_IMAGES} photos`;
}

/** Why the add buttons are disabled, or undefined if they are not. */
export function addDisabledReason(draft: Draft): string | undefined {
  return slotsLeft(draft) === 0
    ? `That's the maximum of ${MAX_IMAGES}. Remove a photo to add a different one.`
    : undefined;
}

export type SubmitCheck =
  | { ok: true; report: Omit<NewReport, 'createdAt'> }
  | { ok: false; reason: string };

/** Whether Submit is allowed, and if not, the one thing to fix next (top of the form first). */
export function checkSubmit(draft: Draft): SubmitCheck {
  const description = draft.description.trim();
  if (description.length === 0) {
    return { ok: false, reason: 'Add a description to submit' };
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    const over = description.length - MAX_DESCRIPTION_LENGTH;
    return {
      ok: false,
      reason: `Shorten the description by ${plural(
        over,
        'character',
        'characters',
      )}`,
    };
  }
  if (draft.photos.length === 0) {
    return { ok: false, reason: 'Add at least one photo to submit' };
  }
  const failed = draft.photos.filter(photo => photo.state === 'failed').length;
  if (failed > 0) {
    return {
      ok: false,
      reason: `Remove the ${
        failed === 1 ? 'photo' : 'photos'
      } that couldn't be processed`,
    };
  }
  const processing = draft.photos.filter(
    photo => photo.state === 'processing',
  ).length;
  if (processing > 0) {
    return {
      ok: false,
      reason: `Preparing ${plural(processing, 'photo', 'photos')}…`,
    };
  }
  const images = draft.photos.flatMap(photo =>
    photo.state === 'ready' ? [photo.image] : [],
  );
  return { ok: true, report: { id: draft.id, description, images } };
}
