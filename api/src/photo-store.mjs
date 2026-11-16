import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { config } from './config.mjs';
import { query } from './db.mjs';
import {
  SQL_PHOTO_AUDIT_BY_STYLE,
  SQL_PHOTO_AUDIT_INSERT,
  SQL_PHOTO_AUDIT_SCHEMA,
  SQL_PHOTO_AUDIT_SEARCH,
  SQL_PHOTO_AUDIT_SEARCH_COUNT,
} from './sql.mjs';

const storeDir = path.resolve(config.photo.dir);

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PHOTO_BG = { r: 244, g: 244, b: 244, alpha: 1 };
const PHOTO_WIDTH = 1200;
const PHOTO_HEIGHT = 1800;
const PHOTO_PADDING = 56;

const hasImageSignature = (buffer, mime) => {
  if (mime === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mime === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
};

/**
 * Thay nền đồng màu (thường là trắng/xám studio) bằng nền xám chuẩn.
 * Chỉ tô các vùng nền nối với mép ảnh, nên chi tiết trắng bên trong sản phẩm
 * (nơ, nhãn, đường may) vẫn được giữ lại.
 */
const replaceBackground = (raw) => {
  const { data, info } = raw;
  const { width, height, channels } = info;
  const pixelCount = width * height;

  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ].map(([x, y]) => {
    const offset = (y * width + x) * channels;
    return [data[offset], data[offset + 1], data[offset + 2]];
  });
  const background = [0, 1, 2].map((channel) => {
    const values = corners.map((corner) => corner[channel]).sort((a, b) => a - b);
    return Math.round((values[1] + values[2]) / 2);
  });

  const threshold = 44;
  const thresholdSquared = threshold * threshold;
  const mask = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const isBackground = (index) => {
    const offset = index * channels;
    const dr = data[offset] - background[0];
    const dg = data[offset + 1] - background[1];
    const db = data[offset + 2] - background[2];
    return dr * dr + dg * dg + db * db <= thresholdSquared;
  };

  const enqueue = (index) => {
    if (mask[index] || !isBackground(index)) return;
    mask[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const offset = index * channels;
    data[offset] = PHOTO_BG.r;
    data[offset + 1] = PHOTO_BG.g;
    data[offset + 2] = PHOTO_BG.b;

    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  return { data, width, height, channels };
};

const normalizePhoto = async (buffer) => {
  const raw = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: 1600, height: 2400, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: PHOTO_BG })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cleaned = replaceBackground(raw);

  return sharp(cleaned.data, {
    raw: { width: cleaned.width, height: cleaned.height, channels: cleaned.channels },
  })
    .trim({ threshold: 12 })
    .resize({
      width: PHOTO_WIDTH - PHOTO_PADDING * 2,
      height: PHOTO_HEIGHT - PHOTO_PADDING * 2,
      fit: 'contain',
      background: PHOTO_BG,
    })
    .extend({
      top: PHOTO_PADDING,
      bottom: PHOTO_PADDING,
      left: PHOTO_PADDING,
      right: PHOTO_PADDING,
      background: PHOTO_BG,
    })
    .toColourspace('srgb')
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer();
};

const safeCode = (code) => {
  const cleaned = String(code ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 60);
  return cleaned || 'style';
};

const codeHash = (code) =>
  createHash('sha1').update(String(code ?? '')).digest('hex').slice(0, 8);

const fileBase = (code) => `${safeCode(code)}-${codeHash(code)}`;

