import { mkdir, rm } from 'node:fs/promises';
import { Router } from 'express';
import { parseFaultConfig, type FaultState } from './config';

/** Admin routes are never faulted (see the fault middleware). */
export function adminRoutes(faults: FaultState, dataDirs: string[]): Router {
  const router = Router();

  router.get('/admin/faults', (_req, res) => {
    res.json(faults.get());
  });

  router.put('/admin/faults', (req, res) => {
    faults.set(parseFaultConfig(req.body));
    res.json(faults.get());
  });

  router.delete('/admin/faults', (_req, res) => {
    faults.reset();
    res.json(faults.get());
  });

  /** Deletes every report and upload on the server. Fault config is left as it is. */
  router.post('/admin/reset', async (_req, res) => {
    for (const dir of dataDirs) {
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
    }
    res.status(204).end();
  });

  return router;
}
