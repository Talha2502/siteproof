import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';

export type PickResult =
  | { kind: 'picked'; uris: string[] }
  | { kind: 'cancelled' }
  /** iOS reports a denied permission here; Android permission is checked before launching. */
  | { kind: 'permission_denied' }
  | { kind: 'unavailable'; message: string };

function toResult(response: ImagePickerResponse): PickResult {
  if (response.didCancel) return { kind: 'cancelled' };
  if (response.errorCode === 'permission') return { kind: 'permission_denied' };
  if (response.errorCode === 'camera_unavailable') {
    return {
      kind: 'unavailable',
      message: 'This device has no camera available',
    };
  }
  if (response.errorCode) {
    return { kind: 'unavailable', message: "Couldn't open the photo picker" };
  }
  const uris = (response.assets ?? [])
    .map(asset => asset.uri)
    .filter((uri): uri is string => typeof uri === 'string');
  return uris.length > 0 ? { kind: 'picked', uris } : { kind: 'cancelled' };
}

// quality 1 and no max size: the picker hands over the original, and our own
// pipeline (imageProcessor) does all shrinking, once, with EXIF handled.

export async function takePhoto(): Promise<PickResult> {
  return toResult(
    await launchCamera({ mediaType: 'photo', quality: 1, saveToPhotos: false }),
  );
}

/** Opens the system photo picker (no storage permission needed), allowing up to `limit` photos. */
export async function pickFromGallery(limit: number): Promise<PickResult> {
  return toResult(
    await launchImageLibrary({
      mediaType: 'photo',
      quality: 1,
      selectionLimit: Math.max(1, limit),
    }),
  );
}
