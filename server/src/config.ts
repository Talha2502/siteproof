import path from 'node:path';

/** Server root (one level above src/), so paths never depend on the cwd. */
const SERVER_ROOT = path.resolve(import.meta.dirname, '..');

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = '0.0.0.0';

export const DATA_DIR = process.env.SITEPROOF_DATA_DIR ?? path.join(SERVER_ROOT, 'data');
export const REPORTS_DIR = path.join(DATA_DIR, 'reports');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_IMAGES = 1;
export const MAX_IMAGES = 5;
export const MAX_DESCRIPTION_LENGTH = 1000;
