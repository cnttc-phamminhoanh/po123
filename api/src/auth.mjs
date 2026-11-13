import crypto from 'node:crypto';
import { Router } from 'express';

import { config } from './config.mjs';
import {
  authenticate,
  createUser,
  ensureUsersReady,
  findUserById,
  listUsers,
  updateUser,
  UserError,
} from './user-store.mjs';
import { searchPhotoHistory } from './photo-store.mjs';

const COOKIE_NAME = 'po_auth';
const MAX_AGE_SECONDS = Math.round(config.auth.ttlHours * 3600);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20;

const loginAttempts = new Map();

const clientKey = (req) =>
  String(req.ip ?? req.socket?.remoteAddress ?? 'unknown');

const isRateLimited = (key, now) => {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
};

const recordFailure = (key, now) => {
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
};

const clearFailures = (key) => {
  loginAttempts.delete(key);
};

const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.auth.secret)
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
};

const sessionFingerprint = (passwordHash) =>
  crypto
    .createHash('sha256')
    .update(String(passwordHash ?? ''), 'utf8')
    .digest('base64url')
    .slice(0, 24);

const verify = (token) => {
  const [body, signature] = String(token ?? '').split('.');
  if (!body || !signature) return null;
  const expected = crypto
    .createHmac('sha256', config.auth.secret)
    .update(body)
    .digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !Number.isFinite(payload.uid)) return null;
    if (!Number.isFinite(payload.exp) || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

const parseCookies = (header) => {
  const result = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    const raw = part.slice(index + 1).trim();
    try {
      result[key] = decodeURIComponent(raw);
    } catch {
      result[key] = raw;
    }
  }
  return result;
};

const assertSessionReady = () => {
  if (!config.auth.secret) {
    throw new UserError(
      'AUTH_NOT_CONFIGURED',
      'Chưa cấu hình AUTH_SECRET trong api/.env. Hãy đặt một chuỗi ngẫu nhiên dài để ký phiên đăng nhập.',
      503,
    );
  }
};

const ensureAuthReady = async () => {
  await ensureUsersReady();
  assertSessionReady();
};

export const getAuthUser = async (req) => {
  assertSessionReady();
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const payload = verify(token);
  if (!payload) return null;
  const row = await findUserById(payload.uid);
  if (!row || !row.is_active) return null;
  if (row.username !== payload.sub) return null;
  if (!payload.pv || payload.pv !== sessionFingerprint(row.password_hash)) return null;
  return {
    id: row.id,
    username: row.username,
    empNo: row.emp_no ?? null,
    empName: row.emp_name ?? null,
    role: row.role,
  };
};

const setSessionCookie = (res, user) => {
  const token = sign({
    sub: user.username,
    uid: user.id,
    role: user.role,
    pv: sessionFingerprint(user.password_hash),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.auth.secureCookie,
    path: '/',
    maxAge: MAX_AGE_SECONDS * 1000,
  });
};

const clearSessionCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.auth.secureCookie,
    path: '/',
  });
};

const authError = (res, status, code, message) =>
  res.status(status).json({ error: { code, message } });

const sendError = (res, error) => {
  if (error instanceof UserError) {
    authError(res, error.status, error.code, error.message);
    return true;
  }
  if (error?.number === 2627 || error?.number === 2601) {
    authError(res, 409, 'USER_EXISTS', 'Mã nhân viên này đã có tài khoản.');
    return true;
  }
  return false;
};

const route = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (!sendError(res, error)) next(error);
  }
};

/** Chỉ chặn các route cần quyền ghi, ví dụ upload ảnh. */
export const requireAuth = async (req, res, next) => {
  try {
    await ensureAuthReady();
    const user = await getAuthUser(req);
    if (!user) {
      authError(res, 401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập để upload ảnh');
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    if (!sendError(res, error)) next(error);
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    authError(res, 403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    return;
  }
  next();
};

export const authRouter = Router();

authRouter.get(
  '/me',
  route(async (req, res) => {
    await ensureAuthReady();
    const user = await getAuthUser(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ authenticated: Boolean(user), user: user ?? null });
  }),
);

authRouter.post(
  '/login',
  route(async (req, res) => {
    await ensureAuthReady();
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      authError(res, 400, 'AUTH_BAD_REQUEST', 'Vui lòng nhập tên đăng nhập và mật khẩu');
      return;
    }

    const key = clientKey(req);
    const now = Date.now();
    if (isRateLimited(key, now)) {
      authError(
        res,
        429,
        'AUTH_TOO_MANY',
        'Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ít phút.',
      );
      return;
    }

    const user = await authenticate(username, password);
    if (!user) {
      recordFailure(key, now);
      authError(res, 401, 'AUTH_INVALID', 'Sai mã nhân viên hoặc mật khẩu');
      return;
    }

    clearFailures(key);
    setSessionCookie(res, user);
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        empNo: user.empNo,
        empName: user.empName,
        role: user.role,
      },
    });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ authenticated: false, user: null });
});

/** Quản lý tài khoản: chỉ admin. Tất cả tài khoản đang hoạt động đều upload được. */
authRouter.get(
  '/users',
  requireAuth,
  requireAdmin,
  route(async (_req, res) => {
    const users = await listUsers();
    res.json({ users });
  }),
);

authRouter.post(
  '/users',
  requireAuth,
  requireAdmin,
  route(async (req, res) => {
    const user = await createUser({
      empNo: req.body?.empNo ?? req.body?.emp_no ?? req.body?.username,
      password: req.body?.password,
      role: req.body?.role,
    });
    res.status(201).json({ user });
  }),
);

/** Lịch sử upload ảnh: chỉ admin. */
authRouter.get(
  '/photo-history',
  requireAuth,
  requireAdmin,
  route(async (req, res) => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    if ((from && !datePattern.test(from)) || (to && !datePattern.test(to))) {
      throw new UserError('BAD_DATE', 'Ngày lọc không hợp lệ.', 400);
    }
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(200, Math.max(1, Math.trunc(rawLimit)))
      : 50;
    const offset = Number.isFinite(rawOffset)
      ? Math.max(0, Math.trunc(rawOffset))
      : 0;
    const result = await searchPhotoHistory({
      style: String(req.query.style ?? '').trim(),
      uploader: String(req.query.uploader ?? '').trim(),
      from: from || null,
      to: to || null,
      limit,
      offset,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  }),
);

authRouter.patch(
  '/users/:id',
  requireAuth,
  requireAdmin,
  route(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new UserError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
    }
    const user = await updateUser(id, {
      role: req.body?.role,
      active: req.body?.active,
      password: req.body?.password,
    });
    res.json({ user });
  }),
);
