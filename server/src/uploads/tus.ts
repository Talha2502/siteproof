import { FileStore } from '@tus/file-store';
import { Server, type Upload } from '@tus/server';
import { Router } from 'express';
import { MAX_IMAGE_BYTES, UPLOAD_PATH } from '../config';
import { normaliseUuid } from '../reports/validate';

/** tus handlers send any thrown `{ status_code, body }` as the response. */
function tusError(status_code: number, body: string) {
  return { status_code, body: `${body}\n` };
}

function hasStatus(err: unknown, ...codes: number[]): boolean {
  return typeof err === 'object' && err !== null && 'status_code' in err && codes.includes(Number(err.status_code));
}

/**
 * FileStore.create() truncates the file, so a duplicate POST for an existing ID
 * would wipe bytes already uploaded. Refuse instead: 409 tells the client to
 * HEAD and resume from the server's offset. tus holds the per-ID lock around
 * create(), so two duplicate POSTs cannot race past this check.
 */
export class NonTruncatingFileStore extends FileStore {
  override async create(upload: Upload): Promise<Upload> {
    if (await this.exists(upload.id)) {
      throw tusError(409, 'Upload already exists; HEAD it to resume');
    }
    // Not found (or a data file whose metadata never got written): safe to start from zero.
    return super.create(upload);
  }

  private async exists(id: string): Promise<boolean> {
    try {
      await this.getUpload(id);
      return true;
    } catch (err) {
      if (hasStatus(err, 404, 410)) return false;
      throw err;
    }
  }
}

export function createTusServer(datastore: FileStore): Server {
  return new Server({
    path: UPLOAD_PATH,
    datastore,
    maxSize: MAX_IMAGE_BYTES,
    relativeLocation: true,
    // The client chooses the upload ID (its image UUID), so retries address the same upload.
    namingFunction: (_req, metadata) => {
      const id = normaliseUuid(metadata?.uploadId);
      if (!id) throw tusError(400, 'uploadId metadata must be a UUID');
      return id;
    },
    getFileIdFromRequest: (_req, lastPath) => normaliseUuid(lastPath),
    onUploadCreate: async (_req, upload) => {
      if (upload.sizeIsDeferred) throw tusError(400, 'Upload-Length is required');
      if (upload.metadata?.filetype !== 'image/jpeg') throw tusError(415, 'Only image/jpeg uploads are accepted');
      return { metadata: upload.metadata };
    },
  });
}

/** Mounts tus on the full path so it sees the original URL (it parses the ID from req.url). */
export function uploadRoutes(tus: Server): Router {
  const router = Router();
  router.all([UPLOAD_PATH, `${UPLOAD_PATH}/*splat`], async (req, res) => {
    await tus.handle(req, res);
  });
  return router;
}
