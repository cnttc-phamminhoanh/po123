import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const uiDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(uiDir, '..', 'api');

const children = [];

const run = (command, args, options = {}) => {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env, ...options });
  children.push(child);
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
};

const shutdown = (code = 0) => {
  children.forEach((child) => {
    if (!child.killed) child.kill('SIGTERM');
  });
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (existsSync(path.join(apiDir, 'package.json'))) {
  run(process.execPath, ['--watch', 'src/server.mjs'], { cwd: apiDir });
} else {
  console.warn('[dev] Không thấy thư mục api/ — chỉ chạy UI.');
}

run(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite'],
  process.platform === 'win32' ? { shell: true } : {},
);
