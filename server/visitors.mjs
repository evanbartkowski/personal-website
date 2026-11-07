import { createHmac } from 'node:crypto';
import { BlockList, isIP } from 'node:net';

export const VISITOR_WINDOW_DAYS = 7;
const MAX_WINDOW_VISITS = VISITOR_WINDOW_DAYS * 2500;
const DAY = 86_400_000;
const MAX_BODY = 256;
const ORIGINS = new Set([
  'https://evanbartkowski.com',
  'https://personal-website-7d04c.web.app',
  'https://personal-website-7d04c.firebaseapp.com',
]);
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
// Cloudflare's published edge networks, verified 2026-11-03. Refresh this
// snapshot from these official endpoints when Cloudflare updates its ranges:
// https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
// A forwarding header alone is never evidence that Cloudflare sent a request.
const cloudflareEdges = new BlockList();
for (const cidr of [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
]) {
  const [network, prefix] = cidr.split('/');
  cloudflareEdges.addSubnet(network, Number(prefix), isIP(network) === 6 ? 'ipv6' : 'ipv4');
}

function sendJSON(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function localOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !url.username && !url.password && url.origin === value;
  } catch { return false; }
}

function normalizeAddress(value) {
  let address = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (address.startsWith('::ffff:') && isIP(address.slice(7)) === 4) address = address.slice(7);
  return address.length <= 45 && isIP(address) ? address : null;
}

function addressOf(req, allowLocal) {
  // req.ip is supplied by the managed Functions framework. Do not parse
  // X-Forwarded-For or use an arbitrary visitor-supplied forwarding chain.
  const address = normalizeAddress(req.ip || (allowLocal ? req.socket?.remoteAddress : null));
  if (!address) return null;
  const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
  if (!cloudflareEdges.check(address, family)) return address;
  // The custom domain reaches Firebase through Cloudflare. Count the verified
  // edge's single connecting address, not its changing data-center address.
  // Never fall back to plotting the edge when that address is unavailable.
  const connecting = normalizeAddress(req.headers?.['cf-connecting-ip']);
  return connecting && isPublicVisitorAddress(connecting) ? connecting : null;
}

export function visitorRequestAddress(req, {allowLocal = false} = {}) {
  return addressOf(req, allowLocal);
}

export function isPublicVisitorAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || a === 100 && b >= 64 && b <= 127
      || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31
      || a === 192 && (b === 168 || b === 0 || b === 2)
      || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
      || a === 203 && b === 0 && c === 113);
  }
  // Only globally routed IPv6 space; reject local, multicast, mapped and
  // documentation addresses rather than sending them to a third party.
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:0?db8:/i.test(address);
}

export function createDailyVisitorHasher(secret) {
  return (address, day) => {
    const value = typeof secret === 'function' ? secret() : secret;
    if (typeof value !== 'string' || value.length < 32) throw new Error('Visitor hashing is not configured.');
    return createHmac('sha256', value).update(`portfolio-visitors\0${day}\0${address}`).digest('hex');
  };
}

function cleanPlace(value) {
  if (typeof value !== 'string' || value.length > 150 || /\d/.test(value) || isIP(value)) return '';
  return value.normalize('NFKC').replace(/[^\p{L}\p{M}\s.'()-]/gu, '').trim().slice(0, 70);
}

export function visitorLocation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latitude = raw.latitude ?? raw.lat;
  const longitude = raw.longitude ?? raw.lon;
  if (![latitude, longitude].every(value => typeof value === 'number' || typeof value === 'string' && value.trim())) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  const countryCode = String(raw.country_code ?? raw.countryCode ?? '').toUpperCase();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180
      || !/^[A-Z]{2}$/.test(countryCode) || countryCode === 'ZZ') return null;
  const country = countryNames.of(countryCode);
  if (!country || country === countryCode) return null;
  const latitudeCell = Math.min(35, Math.floor((lat + 90) / 5));
  const longitudeCell = Math.min(71, Math.floor((lon + 180) / 5));
  const publicPoint = {
    id: `${countryCode}:${latitudeCell}:${longitudeCell}`,
    label: country,
    country,
    countryCode,
    lat: latitudeCell * 5 - 87.5,
    lon: longitudeCell * 5 - 177.5,
  };
  const label = [...new Set([cleanPlace(raw.city), cleanPlace(raw.region), country].filter(Boolean))].join(', ');
  return {
    publicPoint,
    current: {
      label, country, countryCode,
      lat: Math.round(lat * 10) / 10,
      lon: Math.round(lon * 10) / 10,
      accuracy: 'approximate',
      accuracyRadiusKm: Math.max(50, Math.min(1000, Number(raw.accuracy) || 50)),
    },
  };
}

