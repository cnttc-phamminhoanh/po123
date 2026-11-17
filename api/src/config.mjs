import 'dotenv/config';

const env = process.env;
const asBool = (value, fallback) =>
  value === undefined ? fallback : value.toLowerCase() === 'true';
const asPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  host: env.API_HOST || '127.0.0.1',
  port: Number(env.PORT ?? 3001),
  corsOrigin: env.CORS_ORIGIN ?? '*',
  auth: {
    username: String(env.AUTH_USER ?? '').trim(),
    password: env.AUTH_PASSWORD ?? '',
    secret: env.AUTH_SECRET || '',
    ttlHours: asPositiveNumber(env.AUTH_TTL_HOURS, 168),
    secureCookie: asBool(env.COOKIE_SECURE, false),
  },
  photo: {
    dir: env.PHOTO_DIR || 'C:\\po123-data\\photos',
    maxBytes: asPositiveNumber(env.PHOTO_MAX_MB, 8) * 1024 * 1024,
  },
  cache: {
    styleDetailTtlMs: asPositiveNumber(env.STYLE_DETAIL_CACHE_TTL_MS, 5 * 60 * 1000),
    latestStyleTtlMs: asPositiveNumber(env.STYLE_LATEST_CACHE_TTL_MS, 60 * 1000),
    maxEntries: asPositiveNumber(env.STYLE_CACHE_MAX_ENTRIES, 50),
  },
  db: {
    server: env.DB_SERVER ?? 'localhost',
    port: Number(env.DB_PORT ?? 1433),
    database: env.DB_NAME ?? 'PO123',
    user: env.DB_USER ?? undefined,
    password: env.DB_PASSWORD ?? undefined,
    domain: env.DB_DOMAIN || undefined,
    instanceName: env.DB_INSTANCE || undefined,
    encrypt: asBool(env.DB_ENCRYPT, false),
    trustServerCertificate: asBool(env.DB_TRUST_CERT, true),
    options: {
      requestTimeout: 30000,
      ...(env.DB_INSTANCE ? { instanceName: env.DB_INSTANCE } : {}),
    },
  },
  oldDb: {
    server: env.OLD_DB_SERVER ?? '',
    port: Number(env.OLD_DB_PORT ?? 9000),
    database: env.OLD_DB_NAME ?? 'erp_t8_GI',
    user: env.OLD_DB_USER ?? undefined,
    password: env.OLD_DB_PASSWORD ?? undefined,
    domain: env.OLD_DB_DOMAIN || undefined,
    instanceName: env.OLD_DB_INSTANCE || undefined,
    encrypt: asBool(env.OLD_DB_ENCRYPT, false),
    trustServerCertificate: asBool(env.OLD_DB_TRUST_CERT, true),
    options: {
      requestTimeout: 30000,
      ...(env.OLD_DB_INSTANCE ? { instanceName: env.OLD_DB_INSTANCE } : {}),
    },
  },
};
