import cors from 'cors';
import express from 'express';

import { config } from './config.mjs';
import { closePool, pingDatabase, warmupPools } from './db.mjs';
import { authRouter } from './auth.mjs';
import { bomRouter } from './routes.mjs';

const app = express();

// API chạy sau Nginx trên cùng máy: cần tin một lớp proxy để req.ip là IP thật của người dùng, không phải 127.0.0.1 dùng chung cho mọi người.
app.set('trust proxy', 1);

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

app.use('/api/auth', authRouter);
app.use('/api/bom', bomRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route không tồn tại' } });
});

app.use((error, _req, res, _next) => {
  if (error?.message === 'UNSUPPORTED_TYPE') {
    res.status(415).json({
      error: { code: 'UNSUPPORTED_TYPE', message: 'Chỉ nhận ảnh JPG, PNG hoặc WEBP' },
    });
    return;
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: { code: 'FILE_TOO_LARGE', message: 'Ảnh vượt quá 8 MB' },
    });
    return;
  }
  if (error?.status && error.status >= 400 && error.status < 500) {
    res.status(error.status).json({
      error: { code: 'BAD_REQUEST', message: error.message },
    });
    return;
  }
  console.error('[api]', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: error?.message ?? 'Lỗi máy chủ',
    },
  });
});

try {
  const startedAt = Date.now();
  await warmupPools();
  console.info(`[api] DB pools sẵn sàng sau ${Date.now() - startedAt}ms`);
} catch (error) {
  console.warn('[api] Không làm nóng được DB pool:', error.message);
}

const server = app.listen(config.port, config.host, () => {
  console.info(`[api] API nghe tại http://${config.host}:${config.port}`);
  if (!config.auth.secret) {
    console.warn(
      '[auth] Chưa cấu hình AUTH_SECRET trong api/.env — đăng nhập và upload ảnh đang bị khóa.',
    );
  } else if (!config.auth.username || !config.auth.password) {
    console.info(
      '[auth] Không có AUTH_USER / AUTH_PASSWORD — API dùng các tài khoản đã có trong dbo.po_app_user.',
    );
  }
});

const shutdown = async () => {
  server.close();
  await closePool().catch(() => undefined);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