const listStyleFiles = async (styleCode) => {
  const prefix = `${fileBase(styleCode)}.`;
  let names;
  try {
    names = await readdir(storeDir);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return names.filter((name) => name.startsWith(prefix));
};

const contentTypeOf = (fileName) => {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
};

const buildPhotoUrl = (styleCode, version) =>
  `/api/bom/styles/${encodeURIComponent(String(styleCode))}/photo?v=${version}`;

let auditReadyPromise = null;

const ensurePhotoAuditReady = async () => {
  if (!auditReadyPromise) {
    auditReadyPromise = query(SQL_PHOTO_AUDIT_SCHEMA).catch((error) => {
      auditReadyPromise = null;
      throw error;
    });
  }
  await auditReadyPromise;
};

const toPhotoUpload = (row) => {
  if (!row) return null;
  const uploadedAt =
    row.uploaded_at instanceof Date
      ? row.uploaded_at.toISOString()
      : row.uploaded_at
        ? String(row.uploaded_at)
        : '';
  return {
    uploadedBy: row.uploaded_by ?? '',
    uploadedByEmpNo: row.uploaded_by_emp_no ?? '',
    uploadedByName: row.uploaded_by_name ?? '',
    uploadedAt,
  };
};

/** Đọc thông tin lần upload gần nhất của style; không có thì trả null. */
export const photoUploadFor = async (styleCode) => {
  try {
    await ensurePhotoAuditReady();
    const rows = await query(SQL_PHOTO_AUDIT_BY_STYLE, {
      style_code: String(styleCode ?? '').trim(),
    });
    return toPhotoUpload(rows[0]);
  } catch (error) {
    console.error('[photo] Không đọc được thông tin upload', error);
    return null;
  }
};

/** Ghi thêm một dòng lịch sử cho lần upload ảnh mới. */
export const recordPhotoUpload = async (styleCode, fileName, actor) => {
  await ensurePhotoAuditReady();
  await query(SQL_PHOTO_AUDIT_INSERT, {
    style_code: String(styleCode ?? '').trim(),
    file_name: fileName ?? null,
    uploaded_by: actor?.username ?? null,
    uploaded_by_emp_no: actor?.empNo ?? null,
    uploaded_by_name: actor?.empName ?? null,
  });
  return photoUploadFor(styleCode);
};

const toHistoryEntry = (row) => ({
  id: row.id,
  styleCode: row.style_code ?? '',
  fileName: row.file_name ?? '',
  uploadedBy: row.uploaded_by ?? '',
  uploadedByEmpNo: row.uploaded_by_emp_no ?? '',
  uploadedByName: row.uploaded_by_name ?? '',
  uploadedAt:
    row.uploaded_at instanceof Date ? row.uploaded_at.toISOString() : String(row.uploaded_at ?? ''),
});

/** Tìm lịch sử upload cho admin. */
export const searchPhotoHistory = async ({
  style = '',
  uploader = '',
  from = null,
  to = null,
  limit = 50,
  offset = 0,
}) => {
  await ensurePhotoAuditReady();
  const params = {
    style_filter: style,
    uploader_filter: uploader,
    date_from: from,
    date_to: to,
    row_limit: limit,
    row_offset: offset,
  };
  const rows = await query(SQL_PHOTO_AUDIT_SEARCH, params);
  const countRows = await query(SQL_PHOTO_AUDIT_SEARCH_COUNT, params);
  return {
    items: rows.map(toHistoryEntry),
    total: Number(countRows[0]?.total ?? 0),
  };
};

export const saveStylePhoto = async (styleCode, file) => {
  if (!file) {
    throw Object.assign(new Error('Thiếu file ảnh'), { status: 400 });
  }
  if (file.size > config.photo.maxBytes) {
    throw Object.assign(new Error('Ảnh vượt quá dung lượng cho phép'), { status: 413 });
  }

  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw Object.assign(new Error('Chỉ nhận ảnh JPG, PNG hoặc WEBP'), { status: 415 });
  }
  if (!hasImageSignature(file.buffer, file.mimetype)) {
    throw Object.assign(new Error('Nội dung file không phải ảnh hợp lệ'), { status: 415 });
  }

  let normalized;
  try {
    normalized = await normalizePhoto(file.buffer);
  } catch (error) {
    throw Object.assign(new Error('Không xử lý được ảnh'), { status: 415, cause: error });
  }

  await mkdir(storeDir, { recursive: true });

  // Một style chỉ giữ một ảnh: xóa các phiên bản cũ trước khi ghi ảnh mới.
  for (const oldName of await listStyleFiles(styleCode)) {
    await unlink(path.join(storeDir, oldName)).catch(() => undefined);
  }

  const fileName = `${fileBase(styleCode)}.jpg`;
  const fullPath = path.join(storeDir, fileName);
  await writeFile(fullPath, normalized);

  const info = await stat(fullPath);
  return {
    styleCode: String(styleCode),
    fileName,
    photoUrl: buildPhotoUrl(styleCode, Math.round(info.mtimeMs)),
  };
};

export const findStylePhoto = async (styleCode) => {
  for (const name of await listStyleFiles(styleCode)) {
    const fullPath = path.join(storeDir, name);
    const info = await stat(fullPath).catch(() => null);
    if (!info?.isFile()) continue;
    return {
      fullPath,
      fileName: name,
      contentType: contentTypeOf(name),
      updatedAt: Math.round(info.mtimeMs),
    };
  }
  return null;
};

export const photoUrlFor = async (styleCode) => {
  try {
    const file = await findStylePhoto(styleCode);
    return file ? buildPhotoUrl(styleCode, file.updatedAt) : '';
  } catch (error) {
    console.error('[photo] Không đọc được thư mục ảnh', error);
    return '';
  }
};
