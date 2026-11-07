/** Ảnh do người dùng upload: lưu tạm trong RAM cho tới khi có bảng lưu ảnh thật. */
const photos = new Map();

export const setPhoto = (styleCode, url) => {
  if (styleCode && url) photos.set(String(styleCode), String(url));
};

export const getPhoto = (styleCode) => photos.get(String(styleCode)) ?? '';