async function boundedJSON(response, maxBytes = 8192) {
  if (!response.ok) { await response.body?.cancel(); return null; }
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) { await response.body?.cancel(); return null; }
  const reader = response.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return null; }
}

// Only platform-validated public addresses reach these fixed HTTPS endpoints.
// Provider responses and addresses are never logged or persisted.
export function createGeoJSLocator({ fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  return async address => {
    if (!isPublicVisitorAddress(address)) return null;
    const response = await fetchImpl(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(address)}.json`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return boundedJSON(response);
  };
}

export function createVisitorLocator({ fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  const primary = createGeoJSLocator({ fetchImpl, timeoutMs });
  return async address => {
    if (!isPublicVisitorAddress(address)) return null;
    try {
      const result = await primary(address);
      if (visitorLocation(result)) return result;
    } catch { /* The independent provider can recover a timeout or outage. */ }
    try {
      const response = await fetchImpl(`https://ipwho.is/${encodeURIComponent(address)}`, {
        headers: { Accept: 'application/json' }, redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const result = await boundedJSON(response);
      return result?.success !== false && visitorLocation(result) ? result : null;
    } catch { return null; }
  };
}

async function readEmptyBody(req) {
  const contentType = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return { status: 415, error: 'Send application/json.' };
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY) return { status: 413, error: 'Visitor request is too large.' };
  let raw;
  if (Buffer.isBuffer(req.rawBody)) raw = req.rawBody;
  else if (req.rawBody !== undefined) return { status: 400, error: 'Invalid visitor request.' };
  else {
    const parts = [];
    let size = 0;
    for await (const part of req) {
      const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
      size += bytes.length;
      if (size > MAX_BODY) return { status: 413, error: 'Visitor request is too large.' };
      parts.push(bytes);
    }
    raw = Buffer.concat(parts);
  }
  if (raw.length > MAX_BODY) return { status: 413, error: 'Visitor request is too large.' };
  try {
    const value = JSON.parse(raw.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw new Error();
    return null;
  } catch { return { status: 400, error: 'Visitor request must be an empty JSON object.' }; }
}

function boundedSet(map, key, value, max) {
  if (!map.has(key) && map.size >= max) map.delete(map.keys().next().value);
  map.set(key, value);
}

function publicSummary(value) {
  if (!value || !Array.isArray(value.points)) throw new Error('Invalid aggregate result.');
  const points = value.points.slice(0, 100).flatMap(point => {
    if (!point || !/^[A-Z]{2}:\d{1,2}:\d{1,2}$/.test(point.id)) return [];
    const [code, latitudeCell, longitudeCell] = point.id.split(':');
    if (Number(latitudeCell) > 35 || Number(longitudeCell) > 71) return [];
    const country = countryNames.of(code);
    if (!country || country === code) return [];
    const visits = Number.isSafeInteger(point.visits) && point.visits > 0 ? Math.min(MAX_WINDOW_VISITS, point.visits) : 0;
    if (!visits) return [];
    return [{ id: point.id, label: country, country, countryCode: code,
      lat: Number(latitudeCell) * 5 - 87.5, lon: Number(longitudeCell) * 5 - 177.5, visits }];
  });
  return { points, totalVisits: Number.isSafeInteger(value.totalVisits) && value.totalVisits >= 0 ? Math.min(MAX_WINDOW_VISITS, value.totalVisits) : 0 };
}

