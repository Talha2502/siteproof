import * as FS from '@dr.pogodin/react-native-fs';

/** Kept outside reports/, so neither crash cleanup nor Reset touches it: it is configuration, not data. */
const SETTINGS_PATH = `${FS.DocumentDirectoryPath}/settings.json`;

export interface AppSettings {
  serverUrl: string;
}

/**
 * Cleans up a typed server address: trims it, drops trailing slashes, and
 * accepts only http(s)://host[:port][/path]. Returns undefined if invalid.
 */
export function normaliseServerUrl(input: string): string | undefined {
  const value = input.trim().replace(/\/+$/, '');
  return /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?(\/[^\s]*)?$/.test(value)
    ? value
    : undefined;
}

export async function loadSettings(
  defaults: AppSettings,
): Promise<AppSettings> {
  try {
    if (!(await FS.exists(SETTINGS_PATH))) return defaults;
    const parsed: unknown = JSON.parse(
      await FS.readFile(SETTINGS_PATH, 'utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    const raw = (parsed as Record<string, unknown>).serverUrl;
    const serverUrl =
      typeof raw === 'string' ? normaliseServerUrl(raw) : undefined;
    return { ...defaults, ...(serverUrl ? { serverUrl } : {}) };
  } catch {
    // A damaged settings file must never stop the app from starting.
    return defaults;
  }
}

/** Written to a temp file and moved into place, so a crash never leaves half a file. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const temp = `${SETTINGS_PATH}.tmp`;
  await FS.writeFile(temp, JSON.stringify(settings), 'utf8');
  if (await FS.exists(SETTINGS_PATH)) await FS.unlink(SETTINGS_PATH);
  await FS.moveFile(temp, SETTINGS_PATH);
}
