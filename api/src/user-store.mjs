import { config } from './config.mjs';
import { query } from './db.mjs';
import { hashPassword, verifyPassword } from './password.mjs';
import {
  SQL_AUTH_ACTIVE_ADMIN_COUNT,
  SQL_AUTH_SCHEMA,
  SQL_AUTH_USER_COUNT,
  SQL_AUTH_USER_BY_ID,
  SQL_AUTH_USER_BY_NAME,
  SQL_AUTH_USER_INSERT,
  SQL_AUTH_USER_LIST,
  SQL_AUTH_USER_SET_ACTIVE,
  SQL_AUTH_USER_SET_PASSWORD,
  SQL_AUTH_USER_SET_ROLE,
  SQL_EMP_BY_NO,
} from './sql.mjs';

export class UserError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'UserError';
    this.code = code;
    this.status = status;
  }
}

const ROLE_VALUES = new Set(['admin', 'user']);
const EMP_NO_PATTERN = /^[A-Za-z0-9._-]{1,20}$/;

const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  empNo: row.emp_no ?? null,
  empName: row.emp_name ?? null,
  role: row.role,
  active: Boolean(row.is_active),
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? null,
});

const toAuthUser = (row) => ({
  id: row.id,
  username: row.username,
  empNo: row.emp_no ?? null,
  empName: row.emp_name ?? null,
  role: row.role,
  password_hash: row.password_hash,
});

let schemaPromise = null;

export const ensureAuthSchema = () => {
  if (!schemaPromise) {
    schemaPromise = query(SQL_AUTH_SCHEMA).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
};

const createBootstrapAdmin = async () => {
  await ensureAuthSchema();
  if (!config.auth.username || !config.auth.password) return;
  const rows = await query(SQL_AUTH_USER_COUNT);
  if (Number(rows[0]?.total ?? 0) > 0) return;
  const passwordHash = await hashPassword(config.auth.password);
  await query(SQL_AUTH_USER_INSERT, {
    username: config.auth.username,
    emp_no: null,
    emp_name: null,
    password_hash: passwordHash,
    role: 'admin',
  });
};

let bootstrapPromise = null;

/** Tạo admin đầu tiên từ AUTH_USER/AUTH_PASSWORD nếu bảng còn trống. */
export const ensureUsersReady = () => {
  if (!bootstrapPromise) {
    bootstrapPromise = createBootstrapAdmin().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
};

export const findUserByUsername = async (username) => {
  const rows = await query(SQL_AUTH_USER_BY_NAME, { username });
  return rows[0] ?? null;
};

export const findUserById = async (id) => {
  const rows = await query(SQL_AUTH_USER_BY_ID, { id });
  return rows[0] ?? null;
};

export const authenticate = async (username, password) => {
  const row = await findUserByUsername(username);
  if (!row || !row.is_active) return null;
  const valid = await verifyPassword(password, row.password_hash);
  return valid ? toAuthUser(row) : null;
};

export const listUsers = async () => {
  const rows = await query(SQL_AUTH_USER_LIST);
  return rows.map(toPublicUser);
};

export const countActiveAdmins = async () => {
  const rows = await query(SQL_AUTH_ACTIVE_ADMIN_COUNT);
  return Number(rows[0]?.total ?? 0);
};

/** Tìm nhân viên trong bảng bas_emp theo mã nhân viên. */
export const findEmployee = async (empNo) => {
  const rows = await query(SQL_EMP_BY_NO, { emp_no: empNo });
  return rows[0] ?? null;
};

const assertEmpNo = (empNo) => {
  if (!EMP_NO_PATTERN.test(empNo)) {
    throw new UserError(
      'BAD_EMP_NO',
      'Mã nhân viên không hợp lệ.',
    );
  }
};

const assertPassword = (password) => {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new UserError(
      'BAD_PASSWORD',
      'Mật khẩu phải dài từ 8 đến 128 ký tự.',
    );
  }
};

export const createUser = async ({ empNo, username, password, role }) => {
  const cleanEmpNo = String(empNo ?? username ?? '').trim().toUpperCase();
  assertEmpNo(cleanEmpNo);
  assertPassword(password);
  const cleanRole = String(role ?? 'user').trim().toLowerCase();
  if (!ROLE_VALUES.has(cleanRole)) {
    throw new UserError('BAD_ROLE', 'Vai trò chỉ có thể là admin hoặc user.');
  }

  const employee = await findEmployee(cleanEmpNo);
  if (!employee || !employee.emp_name) {
    throw new UserError(
      'EMP_NOT_FOUND',
      'Mã nhân viên không tồn tại.',
      400,
    );
  }

  await ensureUsersReady();
  const existing = await findUserByUsername(employee.emp_no);
  if (existing) {
    throw new UserError(
      'USER_EXISTS',
      'Mã nhân viên này đã có tài khoản.',
      409,
    );
  }

  const passwordHash = await hashPassword(password);
  const rows = await query(SQL_AUTH_USER_INSERT, {
    username: employee.emp_no,
    emp_no: employee.emp_no,
    emp_name: employee.emp_name,
    password_hash: passwordHash,
    role: cleanRole,
  });
  return toPublicUser(rows[0]);
};

export const updateUser = async (id, patch) => {
  const current = await findUserById(id);
  if (!current) {
    throw new UserError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
  }

  const nextRole = patch.role === undefined
    ? current.role
    : String(patch.role).trim().toLowerCase();
  if (!ROLE_VALUES.has(nextRole)) {
    throw new UserError('BAD_ROLE', 'Vai trò chỉ có thể là admin hoặc user.');
  }

  const nextActive = patch.active === undefined
    ? Boolean(current.is_active)
    : Boolean(patch.active);

  if (
    current.role === 'admin' &&
    current.is_active &&
    (!nextActive || nextRole !== 'admin')
  ) {
    const admins = await countActiveAdmins();
    if (admins <= 1) {
      throw new UserError(
        'LAST_ADMIN',
        'Không thể khóa hoặc hạ quyền quản trị viên cuối cùng.',
        409,
      );
    }
  }

  let latest = current;
  if (patch.role !== undefined) {
    const rows = await query(SQL_AUTH_USER_SET_ROLE, {
      id,
      role: nextRole,
    });
    latest = rows[0] ?? latest;
  }
  if (patch.active !== undefined) {
    const rows = await query(SQL_AUTH_USER_SET_ACTIVE, {
      id,
      is_active: nextActive ? 1 : 0,
    });
    latest = rows[0] ?? latest;
  }
  if (patch.password !== undefined) {
    assertPassword(patch.password);
    const passwordHash = await hashPassword(patch.password);
    const rows = await query(SQL_AUTH_USER_SET_PASSWORD, {
      id,
      password_hash: passwordHash,
    });
    latest = rows[0] ?? latest;
  }
  return toPublicUser(latest);
};
