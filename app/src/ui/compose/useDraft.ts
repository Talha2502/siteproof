import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceFiles } from '../../adapters/files';
import {
  deletePickerCopy,
  deletePickerLeftovers,
  deleteProcessedImage,
  ImageProcessingError,
  processImage,
} from '../../adapters/imageProcessor';
import { useServices } from '../../app/ServicesProvider';
import {
  addPhotos,
  checkSubmit,
  emptyDraft,
  photoFailed,
  photoReady,
  removePhoto,
  setDescription,
  slotsLeft,
  type Draft,
} from '../../core/draft';

const files = new DeviceFiles();

/**
 * The draft being composed. Photos are processed as soon as they are picked,
 * one at a time (several 18 MB decodes at once could exhaust memory), so
 * Submit is instant once they are ready.
 */
export function useDraft() {
  const { engine, ids } = useServices();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(ids.newId()));
  const latest = useRef(draft);
  latest.current = draft;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const removed = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Compose is closing, so no picker can be writing files now (see deletePickerLeftovers).
      deletePickerLeftovers().catch(() => {});
    };
  }, []);

  const addPicked = useCallback(
    (uris: string[]) => {
      const reportId = latest.current.id;
      const accepted = uris
        .slice(0, slotsLeft(latest.current))
        .map(uri => ({ id: ids.newId(), previewUri: uri }));
      setDraft(d => addPhotos(d, accepted));
      for (const photo of accepted) {
        queue.current = queue.current.then(async () => {
          if (removed.current.has(photo.id) || !mounted.current) {
            await deletePickerCopy(photo.previewUri);
            return;
          }
          try {
            const image = await processImage(
              photo.previewUri,
              reportId,
              photo.id,
            );
            if (removed.current.has(photo.id) || !mounted.current) {
              await deleteProcessedImage(reportId, photo.id);
              return;
            }
            setDraft(d => photoReady(d, photo.id, image));
          } catch (err) {
            const message =
              err instanceof ImageProcessingError
                ? err.message
                : "Couldn't prepare this photo";
            if (mounted.current)
              setDraft(d => photoFailed(d, photo.id, message));
          } finally {
            // The processed copy is what we keep; the picker's full-size copy is no longer needed.
            await deletePickerCopy(photo.previewUri);
          }
        });
      }
    },
    [ids],
  );

  const remove = useCallback((photoId: string) => {
    removed.current.add(photoId);
    setDraft(d => removePhoto(d, photoId));
    deleteProcessedImage(latest.current.id, photoId).catch(() => {});
  }, []);

  /** Throws away the draft and its processed photos. */
  const discard = useCallback(async () => {
    for (const photo of latest.current.photos) removed.current.add(photo.id);
    await files.deleteReportFiles(latest.current.id);
  }, []);

  /** Saves the report durably. Resolves once it is safe on the phone. */
  const submit = useCallback(async () => {
    const check = checkSubmit(latest.current);
    if (!check.ok) throw new Error(check.reason);
    await engine.submit({
      ...check.report,
      createdAt: new Date().toISOString(),
    });
  }, [engine]);

  return {
    draft,
    setDescription: (text: string) => setDraft(d => setDescription(d, text)),
    addPicked,
    remove,
    discard,
    submit,
  };
}
