import { apiRequest } from './http';

export interface AuthUser {
  id: number;
  username: string;
  empNo: string | null;
  empName: string | null;
  role: 'admin' | 'user';
}

export interface AuthState {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface AppUser {
  id: number;
  username: string;
  empNo: string | null;
  empName: string | null;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export const fetchAuth = (): Promise<AuthState> => apiRequest<AuthState>('/auth/me');

export const login = (username: string, password: string): Promise<AuthState> =>
  apiRequest<AuthState>('/auth/login', {
    method: 'POST',
    body: { username, password },
  });

export const logout = (): Promise<AuthState> =>
  apiRequest<AuthState>('/auth/logout', { method: 'POST' });

export const fetchUsers = (): Promise<{ users: AppUser[] }> =>
  apiRequest<{ users: AppUser[] }>('/auth/users');

export const createUser = (payload: {
  empNo: string;
  password: string;
  role: 'admin' | 'user';
}): Promise<{ user: AppUser }> =>
  apiRequest<{ user: AppUser }>('/auth/users', {
    method: 'POST',
    body: payload,
  });

export const updateUser = (
  id: number,
  payload: { role?: 'admin' | 'user'; active?: boolean; password?: string },
): Promise<{ user: AppUser }> =>
  apiRequest<{ user: AppUser }>(`/auth/users/${id}`, {
    method: 'PATCH',
    body: payload,
  });

export interface PhotoHistoryEntry {
  id: number;
  styleCode: string;
  fileName: string;
  uploadedBy: string;
  uploadedByEmpNo: string;
  uploadedByName: string;
  uploadedAt: string;
}

export const fetchPhotoHistory = (params: {
  style?: string;
  uploader?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: PhotoHistoryEntry[]; total: number }> => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && String(value).trim() !== '') {
      query.set(key, String(value).trim());
    }
  });
  return apiRequest<{ items: PhotoHistoryEntry[]; total: number }>(
    `/auth/photo-history?${query.toString()}`,
  );
};
