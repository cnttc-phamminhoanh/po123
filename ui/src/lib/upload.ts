import { authHeaders } from './http';
import { envValue } from './env';

const UPLOAD_URL: string = envValue('VITE_UPLOAD_URL');

export const isUploadConfigured = (): boolean => Boolean(UPLOAD_URL);

const pickUrl = (payload: unknown): string => {
  if (typeof payload === 'string' && payload) return payload;
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    record.url,
    record.downloadUrl,
    record.download_url,
    (record.data as Record<string, unknown> | undefined)?.url,
    (record.data as Record<string, unknown> | undefined)?.download_url,
  ];
  const found = candidates.find((item: unknown) => typeof item === 'string' && item);
  return typeof found === 'string' ? found : '';
};

export const uploadPhoto = async (file: File): Promise<string> => {
  if (!UPLOAD_URL) {
    throw new Error(
      'Photo upload is not configured. Set VITE_UPLOAD_URL to your upload endpoint.',
    );
  }
  const form = new FormData();
  form.append('file', file, file.name);
  const response: Response = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: authHeaders(),
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
    throw new Error(`Upload failed (${response.status})`);
  }
  const url: string = pickUrl(payload);
  if (!url) {
    throw new Error('Upload endpoint must return url, downloadUrl or download_url');
  }
  return url;
};
