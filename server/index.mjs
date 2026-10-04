import http from 'node:http';
import { readFileSync, existsSync, createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openStore, ingest, loadDataset, loadHomes, getStats } from './store.mjs';
import { searchHomes, DISTRICTS } from './engine.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const dev = process.argv.includes('--dev');
const db = openStore(process.env.DATABASE_PATH || path.join(ROOT, 'data/catalog.sqlite'));
if (!db.prepare('SELECT count(*) AS n FROM offers').get().n)
  ingest(db, loadDataset(path.join(ROOT, 'data/offers.json')));
const vite = dev
  ? await (
      await import('vite')
    ).createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' })
  : null;
const json = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
};
const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return json(res, 400, { error: 'invalid_url' });
  }
  if (url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
    try {
      if (url.pathname === '/api/health') return json(res, 200, { ok: true });
      if (url.pathname === '/api/catalog') {
        const homes = loadHomes(db);
        return json(res, 200, { ...getStats(db, homes), districts: DISTRICTS });
      }
      if (url.pathname === '/api/search') {
        if ((url.searchParams.get('q') || '').length > 500)
          return json(res, 400, { error: 'query_too_long' });
        return json(res, 200, searchHomes(loadHomes(db), Object.fromEntries(url.searchParams)));
      }
      if (url.pathname.startsWith('/api/source/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/source/'.length));
        const offer = db.prepare('SELECT raw, normalized FROM offers WHERE id=?').get(id);
        return offer
          ? json(res, 200, {
              sample: true,
              raw: JSON.parse(offer.raw),
              normalized: JSON.parse(offer.normalized),
            })
          : json(res, 404, { error: 'not_found' });
      }
      return json(res, 404, { error: 'not_found' });
    } catch (error) {
      if (error.message.startsWith('invalid_filter'))
        return json(res, 400, { error: error.message });
      console.error(error);
      return json(res, 500, { error: 'internal_error' });
    }
  }
  if (vite) return vite.middlewares(req, res);
  let requested;
  try {
    requested = decodeURIComponent(url.pathname);
  } catch {
    return json(res, 400, { error: 'invalid_path' });
  }
  const file = path.resolve(ROOT, 'dist', `.${requested}`);
  if (!file.startsWith(path.join(ROOT, 'dist') + path.sep) && file !== path.join(ROOT, 'dist'))
    return json(res, 403, { error: 'forbidden' });
  const target =
    existsSync(file) && statSync(file).isFile() ? file : path.join(ROOT, 'dist/index.html');
  if (!existsSync(target))
    return json(res, 503, { error: 'Build the app with npm run build first.' });
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
  };
  res.writeHead(200, {
    'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': target.includes('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache',
  });
  createReadStream(target).pipe(res);
});
const port = Number(process.env.PORT || 4317);
server.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`Torob Khaneh → http://localhost:${port} (${dev ? 'development' : 'production'})`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await vite?.close();
      db.close();
      process.exit(0);
    }),
  );
