import { AppState } from 'react-native';
import { DeviceFiles } from '../adapters/files';
import { deletePickerLeftovers } from '../adapters/imageProcessor';
import { NetInfoMonitor } from '../adapters/netInfoMonitor';
import { loadSettings, saveSettings } from '../adapters/settingsStore';
import { SqliteReportRepository } from '../adapters/sqliteRepository';
import { systemClock, uuidGenerator } from '../adapters/system';
import { XhrTransport } from '../adapters/xhrTransport';
import { UploadEngine } from '../core/engine';
import type { FileCleaner, IdGenerator } from '../core/ports';

/** Works on an emulator or a USB phone after `adb reverse tcp:3000 tcp:3000`. Editable in Settings. */
export const DEFAULT_SERVER_URL = 'http://localhost:3000';

export interface Services {
  engine: UploadEngine;
  ids: IdGenerator;
  files: FileCleaner;
  serverUrl: () => string;
  /** Saves a new (already validated) server address; uploads use it from the next request. */
  setServerUrl: (url: string) => Promise<void>;
  /**
   * Deletes everything SiteProof keeps on this phone (reports, photos, leftover
   * picker copies), aborting any upload first. Never touches the server.
   * Resolves to false if any report folder is still there afterwards.
   */
  resetPhone: () => Promise<boolean>;
}

/**
 * Builds the engine with the real adapters and starts it (which also cleans up
 * after a crash). The UI waits for this before allowing a new report, because
 * start() deletes photo folders that have no saved report yet.
 */
export async function createServices(): Promise<Services> {
  const settings = await loadSettings({ serverUrl: DEFAULT_SERVER_URL });
  let serverUrl = settings.serverUrl;
  const files = new DeviceFiles();
  const engine = new UploadEngine({
    repository: await SqliteReportRepository.open(),
    transport: new XhrTransport({ baseUrl: () => serverUrl }),
    files,
    cleaner: files,
    network: new NetInfoMonitor(),
    clock: systemClock,
  });
  await engine.start();
  // A crash mid-compose can leave full-size picker copies behind.
  deletePickerLeftovers().catch(() => {});

  // Coming back to the app is a good moment to retry without waiting out a backoff.
  AppState.addEventListener('change', state => {
    if (state === 'active') engine.wake();
  });

  return {
    engine,
    ids: uuidGenerator,
    files,
    serverUrl: () => serverUrl,
    setServerUrl: async url => {
      await saveSettings({ serverUrl: url });
      serverUrl = url;
      // Reports waiting on the old address should try the new one straight away.
      engine.wake();
    },
    resetPhone: async () => {
      await engine.removeAll();
      await deletePickerLeftovers();
      return (await files.listReportFolders()).length === 0;
    },
  };
}
