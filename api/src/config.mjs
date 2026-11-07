import 'dotenv/config';

const env = process.env;
const asBool = (value, fallback) =>
  value === undefined ? fallback : value.toLowerCase() === 'true';

export const config = {
  port: Number(env.PORT ?? 3001),
  corsOrigin: env.CORS_ORIGIN ?? '*',
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
};
