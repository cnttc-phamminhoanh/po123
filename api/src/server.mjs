import cors from 'cors';
import express from 'express';

import { config } from './config.mjs';
import { closePool, pingDatabase } from './db.mjs';
import { bomRouter } from './routes.mjs';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ ok: true, db: 'up' });
  } catch (error) {
    res.status(503).json({ ok: false, db: 'down', message: error.message });
  }
});

app.use('/api/bom', bomRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route không tồn tại' } });
});

app.use((error, _req, res, _next) => {
  console.error('[api]', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: error?.message ?? 'Lỗi máy chủ',
    },
  });
});

const server = app.listen(config.port, () => {
  console.info(`[api] BOM API nghe tại http://localhost:${config.port}`);
});

const shutdown = async () => {
  server.close();
  await closePool().catch(() => undefined);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
