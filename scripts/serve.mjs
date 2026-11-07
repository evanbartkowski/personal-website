import http from 'node:http';
import { stat } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createChatHandler } from '../server/chat.mjs';
import { handleBlogRequest } from '../server/blog.mjs';
import { createVisitorPreviewHandler } from '../server/visitors.mjs';
import { createArcadeProxyHandler } from '../server/arcade-scores.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const envPath = resolve(projectRoot, '.env.local');
if (existsSync(envPath)) process.loadEnvFile(envPath);
const staticRoot = resolve(projectRoot, 'dist');
const types = { '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac' };

// A single byte interval is enough for browser audio seeking. null means no
// Range header; false means malformed, unsupported, or unsatisfiable.
export function parseByteRange(value, size) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !Number.isSafeInteger(size) || size <= 0) return false;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
  return { start, end: Math.min(end, size - 1) };
}

export function isTrustedLocalRequest(req) {
  const host = req.headers.host || '';
  if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers.origin && req.headers.origin !== `http://${host}`) return false;
  return true;
}

export function createPortfolioServer({ chatOptions, visitorOptions, arcadeOptions, staticDirectory = staticRoot } = {}) {
  const handleVisitors = createVisitorPreviewHandler(visitorOptions);
  const handleArcade = createArcadeProxyHandler(arcadeOptions);
  const handleChatRequest = createChatHandler(chatOptions);
  const siteRoot = resolve(staticDirectory);
  const server = http.createServer(async (req, res) => {
    try {
      if (!isTrustedLocalRequest(req)) {
        req.resume();
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('This local server only accepts requests from its own local origin.');
        return;
      }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (await handleVisitors(req,res,pathname)) return;
      if (await handleArcade(req,res,pathname)) return;
      if (await handleChatRequest(req, res, pathname)) return;
      if (await handleBlogRequest(req, res, pathname)) return;
      if (pathname.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify({ error: 'API route not found.' }));
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        req.resume();
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment.startsWith('.'))) {
        res.writeHead(403).end();
        return;
      }
      const route = pathname === '/' ? '/index.html' : /^\/blog(?:\/editor)?\/?$/.test(pathname) ? '/blog.html' : pathname;
      const target = resolve(siteRoot, `.${route}`);
      if (!target.startsWith(siteRoot + sep)) { res.writeHead(403).end(); return; }
      const file = await stat(target);
      if (!file.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); return; }
      const headers = { 'Content-Type': types[extname(target).toLowerCase()] || 'application/octet-stream', 'Content-Length': file.size, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
      const range = req.method === 'GET' ? parseByteRange(req.headers.range, file.size) : null;
      if (range === false) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${file.size}`, 'Content-Length': 0 }).end();
        return;
      }
      if (range) { headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.size}`; headers['Content-Length'] = range.end - range.start + 1; }
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD' || file.size === 0) { res.end(); return; }
      const stream = createReadStream(target, range || undefined);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(error.code === 'ENOENT' || error.code === 'EISDIR' ? 'Not found' : 'Invalid request');
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  const server = createPortfolioServer();
  server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
  server.on('error', error => { console.error(`Local server could not start (${error.code || 'unknown error'}).`); process.exitCode = 1; });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
