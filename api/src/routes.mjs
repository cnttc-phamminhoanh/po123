import { Router } from 'express';

import { getPhoto, setPhoto } from './photos.mjs';
import { getStyleDetail, getStyleList } from './service.mjs';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const bomRouter = Router();

bomRouter.get(
  '/styles',
  asyncRoute(async (_req, res) => {
    res.json(await getStyleList());
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
      detail.photoUrl = detail.photoUrl || getPhoto(detail.code);
      res.json(detail);
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

bomRouter.post(
  '/styles/photos',
  asyncRoute(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const bound = [];
    const unmatched = [];
    items.forEach((item) => {
      if (item?.styleCode && item?.photoUrl) {
        setPhoto(item.styleCode, item.photoUrl);
        bound.push({
          styleCode: String(item.styleCode),
          fileName: String(item.fileName ?? ''),
          photoUrl: String(item.photoUrl),
        });
        return;
      }
      unmatched.push(item);
    });
    res.json({ bound, unmatched });
  }),
);