export function createVisitorHandler({
  store,
  geolocate = createVisitorLocator(),
  hashVisitor,
  env = process.env,
  allowLocal = false,
  now = Date.now,
  summaryCacheMs = 30_000,
  geoCacheMs = 3_600_000,
  failedGeoCacheMs = 15_000,
  maxRequestsPerMinute = 30,
  maxGlobalRequestsPerMinute = 240,
  logger = () => {},
} = {}) {
  const hash = hashVisitor || createDailyVisitorHasher(() => env.VISITOR_HASH_SALT);
  const locations = new Map();
  const visitors = new Map();
  const recentWrites = new Map();
  let globalWindow;
  let summary;
  let summaryPromise;
  let summaryRevision = 0;

  function permit(key, timestamp) {
    if (!globalWindow || timestamp - globalWindow.start >= 60_000) globalWindow = { start: timestamp, count: 0 };
    if (globalWindow.count >= maxGlobalRequestsPerMinute) return false;
    globalWindow.count++;
    let entry = visitors.get(key);
    if (!entry || timestamp - entry.start >= 60_000) entry = { start: timestamp, count: 0 };
    if (entry.count >= maxRequestsPerMinute) return false;
    entry.count++;
    boundedSet(visitors, key, entry, 1024);
    return true;
  }

  async function location(address, key, timestamp) {
    if (!address || !isPublicVisitorAddress(address)) return null;
    const cached = locations.get(key);
    if (cached && cached.expires > timestamp) return cached.promise;
    // Cache the promise too, so concurrent visits share one provider lookup.
    const entry = { expires: timestamp + geoCacheMs };
    entry.promise = Promise.resolve().then(() => geolocate(address)).then(visitorLocation).catch(() => null)
      .then(value => {
        // A short retry window prevents a transient provider outage from
        // leaving this network without a marker for an entire hour.
        if (!value) entry.expires = now() + failedGeoCacheMs;
        return value;
      });
    boundedSet(locations, key, entry, 512);
    return entry.promise;
  }

  async function getSummary(timestamp) {
    if (summary && timestamp - summary.at < summaryCacheMs) return summary.value;
    if (!summaryPromise || summaryPromise.revision !== summaryRevision) {
      const since = new Date(Date.parse(new Date(timestamp).toISOString().slice(0, 10)) - (VISITOR_WINDOW_DAYS - 1) * DAY).toISOString().slice(0, 10);
      const pending = { revision: summaryRevision };
      pending.promise = Promise.resolve().then(() => store.listPoints({ since, limit: 100, now: timestamp }))
        .then(publicSummary).then(value => {
          if (pending.revision === summaryRevision) summary = { at: timestamp, value };
          return value;
        })
        .finally(() => { if (summaryPromise === pending) summaryPromise = undefined; });
      summaryPromise = pending;
    }
    return summaryPromise.promise;
  }

  return async function handleVisitors(req, res, pathname) {
    const route = pathname ?? String(req.originalUrl || req.url || '').split('?')[0];
    if (route !== '/api/visitors') return false;
    const method = req.method;
    const origin = req.headers?.origin;
    if (req.headers?.['sec-fetch-site'] === 'cross-site'
      || origin !== undefined && !ORIGINS.has(origin) && !(allowLocal && localOrigin(origin))
      || method === 'POST' && !origin) {
      req.resume?.();
      sendJSON(res, 403, { error: 'Visitor requests must come from this portfolio.' });
      return true;
    }
    if (!['GET', 'POST'].includes(method)) {
      req.resume?.();
      sendJSON(res, 405, { error: 'Use GET or POST.' }, { Allow: 'GET, POST' });
      return true;
    }
    if (method === 'POST') {
      let invalid;
      try { invalid = await readEmptyBody(req); }
      catch { invalid = { status: 400, error: 'Invalid visitor request.' }; }
      if (invalid) { req.resume?.(); sendJSON(res, invalid.status, { error: invalid.error }); return true; }
    } else req.resume?.();

    try {
      if (!store || typeof store.listPoints !== 'function' || typeof store.recordVisit !== 'function') throw new Error();
      const timestamp = now();
      const day = new Date(timestamp).toISOString().slice(0, 10);
      const address = addressOf(req, allowLocal);
      const key = hash(address || 'unknown', day);
      if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw new Error();
      if (!permit(key, timestamp)) {
        sendJSON(res, 429, { error: 'Visitor map is busy. Try again shortly.' }, { 'Retry-After': '60' });
        return true;
      }
      const trackingDisabled = req.headers?.dnt === '1' || req.headers?.['sec-gpc'] === '1';
      // Respect browser privacy signals without creating a geolocation lookup
      // or a persisted visit. The public aggregate remains readable.
      const geo = trackingDisabled ? null : await location(address, key, timestamp);
      let recorded = false;
      if (method === 'POST' && geo && !recentWrites.has(key)) {
        const result = await store.recordVisit({ visitorId: key, day, point: geo.publicPoint, now: timestamp });
        recorded = result?.recorded === true;
        if (result?.limited) {
          sendJSON(res, 429, { error: 'Visitor map has reached its daily limit.' }, { 'Retry-After': '3600' });
          return true;
        }
        boundedSet(recentWrites, key, day, 2048);
        if (recorded) { summary = undefined; summaryRevision++; }
      }
      const value = await getSummary(timestamp);
      sendJSON(res, 200, {
        ...value,
        current: geo?.current || null,
        // This field belongs only to the requesting connection. It is never
        // part of the shared aggregate, provider payload, or stored record.
        currentIp: address && isPublicVisitorAddress(address) ? address : null,
        locationStatus: trackingDisabled ? 'privacy' : geo ? 'located' : address && isPublicVisitorAddress(address) ? 'lookup_unavailable' : 'unknown_network',
        dataSource: 'live',
        windowDays: VISITOR_WINDOW_DAYS,
        updatedAt: new Date(timestamp).toISOString(),
        ...(trackingDisabled ? { trackingDisabled: true } : {}),
        ...(method === 'POST' ? { recorded } : {}),
      });
    } catch {
      // Deliberately omit exception text: database/provider errors can contain
      // request addresses, queries or infrastructure details.
      try { logger('visitor_map_unavailable'); } catch { /* Logging is best effort. */ }
      sendJSON(res, 503, { error: 'Visitor map is temporarily unavailable.', code: 'map_unavailable' });
    }
    return true;
  };
}

