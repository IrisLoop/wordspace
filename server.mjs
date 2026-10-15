import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, rename, stat, copyFile } from 'node:fs/promises';
import { emptyState, validateState } from './public/core.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.gz': 'application/gzip', '.png': 'image/png' };
export function makeServer({ dataDir = path.join(root, 'data') } = {}) {
  let queue = Promise.resolve();
  const file = path.join(dataDir, 'wordspace.json');
  async function state() { try { return validateState(JSON.parse(await readFile(file, 'utf8'))); } catch(e) { if(e.code === 'ENOENT') return emptyState(); throw new Error('本地词库读取失败。请保留 data 文件夹并从备份恢复。'); } }
  return http.createServer(async(req, res) => {
    const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return json(403, { error: '仅限本机访问' });
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(403, { error: '请求来源不被允许' });
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === '/api/health') return json(200, { app: 'wordspace', version: 1 });
      if (url.pathname === '/api/state') {
        if(req.method === 'GET') return json(200, await state());
        if(req.method !== 'PUT') return json(405, { error: '不支持的操作' });
        if (!String(req.headers['content-type']).startsWith('application/json')) return json(415, { error: '需要 JSON' });
        let body = ''; for await(const chunk of req) { body += chunk; if(Buffer.byteLength(body) > 16 * 1024 * 1024) return json(413, { error: '词库备份过大（上限 16 MB）' }); }
        let incoming; try { incoming = validateState(JSON.parse(body)); } catch(e) { return json(400, { error: e.message }); }
        const run = queue.then(async () => {
          const current = await state();
          if (incoming.revision !== current.revision) return json(409, { error: '词库已在另一个窗口更新，请刷新页面后重试。' });
          incoming.revision++;
          await mkdir(dataDir, { recursive: true });
          try { await copyFile(file, path.join(dataDir, 'wordspace.previous.json')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
          await writeFile(`${file}.tmp`, JSON.stringify(incoming, null, 2), 'utf8');
          await rename(`${file}.tmp`, file); json(200, { revision: incoming.revision });
        });
        queue = run.catch(() => {}); await run; return;
      }
      if(req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: '不支持的操作' });
      let base = path.join(root, 'public'); let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      if(relative.startsWith('vendor/')) { base = path.join(root, 'node_modules'); relative = relative.slice(7); }
      const full = path.resolve(base, relative);
      if (!full.startsWith(`${base}${path.sep}`)) return json(403, {error:'无权访问'});
      const info = await stat(full); if (!info.isFile()) return json(404, { error: '未找到文件' });
      res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(full));
    } catch(e) { if (!res.headersSent) json(e.code === 'ENOENT' ? 404 : 500, { error: e.message }); else res.end(); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.WORDSPACE_PORT || 43127);
  makeServer().listen(port, '127.0.0.1', () => console.log(`Wordspace ready: http://127.0.0.1:${port}`)).on('error', e => { console.error(e.message); process.exit(1); });
}
