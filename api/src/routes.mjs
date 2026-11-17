import { Router } from 'express';
import multer from 'multer';

import { config } from './config.mjs';
import { query } from './db.mjs';
import { requireAuth } from './auth.mjs';
import { findStylePhoto, photoUrlFor, recordPhotoUpload, saveStylePhoto } from './photo-store.mjs';
import { getLatestStyle, getStyleDetail, getStyleList, styleExists, getCacheStats } from './service.mjs';
import { SQL_DEBUG_COUNTS } from './sql.mjs';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.photo.maxBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    const error = new Error('UNSUPPORTED_TYPE');
    error.status = 415;
    callback(error);
  },
});

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const normalizeIp = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^::ffff:/i, '');

const photoAccessContext = (req) => {
  const clientIp = normalizeIp(req.ip ?? req.socket?.remoteAddress ?? '');
  const requestHost = String(req.headers.host ?? '').trim();
  const origin = String(req.headers.origin ?? '').trim();
  const accessHost = origin.replace(/^https?:\/\//i, '') || requestHost;
  let hostName = accessHost.toLowerCase();
  if (hostName.startsWith('[')) {
    hostName = hostName.slice(1, hostName.indexOf(']'));
  } else {
    hostName = hostName.split(':')[0];
  }
  const isLocal = LOOPBACK_HOSTS.has(hostName) || LOOPBACK_HOSTS.has(clientIp);
  return {
    source: isLocal ? 'local' : 'server',
    host: accessHost,
    clientIp,
  };
};

export const bomRouter = Router();

bomRouter.get(
  '/styles',
  asyncRoute(async (_req, res) => {
    res.json(await getStyleList());
  }),
);

bomRouter.get(
  '/latest-style',
  asyncRoute(async (_req, res) => {
    const latest = await getLatestStyle();
    if (!latest) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Chưa có báo giá PO nào trong hệ thống' },
      });
      return;
    }
    res.json(latest);
  }),
);

bomRouter.get(
  '/debug/cache',
  asyncRoute(async (_req, res) => {
    res.json(getCacheStats());
  }),
);

bomRouter.get(
  '/debug/counts',
  asyncRoute(async (_req, res) => {
    const rows = await query(SQL_DEBUG_COUNTS);
    res.json(rows[0] ?? {});
  }),
);

bomRouter.post(
  '/styles/:code/photo',
  requireAuth,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const code = String(req.params.code ?? '').trim();
    if (!code || !(await styleExists(code))) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Không tìm thấy style ${code}` },
      });
      return;
    }
    const saved = await saveStylePhoto(code, req.file);
    const photoUpload = await recordPhotoUpload(
      code,
      saved.fileName,
      req.user,
      photoAccessContext(req),
    );
    res.status(201).json({ ...saved, photoUpload });
  }),
);

bomRouter.get(
  '/styles/:code/photo',
  asyncRoute(async (req, res) => {
    const file = await findStylePhoto(req.params.code);
    if (!file) {
      res.status(404).json({
        error: { code: 'PHOTO_NOT_FOUND', message: 'Style chưa có ảnh' },
      });
      return;
    }
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(file.fullPath);
  }),
);

bomRouter.get(
  '/styles/:code',
  asyncRoute(async (req, res) => {
    const detail = await getStyleDetail(
      req.params.code,
      req.query.season ? String(req.query.season) : undefined,
      req.query.sizeGroup ? String(req.query.sizeGroup) : undefined,
    );
    if (detail) {
      res.json({ ...detail, photoUrl: await photoUrlFor(detail.code) });
      return;
    }
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Không tìm thấy style ${req.params.code}` },
    });
  }),
);

bomRouter.patch('/styles/:code/pos/:poNo', (_req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_SUPPORTED',
      message: 'Sửa chi phí trực tiếp trên dữ liệu ERP chưa được mở khoá.',
    },
  });
});
