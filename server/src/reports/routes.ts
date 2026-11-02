import { Router } from 'express';
import { HttpError } from '../errors';
import type { StoredReport } from '../types';
import type { ReportStore } from './store';
import { parseReportId, parseReportInput } from './validate';

/** What clients receive: the stored report plus where to fetch each image. */
function toView(report: StoredReport) {
  return { ...report, imageUrls: report.imageIds.map((id) => `/files/${id}`) };
}

export function reportRoutes(store: ReportStore): Router {
  const router = Router();

  router.put('/reports/:id', async (req, res) => {
    const id = parseReportId(req.params.id);
    const input = parseReportInput(req.body);
    const result = await store.put(id, input);

    switch (result.outcome) {
      case 'created':
        res.status(201).json(toView(result.report));
        return;
      case 'unchanged':
        res.status(200).json(toView(result.report));
        return;
      case 'conflict':
        throw new HttpError(409, 'conflict', 'A different report already exists with this ID');
    }
  });

  router.get('/reports', async (_req, res) => {
    res.json((await store.list()).map(toView));
  });

  router.get('/reports/:id', async (req, res) => {
    const report = await store.get(parseReportId(req.params.id));
    if (!report) throw new HttpError(404, 'not_found', 'Report not found');
    res.json(toView(report));
  });

  return router;
}
