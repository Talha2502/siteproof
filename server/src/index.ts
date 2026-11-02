import os from 'node:os';
import express from 'express';
import { HOST, PORT, REPORTS_DIR, UPLOADS_DIR } from './config';
import { errorHandler, HttpError } from './errors';
import { reportRoutes } from './reports/routes';
import { ReportStore } from './reports/store';
import { fileRoutes, UploadedImages } from './uploads/files';
import { createTusServer, NonTruncatingFileStore, uploadRoutes } from './uploads/tus';

const store = new ReportStore(REPORTS_DIR);
await store.init();

const uploadStore = new NonTruncatingFileStore({ directory: UPLOADS_DIR });
const images = new UploadedImages(uploadStore);

const app = express();

// tus reads the raw request body, so it is mounted before the JSON parser.
app.use(uploadRoutes(createTusServer(uploadStore)));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use(reportRoutes(store, images));
app.use(fileRoutes(images));

app.use((_req, _res, next) => {
  next(new HttpError(404, 'not_found', 'Route not found'));
});
app.use(errorHandler);

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((ifaces) => ifaces ?? [])
    .filter((iface) => iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

app.listen(PORT, HOST, () => {
  console.log(`SiteProof server listening on http://localhost:${PORT}`);
  for (const address of lanAddresses()) {
    console.log(`  on your network: http://${address}:${PORT}`);
  }
});
