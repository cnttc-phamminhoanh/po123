/**
 * Cache nhỏ trong bộ nhớ cho kết quả API.
 *
 * - `load(key, producer)` trả kết quả còn hạn nếu có.
 * - Nếu cùng key đang chạy, các request sau chờ chung một lần chạy
 *   thay vì mở thêm truy vấn SQL (single-flight).
 * - Chỉ lưu kết quả khác null/undefined; lỗi không được cache.
 * - Giới hạn số mục để không tăng RAM vô hạn.
 */
export const createTtlCache = ({ ttlMs, maxEntries = 100, name = 'cache' }) => {
  const entries = new Map();
  const pending = new Map();
  let hits = 0;
  let misses = 0;
  let coalesced = 0;

  const isFresh = (entry) => Boolean(entry) && entry.expiresAt > Date.now();

  const read = (key) => {
    const entry = entries.get(key);
    if (!isFresh(entry)) {
      if (entry) entries.delete(key);
      return undefined;
    }
    // LRU: mục vừa dùng được đưa về cuối hàng chờ xoá.
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  };

  const write = (key, value) => {
    if (value === null || value === undefined) return;
    if (entries.has(key)) entries.delete(key);
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
  };

  const load = (key, producer) => {
    const cached = read(key);
    if (cached !== undefined) {
      hits += 1;
      return Promise.resolve(cached);
    }

    const running = pending.get(key);
    if (running) {
      coalesced += 1;
      return running;
    }

    misses += 1;
    const task = Promise.resolve()
      .then(producer)
      .then((value) => {
        write(key, value);
        return value;
      })
      .finally(() => {
        pending.delete(key);
      });

    pending.set(key, task);
    return task;
  };

  const remove = (key) => {
    entries.delete(key);
  };

  const clear = () => {
    entries.clear();
  };

  const stats = () => ({
    name,
    size: entries.size,
    pending: pending.size,
    hits,
    misses,
    coalesced,
    ttlMs,
    maxEntries,
  });

  return { load, remove, clear, stats };
};
