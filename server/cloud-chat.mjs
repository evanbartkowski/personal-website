import { isIP } from 'node:net';
import { createChatHandler } from './chat.mjs';

const ALLOWED_ORIGINS = new Set([
  'https://evanbartkowski.com',
  'https://personal-website-7d04c.web.app',
  'https://personal-website-7d04c.firebaseapp.com',
]);

function sendJSON(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function cloudClientId(req) {
  // Use the platform's proxy-aware IP and bound malformed values to one bucket.
  // This is a best-effort abuse limit, not an authenticated visitor identity.
  const address = typeof req.ip === 'string' ? req.ip.trim().toLowerCase() : '';
  return address.length <= 45 && isIP(address) ? address : 'unknown';
}

export function createCloudChatHandler({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let generationWindow;
  // Bound provider generations across client identities in this warm instance.
  // Restarts reset this best-effort limit; it is not a billing/spending cap.
  const reserveGeneration = () => {
    const timestamp = now();
    if (!generationWindow || timestamp - generationWindow.started >= 60_000) generationWindow = { started: timestamp, count: 0 };
    if (generationWindow.count >= 24) return false;
    generationWindow.count++;
    return true;
  };
  const handleChat = createChatHandler({ env, fetchImpl, now, clientId: cloudClientId, reserveGeneration });
  return async function handleCloudChatRequest(req, res) {
    const originalUrl = req.originalUrl || req.url || '';
    const pathname = typeof originalUrl === 'string' ? originalUrl.split('?')[0] : '';
    if (pathname !== '/api/chat' && pathname !== '/api/chat/status') {
      req.resume();
      sendJSON(res, 404, { error: 'Chat route not found.' });
      return;
    }
    const origin = req.headers.origin;
    const crossSite = req.headers['sec-fetch-site'] === 'cross-site';
    // Hosting forwards to a different function Host, so match only explicit
    // public browser origins. This is abuse reduction, not authentication.
    if (crossSite || origin !== undefined && !ALLOWED_ORIGINS.has(origin) || req.method === 'POST' && !origin) {
      req.resume();
      sendJSON(res, 403, { error: 'Chat requests must come from Evan’s portfolio.' });
      return;
    }
    if (pathname === '/api/chat/status' && req.method !== 'GET') {
      req.resume();
      sendJSON(res, 405, { error: 'Read chat status using GET.' }, { Allow: 'GET' });
      return;
    }
    await handleChat(req, res, pathname);
  };
}