// Local preview reads the same real records as the published site. A fixed
// read-only upstream prevents localhost from creating a second empty map or
// adding test visits. The current estimate is the preview server's network.
export function createVisitorPreviewHandler({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  return async function handleVisitorPreview(req, res, pathname) {
    if (pathname !== '/api/visitors') return false;
    req.resume?.();
    if (req.headers?.['sec-fetch-site'] === 'cross-site' || req.headers?.origin && !localOrigin(req.headers.origin)) {
      sendJSON(res, 403, { error: 'Visitor requests must come from the local preview.' });
      return true;
    }
    if (req.method !== 'GET') {
      sendJSON(res, 405, { error: 'Local preview only reads live visitor data.' }, { Allow: 'GET' });
      return true;
    }
    try {
      const headers = { Accept: 'application/json' };
      if (req.headers?.dnt === '1') headers.DNT = '1';
      if (req.headers?.['sec-gpc'] === '1') headers['Sec-GPC'] = '1';
      const response = await fetchImpl('https://evanbartkowski.com/api/visitors', {
        method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await boundedJSON(response, 65_536);
      const value = publicSummary(data);
      const trackingDisabled = headers.DNT === '1' || headers['Sec-GPC'] === '1';
      const geography = !trackingDisabled && visitorLocation(data.current && { ...data.current, accuracy: data.current.accuracyRadiusKm });
      const current = geography ? {
        ...geography.current,
        label: String(data.current.label || '').split(',').map(cleanPlace).filter(Boolean).join(', ') || geography.current.country,
      } : null;
      const ownAddress = normalizeAddress(data.currentIp);
      sendJSON(res, 200, {
        ...value, current, currentIp: ownAddress && isPublicVisitorAddress(ownAddress) ? ownAddress : null,
        locationStatus: trackingDisabled ? 'privacy' : current ? 'located' : ['lookup_unavailable', 'unknown_network'].includes(data.locationStatus) ? data.locationStatus : 'lookup_unavailable',
        dataSource: 'live-preview', windowDays: VISITOR_WINDOW_DAYS,
        updatedAt: Number.isFinite(Date.parse(data.updatedAt)) ? data.updatedAt : new Date().toISOString(),
        ...(trackingDisabled ? { trackingDisabled: true } : {}),
      });
    } catch {
      sendJSON(res, 503, { error: 'Live visitor data could not be reached. Try Refresh shortly.', code: 'map_unavailable' });
    }
    return true;
  };
}

// Useful for local preview; no credentials or database network are required.
export function createMemoryVisitorStore({ retentionDays = VISITOR_WINDOW_DAYS, maxDailyVisits = 2500, maxRegionsPerDay = 200 } = {}) {
  const days = new Map();
  const seen = new Map();
  return {
    async recordVisit({ visitorId, day, point, now }) {
      for (const [id, expires] of seen) if (expires <= now) seen.delete(id);
      for (const [id, entry] of days) if (entry.expires <= now) days.delete(id);
      if (seen.has(`${day}:${visitorId}`)) return { recorded: false };
      let entry = days.get(day);
      if (!entry) entry = { points: new Map(), total: 0, expires: Date.parse(day) + retentionDays * DAY };
      if (entry.total >= maxDailyVisits || !entry.points.has(point.id) && entry.points.size >= maxRegionsPerDay) return { recorded: false, limited: true };
      const previous = entry.points.get(point.id);
      entry.points.set(point.id, { ...point, visits: (previous?.visits || 0) + 1 });
      entry.total++;
      days.set(day, entry);
      seen.set(`${day}:${visitorId}`, Date.parse(day) + 2 * DAY);
      return { recorded: true };
    },
    async listPoints({ since, limit = 100, now }) {
      const points = new Map();
      let totalVisits = 0;
      for (const [day, entry] of days) {
        if (day < since || day > new Date(now).toISOString().slice(0, 10) || entry.expires <= now) continue;
        totalVisits += entry.total;
        for (const point of entry.points.values()) points.set(point.id, { ...point, visits: (points.get(point.id)?.visits || 0) + point.visits });
      }
      return { totalVisits, points: [...points.values()].sort((a, b) => b.visits - a.visits || a.id.localeCompare(b.id)).slice(0, Math.min(100, limit)) };
    },
  };
}
