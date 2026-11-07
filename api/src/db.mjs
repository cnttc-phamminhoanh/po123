import sql from 'mssql';

import { config } from './config.mjs';

let poolPromise = null;

export const getPool = () => {
  if (!poolPromise) {
    const auth = config.db.domain
      ? {
          authentication: {
            type: 'ntlm',
            options: {
              domain: config.db.domain,
              userName: config.db.user,
              password: config.db.password,
            },
          },
        }
      : { user: config.db.user, password: config.db.password };
    const pool = new sql.ConnectionPool({
      server: config.db.server,
      port: config.db.port,
      database: config.db.database,
      encrypt: config.db.encrypt,
      trustServerCertificate: config.db.trustServerCertificate,
      options: config.db.options,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      ...auth,
    });
    poolPromise = pool.connect().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
};

/** Chạy một câu query với tham số dạng object, trả về recordset đầu tiên. */
export const query = async (text, params = {}) => {
  const pool = await getPool();
  const request = pool.request();
  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value ?? null);
  });
  const result = await request.query(text);
  return result.recordset ?? [];
};

export const pingDatabase = async () => {
  await query('SELECT 1 AS ok');
  return true;
};

export const closePool = async () => {
  if (!poolPromise) return;
  const pool = await poolPromise.catch(() => null);
  poolPromise = null;
  if (pool) await pool.close();
};
