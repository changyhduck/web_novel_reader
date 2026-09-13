import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const build = spawnSync(process.execPath, [path.join(root, 'tools', 'build-index.mjs')], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const host = '127.0.0.1', port = Number(process.env.NOVEL_READER_PORT || 4173), web = path.join(root, 'web');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
function openEdge(url) {
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];
  const edge = candidates.find((candidate) => candidate && existsSync(candidate));
  if (edge) { spawn(edge, [url], { detached: true, stdio: 'ignore' }).unref(); return; }
  console.error('找不到 Microsoft Edge，請手動在 Edge 開啟：' + url);
}
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  const file = path.resolve(web, pathname === '/' ? 'index.html' : `.${pathname}`);
  if (!file.startsWith(web) || !existsSync(file)) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); createReadStream(file).pipe(response);
});
server.listen(port, host, () => {
  const url = `http://${host}:${port}/`; console.log(`小說閱讀器已啟動：${url}`); console.log('按 Ctrl+C 停止服務。');
  if (process.env.NO_OPEN !== '1') openEdge(url);
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`連接埠 ${port} 已被使用。若閱讀器已啟動，請使用原視窗；否則請停止占用此連接埠的服務後重試。`);
  } else console.error(`無法啟動：${error.message}`);
  process.exitCode = 1;
});
