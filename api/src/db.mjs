import sql from 'mssql';

import { config } from './config.mjs';

let poolPromise = null;
let oldPoolPromise = null;

const buildAuth = (dbConfig) =>
  dbConfig.domain
    ? {
      authentication: {
        type: 'ntlm',
        options: {
          domain: dbConfig.domain,
          userName: dbConfig.user,
          password: dbConfig.password,
        },
      },
    }
    : { user: dbConfig.user, password: dbConfig.password };

const createPool = (dbConfig, max) =>
  new sql.ConnectionPool({
    server: dbConfig.server,
    port: dbConfig.port,
    database: dbConfig.database,
    encrypt: dbConfig.encrypt,
    trustServerCertificate: dbConfig.trustServerCertificate,
    options: dbConfig.options,
    pool: { max, min: 0, idleTimeoutMillis: 30000 },
    ...buildAuth(dbConfig),
  });

const connectPool = (pool) =>
  pool.connect().catch((error) => {
    throw error;
  });

export const getPool = () => {
  if (!poolPromise) {
    const pool = createPool(config.db, 10);
    poolPromise = connectPool(pool).catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
};

/**
 * Pool riêng cho máy chủ cũ chứa các bảng ig_pywrkord / ig_pywrkstp /
 * ig_pystpasm. Không dùng nhầm sang DB hiện tại.
 */
export const getOldPool = () => {
  if (!config.oldDb.server) {
    return Promise.reject(
      new Error('Thiếu OLD_DB_SERVER trong api/.env; chưa cấu hình máy chủ cũ.'),
    );
  }
  if (!oldPoolPromise) {
    const pool = createPool(config.oldDb, 5);
    oldPoolPromise = connectPool(pool).catch((error) => {
      oldPoolPromise = null;
      throw error;
    });
  }
  return oldPoolPromise;
};

const runQuery = async (pool, text, params = {}) => {
  const request = pool.request();
  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value ?? null);
  });
  const result = await request.query(text);
  return result.recordset ?? [];
};

/** Chạy query trên DB hiện tại (RDS). */
export const query = async (text, params = {}) => {
  const pool = await getPool();
  return runQuery(pool, text, params);
};

/** Chạy query trên máy chủ cũ (ig_pywrkord / ig_pywrkstp / ig_pystpasm). */
export const queryOld = async (text, params = {}) => {
  const pool = await getOldPool();
  return runQuery(pool, text, params);
};

export const pingDatabase = async () => {
  await query('SELECT 1 AS ok');
  return true;
};

export const closePool = async () => {
  const current = await poolPromise?.catch(() => null);
  poolPromise = null;
  if (current) await current.close();

  const old = await oldPoolPromise?.catch(() => null);
  oldPoolPromise = null;
  if (old) await old.close();
};
