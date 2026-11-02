import express from 'express';

const PORT = Number(process.env.PORT ?? 3000);

const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SiteProof server listening on http://0.0.0.0:${PORT}`);
});
