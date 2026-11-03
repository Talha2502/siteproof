import * as FS from '@dr.pogodin/react-native-fs';
import type { FileCleaner, FileReader } from '../core/ports';

/** Processed images live at <DocumentDir>/reports/<reportId>/<imageId>.jpg. */
export const REPORTS_DIR = `${FS.DocumentDirectoryPath}/reports`;

const SAFE_ID = /^[0-9a-zA-Z-]+$/;

/** IDs become path segments, so only allow UUID characters: nothing can climb out of REPORTS_DIR. */
function safeId(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`Unsafe ID for a path: ${id}`);
  return id;
}

export function reportDir(reportId: string): string {
  return `${REPORTS_DIR}/${safeId(reportId)}`;
}

export function imagePath(reportId: string, imageId: string): string {
  return `${reportDir(reportId)}/${safeId(imageId)}.jpg`;
}

export class DeviceFiles implements FileReader, FileCleaner {
  async readChunk(
    path: string,
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    const buffer = await FS.read(path, length, offset, 'ArrayBuffer');
    return new Uint8Array(buffer);
  }

  async deleteReportFiles(reportId: string): Promise<void> {
    const dir = reportDir(reportId);
    // unlink removes a directory with everything in it.
    if (await FS.exists(dir)) await FS.unlink(dir);
  }

  async listReportFolders(): Promise<string[]> {
    if (!(await FS.exists(REPORTS_DIR))) return [];
    const entries = await FS.readDir(REPORTS_DIR);
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  }
}
