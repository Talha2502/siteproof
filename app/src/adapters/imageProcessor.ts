import ImageResizer from '@bam.tech/react-native-image-resizer';
import * as FS from '@dr.pogodin/react-native-fs';
import { MAX_IMAGE_BYTES, type NewImage } from '../core/engine';
import { nextResizeStep, type ResizeAttempt } from '../core/imagePolicy';
import { imagePath, reportDir } from './files';

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

interface Attempt extends ResizeAttempt {
  path: string;
  width: number;
  height: number;
}

async function removeQuietly(path: string): Promise<void> {
  try {
    if (await FS.exists(path)) await FS.unlink(path);
  } catch {
    // Cache leftovers are harmless; the OS clears the cache under pressure.
  }
}

/**
 * Shrinks a picked photo and stores it at reports/<reportId>/<imageId>.jpg.
 *
 * The native resizer decodes with downsampling (an 18 MB photo is never fully
 * in memory), rotates pixels to match EXIF orientation, writes a plain JPEG
 * without metadata (so no GPS location leaves the phone), and runs off the JS
 * thread, so the UI never freezes. `sourceUri` may be file:// or content://.
 */
export async function processImage(
  sourceUri: string,
  reportId: string,
  imageId: string,
): Promise<NewImage> {
  const attempts: Attempt[] = [];
  let kept: string | undefined;
  try {
    for (;;) {
      const decision = nextResizeStep(attempts);
      if (decision.kind === 'reject')
        throw new ImageProcessingError(decision.reason);

      if (decision.kind === 'try') {
        const { maxEdge, quality } = decision.step;
        const result = await ImageResizer.createResizedImage(
          sourceUri,
          maxEdge,
          maxEdge,
          'JPEG',
          quality,
          0,
          FS.CachesDirectoryPath,
          false,
          { mode: 'contain', onlyScaleDown: true },
        );
        attempts.push({
          step: decision.step,
          sizeBytes: result.size,
          path: result.path,
          width: result.width,
          height: result.height,
        });
        continue;
      }

      const chosen = attempts[decision.index];
      if (!chosen)
        throw new ImageProcessingError('Could not process this photo');
      const destination = imagePath(reportId, imageId);
      await FS.mkdir(reportDir(reportId));
      await removeQuietly(destination);
      await FS.moveFile(chosen.path, destination);
      kept = chosen.path;

      // The ceiling is checked on the file actually stored, not on what the resizer reported.
      const { size } = await FS.stat(destination);
      if (size <= 0 || size > MAX_IMAGE_BYTES) {
        await removeQuietly(destination);
        throw new ImageProcessingError(
          'This photo is too large to send, even after shrinking it',
        );
      }
      return {
        id: imageId,
        localPath: destination,
        sizeBytes: size,
        width: chosen.width,
        height: chosen.height,
      };
    }
  } catch (err) {
    if (err instanceof ImageProcessingError) throw err;
    throw new ImageProcessingError(
      "Couldn't open this photo. Try another one.",
    );
  } finally {
    for (const attempt of attempts) {
      if (attempt.path !== kept) await removeQuietly(attempt.path);
    }
  }
}

/** Deletes one processed photo, e.g. when the user removes it from a draft. */
export async function deleteProcessedImage(
  reportId: string,
  imageId: string,
): Promise<void> {
  await removeQuietly(imagePath(reportId, imageId));
}
