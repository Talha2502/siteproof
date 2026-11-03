import { Linking, PermissionsAndroid, Platform } from 'react-native';

/**
 * - granted: the camera can be opened.
 * - askable: not granted yet, but asking will show the system prompt.
 * - blocked: the user said no in a way that hides the prompt ("Don't allow" twice,
 *   or turned it off in Settings); only Settings can change it.
 */
export type CameraAccess = 'granted' | 'askable' | 'blocked';

const CAMERA = PermissionsAndroid.PERMISSIONS.CAMERA;

/** Reads the current state without prompting. Call on AppState "active" to notice a change made in Settings. */
export async function checkCameraAccess(): Promise<'granted' | 'not_granted'> {
  // On iOS the picker asks by itself and reports a refusal as an error.
  if (Platform.OS !== 'android') return 'granted';
  return (await PermissionsAndroid.check(CAMERA)) ? 'granted' : 'not_granted';
}

/** Shows the system prompt if Android still allows it. */
export async function requestCameraAccess(): Promise<CameraAccess> {
  if (Platform.OS !== 'android') return 'granted';
  const result = await PermissionsAndroid.request(CAMERA);
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'askable';
}

export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}
