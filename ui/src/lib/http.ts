import { envValue } from './env';

const APP_BASE: string = (envValue('BASE_URL') || '/').replace(/\/+$/, '');
const DEFAULT_API_BASE: string = `${APP_BASE}/api`;

const RAW_BASE: string = envValue('VITE_API_BASE_URL') || DEFAULT_API_BASE;

export const API_BASE: string = RAW_BASE.replace(/\/+$/, '');

const API_TOKEN: string = envValue('VITE_API_TOKEN');

export const authHeaders = (): Record<string, string> =>
  API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};

export const apiUrl = (path: string): string => `${API_BASE}${path}`;

let headerResolver: () => Record<string, string> = () => ({});

/** Host app can add headers (CSRF token, tenant id, custom auth) without touching page code. */
export const setRequestHeaders = (
  resolver: () => Record<string, string>,
): void => {
  headerResolver = resolver;
};

const readMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const nested = record.error;
  if (nested && typeof nested === 'object') {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === 'string' && message) return message;
  }
  if (typeof record.message === 'string' && record.message) return record.message;
  if (typeof record.detail === 'string' && record.detail) return record.detail;
  return fallback;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

/** Lỗi HTTP có mã trạng thái để phân biệt lỗi mạng tạm thời với lỗi dữ liệu. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const apiRequest = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const method: string = options.method ?? 'GET';
  const hasBody: boolean = options.body !== undefined;
  const response: Response = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...headerResolver(),
      ...authHeaders(),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  const text: string = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      readMessage(payload, `${method} ${path} failed (${response.status})`),
      response.status,
    );
  }
  return payload as T;
};
