import { MAX_DESCRIPTION_LENGTH, MAX_IMAGES, MIN_IMAGES } from '../config';
import { HttpError } from '../errors';
import type { ReportInput } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Full ISO 8601 date-time with timezone; Date.parse alone accepts too much ("2026", "Nov 3").
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Returns the canonical (lowercase) form of a UUID, or undefined if it is not one. */
export function normaliseUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : undefined;
}

/** Validates a route `:id`. Also the guard against path traversal in the store. */
export function parseReportId(value: unknown): string {
  const id = normaliseUuid(value);
  if (!id) throw new HttpError(400, 'invalid_id', 'Report ID must be a UUID');
  return id;
}

function bad(message: string): HttpError {
  return new HttpError(400, 'invalid_body', message);
}

/** Validates and normalises a PUT /reports/:id body. Unknown fields are dropped. */
export function parseReportInput(body: unknown): ReportInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw bad('Body must be a JSON object');
  }
  const { description, createdAt, imageIds } = body as Record<string, unknown>;

  if (typeof description !== 'string') throw bad('description must be a string');
  const trimmed = description.trim();
  if (trimmed.length === 0) throw bad('description must not be blank');
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw bad(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  if (typeof createdAt !== 'string' || !ISO_DATETIME_RE.test(createdAt) || Number.isNaN(Date.parse(createdAt))) {
    throw bad('createdAt must be an ISO 8601 date-time');
  }

  if (!Array.isArray(imageIds)) throw bad('imageIds must be an array');
  if (imageIds.length < MIN_IMAGES || imageIds.length > MAX_IMAGES) {
    throw bad(`imageIds must contain ${MIN_IMAGES}–${MAX_IMAGES} items`);
  }
  const ids = imageIds.map((raw) => {
    const id = normaliseUuid(raw);
    if (!id) throw bad('every imageId must be a UUID');
    return id;
  });
  if (new Set(ids).size !== ids.length) throw bad('imageIds must be unique');

  return { description: trimmed, createdAt, imageIds: ids };
}
