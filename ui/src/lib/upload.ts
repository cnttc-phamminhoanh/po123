import { ApiError, apiUrl, authHeaders } from './http';

export interface UploadedStylePhoto {
  styleCode: string;
  fileName: string;
  photoUrl: string;
}

/** Gửi ảnh trực tiếp lên API; API ghi file vào thư mục trên máy chạy Node. */
export const uploadStylePhoto = async (
  styleCode: string,
  file: File,
): Promise<UploadedStylePhoto> => {
  const form = new FormData();
  form.append('file', file, file.name);

  const response: Response = await fetch(
    apiUrl(`/bom/styles/${encodeURIComponent(styleCode)}/photo`),
    {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { ...authHeaders() },
    },
  );

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
    const message =
      payload && typeof payload === 'object'
        ? (payload as { error?: { message?: string } }).error?.message
        : '';
    throw new ApiError(
      message || `Upload failed (${response.status})`,
      response.status,
    );
  }

  if (!payload || typeof payload !== 'object' || !('photoUrl' in payload)) {
    throw new Error('API không trả về photoUrl');
  }

  return payload as UploadedStylePhoto;
};
