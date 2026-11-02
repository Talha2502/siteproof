import { open } from 'node:fs/promises';
import type { DataStore } from '@tus/server';
import { Router } from 'express';
import { MAX_IMAGE_BYTES } from '../config';
import { HttpError } from '../errors';
import { normaliseUuid } from '../reports/validate';

export type ImageCheck =
  | { ok: true; path: string; size: number }
  | { ok: false; code: 'image_missing' | 'image_incomplete' | 'image_too_large' | 'image_not_jpeg'; message: string };

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

async function startsWithJpegMagic(file: string): Promise<boolean> {
  const handle = await open(file, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(JPEG_MAGIC.length), 0, JPEG_MAGIC.length, 0);
    return bytesRead === JPEG_MAGIC.length && JPEG_MAGIC.every((byte, i) => buffer[i] === byte);
  } finally {
    await handle.close();
  }
}

/** Answers "is this image fully uploaded and usable?" from the tus store. */
export class UploadedImages {
  private readonly store: Pick<DataStore, 'getUpload'>;

  constructor(store: Pick<DataStore, 'getUpload'>) {
    this.store = store;
  }

  async check(id: string): Promise<ImageCheck> {
    let upload;
    try {
      upload = await this.store.getUpload(id);
    } catch {
      return { ok: false, code: 'image_missing', message: `Image ${id} has not been uploaded` };
    }
    const path = upload.storage?.path;
    if (!path || upload.size === undefined || upload.offset !== upload.size) {
      return { ok: false, code: 'image_incomplete', message: `Image ${id} is only partly uploaded` };
    }
    if (upload.size > MAX_IMAGE_BYTES) {
      return { ok: false, code: 'image_too_large', message: `Image ${id} is over 5 MB` };
    }
    if (upload.metadata?.filetype !== 'image/jpeg' || !(await startsWithJpegMagic(path))) {
      return { ok: false, code: 'image_not_jpeg', message: `Image ${id} is not a JPEG` };
    }
    return { ok: true, path, size: upload.size };
  }
}

export function fileRoutes(images: UploadedImages): Router {
  const router = Router();

  router.get('/files/:imageId', async (req, res) => {
    const id = normaliseUuid(req.params.imageId);
    if (!id) throw new HttpError(400, 'invalid_id', 'Image ID must be a UUID');
    const result = await images.check(id);
    if (!result.ok) throw new HttpError(404, 'not_found', 'Image not found');
    // An image ID's bytes never change once complete, so clients may cache it forever.
    res.type('image/jpeg').set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(result.path);
  });

  return router;
}
