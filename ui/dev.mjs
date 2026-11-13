import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const uiDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(uiDir, '..', 'api');
const API_HOST = '127.0.0.1';
const API_PORT = 3001;

const children = [];

const run = (command, args, options = {}) => {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env, ...options });
  children.push(child);
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
  return child;
};

const shutdown = (code = 0) => {
  children.forEach((child) => {
    if (!child.killed) child.kill('SIGTERM');
  });
  process.exit(code);
};

const canConnect = () =>
  new Promise((resolve) => {
    const socket = net.connect({ host: API_HOST, port: API_PORT });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });

/** Chờ API mở cổng trước khi bật Vite, tránh proxy nhận ECONNRESET lúc khởi động. */
const waitForApi = async (timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnect()) return true;
    await delay(250);
  }
  return false;
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (existsSync(path.join(apiDir, 'package.json'))) {
  run(process.execPath, ['--watch', 'src/server.mjs'], { cwd: apiDir });
  const apiStarted = await waitForApi();
  if (apiStarted) {
    // Cổng mở trước khi callback listen chạy xong; chờ thêm một nhịp ngắn.
    await delay(400);
  } else {
    console.warn(
      `[dev] API chưa mở cổng ${API_PORT} sau 20 giây — vẫn khởi động UI, kiểm tra log API phía trên.`,
    );
  }
} else {
  console.warn('[dev] Không thấy thư mục api/ — chỉ chạy UI.');
}

run(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite'],
  process.platform === 'win32' ? { shell: true } : {},
);
