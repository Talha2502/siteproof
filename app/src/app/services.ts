import { AppState } from 'react-native';
import { DeviceFiles } from '../adapters/files';
import { deletePickerLeftovers } from '../adapters/imageProcessor';
import { NetInfoMonitor } from '../adapters/netInfoMonitor';
import { SqliteReportRepository } from '../adapters/sqliteRepository';
import { systemClock, uuidGenerator } from '../adapters/system';
import { XhrTransport } from '../adapters/xhrTransport';
import { UploadEngine } from '../core/engine';
import type { IdGenerator } from '../core/ports';

/** Works on an emulator or a USB phone after `adb reverse tcp:3000 tcp:3000`. Editable in Settings. */
export const DEFAULT_SERVER_URL = 'http://localhost:3000';

export interface Services {
  engine: UploadEngine;
  ids: IdGenerator;
  serverUrl: () => string;
}

/**
 * Builds the engine with the real adapters and starts it (which also cleans up
 * after a crash). The UI waits for this before allowing a new report, because
 * start() deletes photo folders that have no saved report yet.
 */
export async function createServices(): Promise<Services> {
  const serverUrl = DEFAULT_SERVER_URL;
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

  return { engine, ids: uuidGenerator, serverUrl: () => serverUrl };
}
