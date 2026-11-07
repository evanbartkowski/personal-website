import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  createDailyVisitorHasher, createGeoJSLocator, createVisitorLocator, createMemoryVisitorStore, createVisitorPreviewHandler,
  createVisitorHandler, isPublicVisitorAddress, visitorLocation,
} from '../server/visitors.mjs';
import { createVisitorStore } from '../functions/visitor-store.mjs';
import { createPortfolioServer } from './serve.mjs';

const NOW = Date.parse('2026-11-03T14:00:00Z');
const DAY = 86_400_000;
const ORIGIN = 'https://evanbartkowski.com';
const SECRET = 'test-only-visitor-salt-at-least-32-characters';
const GEO = { ip: '8.8.8.8', city: 'Baltimore', region: 'Maryland', country: 'United States', country_code: 'US', latitude: '39.2904', longitude: '-76.6122', accuracy: 5, organization_name: 'Private ISP' };
const POINT = visitorLocation(GEO).publicPoint;

function options(extra = {}) {
  return { store: createMemoryVisitorStore(), env: { VISITOR_HASH_SALT: SECRET }, geolocate: async () => GEO, now: () => NOW, ...extra };
}

async function call(handler, { method = 'GET', ip = '8.8.8.8', body = '{}', rawBody, headers = {}, path = '/api/visitors' } = {}) {
  const req = Readable.from(method === 'POST' && rawBody === undefined ? [body] : []);
  req.method = method;
  req.url = path;
  req.ip = ip;
  req.headers = { ...(method === 'POST' ? { origin: ORIGIN, 'content-type': 'application/json' } : {}), ...headers };
  if (rawBody !== undefined) req.rawBody = rawBody;
  let status;
  let responseHeaders;
  let text;
  const handled = await handler(req, {
    writeHead(code, value) { status = code; responseHeaders = value; },
    end(value) { text = value; },
  }, path.split('?')[0]);
  return { handled, status, headers: responseHeaders, text, body: text === undefined ? undefined : JSON.parse(text) };
}

function mockFirestore({ ignoreQueryFilters = false } = {}) {
  const documents = new Map();
  const queries = [];
  const writes = [];
  let previous = Promise.resolve();
  const snapshot = path => ({ exists: documents.has(path), data: () => structuredClone(documents.get(path)) });
  const db = {
    collection(name) {
      const filters = [];
      let max = Infinity;
      const query = {
        doc(id) { return { path: `${name}/${id}` }; },
        where(...value) { filters.push(value); return query; },
        orderBy(...value) { query.ordering = value; return query; },
        limit(value) { max = value; return query; },
        async get() {
          queries.push({ name, filters: [...filters], max, ordering: query.ordering });
          let entries = [...documents.entries()].filter(([path]) => path.startsWith(`${name}/`));
          if (!ignoreQueryFilters) entries = entries.filter(([, value]) => filters.every(([field, op, compare]) => op === '>=' ? value[field] >= compare : value[field] <= compare));
          return { docs: entries.sort(([a], [b]) => b.localeCompare(a)).slice(0, max).map(([path]) => snapshot(path)) };
        },
      };
      return query;
    },
    runTransaction(callback) {
      const execute = async () => {
        const pending = [];
        const result = await callback({
          async get(ref) { assert.equal(pending.length, 0, 'All transaction reads must precede writes'); return snapshot(ref.path); },
          set(ref, value) { pending.push([ref.path, structuredClone(value)]); },
        });
        for (const [path, value] of pending) { documents.set(path, value); writes.push({ path, value }); }
        return result;
      };
      const next = previous.then(execute);
      previous = next.catch(() => {});
      return next;
    },
  };
  return { db, documents, queries, writes };
}

test('daily HMAC changes across address/day/salt without exposing the input', () => {
  const hash = createDailyVisitorHasher(SECRET);
  const value = hash('8.8.8.8', '2026-11-03');
  assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(value, hash('8.8.8.8', '2026-11-03'));
  assert.notEqual(value, hash('1.1.1.1', '2026-11-03'));
  assert.notEqual(value, hash('8.8.8.8', '2026-11-04'));
  assert.notEqual(value, createDailyVisitorHasher(`${SECRET}!`)('8.8.8.8', '2026-11-03'));
  assert.throws(() => createDailyVisitorHasher('short')('8.8.8.8', '2026-11-03'));
});

test('public geography is coarse while the current visitor receives only approximate location', () => {
  const location = visitorLocation(GEO);
  assert.deepEqual(location.publicPoint, { id: 'US:25:20', label: 'United States', country: 'United States', countryCode: 'US', lat: 37.5, lon: -77.5 });
  assert.equal(location.current.lat, 39.3);
  assert.equal(location.current.lon, -76.6);
  assert.equal(location.current.accuracyRadiusKm, 50);
  assert.equal(location.current.label, 'Baltimore, Maryland, United States');
  assert.equal(JSON.stringify(location).includes(GEO.ip), false);
  for (const patch of [{ latitude: '' }, { latitude: [] }, { latitude: 91 }, { longitude: NaN }, { country_code: 'ZZ' }, { country_code: 'not-a-country' }]) assert.equal(visitorLocation({ ...GEO, ...patch }), null);
  assert.equal(visitorLocation({ ...GEO, city: GEO.ip }).current.label.includes(GEO.ip), false);
});

test('nonpublic, documentation, and loopback addresses never reach geolocation', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.3', '192.168.1.1', '100.64.1.2', '169.254.0.1', '192.0.2.1', '198.51.100.2', '203.0.113.2', '255.255.255.255', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', 'invalid']) assert.equal(isPublicVisitorAddress(address), false, address);
  assert.equal(isPublicVisitorAddress('8.8.8.8'), true);
  assert.equal(isPublicVisitorAddress('2606:4700:4700::1111'), true);
  const handler = createVisitorHandler(options({ geolocate: () => assert.fail('Local address shared with provider') }));
  const response = await call(handler, { method: 'POST', ip: '127.0.0.1' });
  assert.equal(response.status, 200);
  assert.equal(response.body.current, null);
  assert.equal(response.body.recorded, false);
  assert.equal(response.body.totalVisits, 0);
});

test('GeoJS lookup uses a fixed HTTPS endpoint, bounded response, timeout and no redirects', async () => {
  let request;
  const locator = createGeoJSLocator({ fetchImpl: async (url, init) => { request = { url, ...init }; return Response.json(GEO); } });
  assert.deepEqual(await locator('8.8.8.8'), GEO);
  assert.equal(request.url, 'https://get.geojs.io/v1/ip/geo/8.8.8.8.json');
  assert.equal(request.redirect, 'error');
  assert.ok(request.signal instanceof AbortSignal);
  assert.deepEqual(request.headers, { Accept: 'application/json' });
  assert.equal(await locator('http://evil.example/'), null);
  for (const response of [new Response('x'.repeat(9000)), new Response('{}', { headers: { 'content-length': '9000' } }), new Response('invalid-json'), new Response('{}', { status: 429 })]) {
    assert.equal(await createGeoJSLocator({ fetchImpl: async () => response })('8.8.8.8'), null);
  }
});

test('independent HTTPS GeoIP fallback recovers timeouts, invalid data and provider failures', async () => {
  for (const failure of ['timeout', 'status', 'invalid', 'oversized']) {
    const requests = [];
    const locator = createVisitorLocator({ fetchImpl: async (url, init) => {
      requests.push({url, ...init});
      if (requests.length === 1) {
        if (failure === 'timeout') throw new Error('provider timeout');
        if (failure === 'status') return new Response('{}', {status:503});
        if (failure === 'oversized') return new Response('x'.repeat(9000));
        return Response.json({latitude:100,longitude:0,country_code:'US'});
      }
      return Response.json({...GEO,success:true});
    } });
    assert.equal(visitorLocation(await locator('2606:4700:4700::1111')).current.countryCode, 'US');
    assert.equal(requests.length, 2, failure);
    assert.equal(requests[1].url, 'https://ipwho.is/2606%3A4700%3A4700%3A%3A1111');
    assert.equal(requests[1].redirect, 'error');
    assert.ok(requests[1].signal instanceof AbortSignal);
  }
  let calls = 0;
  const primary = createVisitorLocator({fetchImpl:async () => {calls++;return Response.json(GEO);}});
  assert.ok(await primary('8.8.8.8'));
  assert.equal(calls, 1, 'successful primary never spends fallback quota');
  assert.equal(await primary('127.0.0.1'), null);
  assert.equal(calls, 1, 'private address never leaves the server');
  for (const response of [{...GEO,success:false}, {latitude:'',longitude:'',country_code:'US'}]) {
    const unavailable = createVisitorLocator({fetchImpl:async url => url.includes('geojs') ? new Response('{}',{status:503}) : Response.json(response)});
    assert.equal(await unavailable('8.8.8.8'), null);
  }
});

test('temporary lookup failures retry quickly and can subsequently record the same visitor', async () => {
  let time = NOW, lookups = 0;
  const handler = createVisitorHandler(options({now:()=>time,geolocate:async()=> ++lookups === 1 ? null : GEO}));
  const failed = await call(handler,{method:'POST'});
  assert.equal(failed.body.locationStatus,'lookup_unavailable');
  assert.equal(failed.body.recorded,false);
  time += 14_999;
  assert.equal((await call(handler)).body.current,null);
  assert.equal(lookups,1,'failed lookups share a short retry window');
  time++;
  const recovered = await call(handler,{method:'POST'});
  assert.equal(lookups,2);
  assert.equal(recovered.body.locationStatus,'located');
  assert.equal(recovered.body.recorded,true);
  assert.equal(recovered.body.totalVisits,1);
  time += 60_000;
  assert.ok((await call(handler)).body.current);
  assert.equal(lookups,2,'successful lookups retain the longer cache');
  assert.equal((await call(handler,{headers:{dnt:'1'}})).body.locationStatus,'privacy');
  assert.equal((await call(handler,{ip:'127.0.0.1'})).body.locationStatus,'unknown_network');
});

test('local preview reads real live records through a fixed GET without recording test visits', async () => {
  const live = {points:[{...POINT,visits:7}],totalVisits:7,current:{...visitorLocation(GEO).current,accuracyRadiusKm:150,ip:GEO.ip},currentIp:GEO.ip,updatedAt:new Date(NOW).toISOString(),secret:'discard'};
  const requests = [];
  const server = createPortfolioServer({visitorOptions:{fetchImpl:async(url,init)=>{requests.push({url,...init});return Response.json(live);}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/api/visitors?ip=1.1.1.1`);
    const data = await response.json();
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(data.dataSource,'live-preview');
    assert.equal(data.totalVisits,7);
    assert.equal(data.points[0].visits,7);
    assert.equal(data.current.label,'Baltimore, Maryland, United States');
    assert.equal(data.current.accuracyRadiusKm,150);
    assert.equal(data.currentIp,GEO.ip);
    assert.equal(JSON.stringify(data.points).includes(GEO.ip),false);
    assert.equal(data.current.ip,undefined);
    assert.equal(data.secret,undefined);
    assert.equal(requests[0].url,'https://evanbartkowski.com/api/visitors');
    assert.equal(requests[0].method,'GET');
    assert.equal(requests[0].redirect,'error');
    assert.equal((await fetch(`${base}/api/visitors`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'})).status,405);
    assert.equal(requests.length,1,'local writes never reach production');
    assert.equal((await fetch(`${base}/api/visitors`,{headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal(requests.length,1,'foreign origins never call upstream');
    const privateResponse = await fetch(`${base}/api/visitors`,{headers:{DNT:'1','Sec-GPC':'1'}}).then(r=>r.json());
    assert.equal(privateResponse.current,null);
    assert.equal(privateResponse.locationStatus,'privacy');
    assert.equal(requests[1].headers.DNT,'1');
    assert.equal(requests[1].headers['Sec-GPC'],'1');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});

test('local live-data failures are explicit and never replaced with empty fake data', async () => {
  for (const failure of ['timeout','status','oversized','invalid']) {
    const handler = createVisitorPreviewHandler({fetchImpl:async()=>{
      if(failure==='timeout')throw new Error('private upstream details');
      if(failure==='status')return new Response('{}',{status:503});
      if(failure==='oversized')return new Response('x'.repeat(66_000));
      return Response.json({points:'invalid'});
    }});
    const response = await call(handler);
    assert.equal(response.status,503,failure);
    assert.equal(response.body.code,'map_unavailable');
    assert.equal(response.body.points,undefined);
    assert.equal(response.text.includes('private upstream'),false);
  }
});

test('POST records at most one visit per IP/day and preserves no raw address', async () => {
  const observed = [];
  const store = createMemoryVisitorStore();
  const handler = createVisitorHandler(options({ store: {
    listPoints: value => store.listPoints(value),
    recordVisit: value => { observed.push(value); return store.recordVisit(value); },
  } }));
  const first = await call(handler, { method: 'POST' });
  assert.equal(first.status, 200);
  assert.equal(first.body.recorded, true);
  assert.equal(first.body.totalVisits, 1);
  assert.equal((await call(handler, { method: 'POST' })).body.recorded, false);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].point.lat, 37.5);
  assert.equal(JSON.stringify(observed).includes(GEO.ip), false);
  assert.equal(first.body.currentIp,GEO.ip);
  assert.equal(JSON.stringify(first.body.points).includes(GEO.ip),false);
  assert.equal(first.text.includes(GEO.organization_name), false);
  assert.equal(first.headers['Set-Cookie'], undefined);
  assert.equal(first.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(first.headers['Cache-Control'], 'private, no-store');
});

test('geolocation promises and aggregate reads are cached across concurrent requests', async () => {
  let lookups = 0;
  let reads = 0;
  const handler = createVisitorHandler(options({
    geolocate: async () => { lookups++; await new Promise(resolve => setTimeout(resolve, 5)); return GEO; },
    store: { recordVisit: async () => ({ recorded: true }), listPoints: async () => { reads++; return { points: [], totalVisits: 0 }; } },
  }));
  const replies = await Promise.all(Array.from({ length: 5 }, () => call(handler)));
  assert.ok(replies.every(reply => reply.status === 200));
  assert.equal(lookups, 1);
  assert.equal(reads, 1);
});

test('current geography stays specific to the requesting visitor, never to the aggregate cache', async () => {
  const handler = createVisitorHandler(options({ geolocate: async address => address === '8.8.8.8' ? GEO : { ...GEO, country_code: 'CA', city: 'Toronto', region: 'Ontario', latitude: 43.7, longitude: -79.4 } }));
  const one = await call(handler);
  const two = await call(handler, { ip: '1.1.1.1' });
  assert.equal(one.body.current.countryCode, 'US');
  assert.equal(two.body.current.countryCode, 'CA');
  assert.equal(two.text.includes('Baltimore'), false);
});

test('only the requesting connection receives its own validated address, never other visitors', async () => {
  const records = [];
  const store = createMemoryVisitorStore();
  const handler = createVisitorHandler(options({store:{
    listPoints: value => store.listPoints(value),
    recordVisit: value => {records.push(value);return store.recordVisit(value);},
  }}));
  const first = await call(handler,{method:'POST',path:'/api/visitors?ip=9.9.9.9'});
  const other = await call(handler,{method:'POST',ip:'1.1.1.1',headers:{'x-forwarded-for':'9.9.9.9','cf-connecting-ip':'9.9.9.9'}});
  assert.equal(first.body.currentIp,'8.8.8.8');
  assert.equal(other.body.currentIp,'1.1.1.1','provider and untrusted forwarding headers cannot replace the requester');
  assert.equal(other.text.includes('8.8.8.8'),false,'aggregate cache does not disclose a previous requester');
  assert.equal(JSON.stringify(records).includes('8.8.8.8'),false);
  assert.equal(JSON.stringify(records).includes('1.1.1.1'),false);
  assert.equal(JSON.stringify(other.body.points).includes('1.1.1.1'),false);
  assert.equal(other.headers['Cache-Control'],'private, no-store');
  const ipv6 = await call(handler,{ip:'104.16.1.1',headers:{'cf-connecting-ip':'2606:4700:4700::1111'}});
  assert.equal(ipv6.body.currentIp,'2606:4700:4700::1111');
  assert.equal((await call(handler,{ip:'127.0.0.1'})).body.currentIp,null);
  assert.equal((await call(createVisitorHandler(options({geolocate:async()=>null})))).body.currentIp,'8.8.8.8','own IP remains readable when geography is unavailable');
});

test('preview forwards only a valid public current address and drops unexpected address lists', async () => {
  for(const currentIp of ['127.0.0.1','192.168.1.1','https://evil.example','8.8.8.8, 1.1.1.1',['8.8.8.8'],null,'2606:4700:4700::1111']) {
    const handler = createVisitorPreviewHandler({fetchImpl:async()=>Response.json({points:[],totalVisits:0,current:null,currentIp,updatedAt:new Date(NOW).toISOString(),ips:['1.1.1.1']})});
    const response = await call(handler);
    assert.equal(response.status,200);
    assert.equal(response.body.currentIp,currentIp==='2606:4700:4700::1111'?currentIp:null);
    assert.equal(response.body.ips,undefined);
  }
});

test('an in-flight old summary cannot hide a just-recorded visit or poison the cache', async () => {
  let release;
  let started;
  let reads = 0;
  let recorded = false;
  const began = new Promise(resolve => { started = resolve; });
  const handler = createVisitorHandler(options({ store: {
    recordVisit: async () => { recorded = true; return { recorded: true }; },
    listPoints: async () => {
      reads++;
      if (reads === 1) { started(); await new Promise(resolve => { release = resolve; }); return { points: [], totalVisits: 0 }; }
      return { points: recorded ? [{ ...POINT, visits: 1 }] : [], totalVisits: recorded ? 1 : 0 };
    },
  } }));
  const old = call(handler);
  await began;
  const fresh = await call(handler, { method: 'POST' });
  assert.equal(fresh.body.totalVisits, 1);
  release();
  await old;
  assert.equal((await call(handler)).body.totalVisits, 1);
  assert.equal(reads, 2);
});

test('DNT and GPC skip provider calls and persisted visits', async () => {
  const handler = createVisitorHandler(options({
    geolocate: () => assert.fail('Privacy signal triggered third-party lookup'),
    store: { recordVisit: () => assert.fail('Privacy signal recorded a visit'), listPoints: async () => ({ points: [], totalVisits: 4 }) },
  }));
  for (const headers of [{ dnt: '1' }, { 'sec-gpc': '1' }]) {
    const response = await call(handler, { method: 'POST', headers });
    assert.equal(response.status, 200);
    assert.equal(response.body.trackingDisabled, true);
    assert.equal(response.body.recorded, false);
    assert.equal(response.body.current, null);
    assert.equal(response.body.totalVisits, 4);
  }
});

test('origins are explicit, POST needs origin, and local origins require an opt-in', async () => {
  const handler = createVisitorHandler(options());
  for (const origin of ['https://evil.example', 'https://evanbartkowski.com.evil.example', 'https://evanbartkowski.com/', 'null', 'http://127.0.0.1:4173', undefined]) {
    assert.equal((await call(handler, { method: 'POST', headers: { origin } })).status, 403, String(origin));
  }
  assert.equal((await call(handler, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call(handler, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await call(handler, { method: 'POST', headers: { origin: 'https://personal-website-7d04c.web.app' } })).status, 200);
  const local = createVisitorHandler(options({ allowLocal: true }));
  assert.equal((await call(local, { method: 'POST', ip: '127.0.0.1', headers: { origin: 'http://127.0.0.1:4173' } })).status, 200);
  for (const origin of ['http://localhost.evil.example:4173', 'http://localhost:4173/path', 'ftp://localhost:4173', 'http://user:password@localhost:4173']) assert.equal((await call(local, { method: 'POST', headers: { origin } })).status, 403);
});

test('forwarded IP/location headers and client JSON cannot impersonate a visitor', async () => {
  const lookedUp = [];
  const handler = createVisitorHandler(options({ geolocate: async address => { lookedUp.push(address); return GEO; } }));
  const response = await call(handler, { ip: '127.0.0.1', headers: { 'x-forwarded-for': '8.8.8.8', 'cf-connecting-ip': '8.8.8.8', 'x-location': 'Baltimore' } });
  assert.equal(response.body.current, null);
  assert.deepEqual(lookedUp, []);
  for (const body of [{ ip: '1.1.1.1' }, { latitude: 43, longitude: 5 }, { current: GEO }, { consent: true }]) assert.equal((await call(handler, { method: 'POST', body: JSON.stringify(body) })).status, 400);
});

test('untrusted public peers cannot forge Cloudflare connecting addresses', async () => {
  const lookedUp = [];
  const handler = createVisitorHandler(options({ geolocate: async address => { lookedUp.push(address); return GEO; } }));
  const response = await call(handler, { method: 'POST', ip: '8.8.8.8', headers: { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '104.16.1.1, 1.1.1.1' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.recorded, true);
  assert.deepEqual(lookedUp, ['8.8.8.8']);
});

test('rotating trusted Cloudflare IPv4 edges deduplicate the same connecting visitor', async () => {
  const lookedUp = [];
  const store = createMemoryVisitorStore();
  const records = [];
  const handler = createVisitorHandler(options({
    geolocate: async address => { lookedUp.push(address); return GEO; },
    store: { listPoints: value => store.listPoints(value), recordVisit: value => { records.push(value); return store.recordVisit(value); } },
  }));
  const headers = { 'cf-connecting-ip': '8.8.8.8' };
  const first = await call(handler, { method: 'POST', ip: '104.16.1.1', headers });
  const next = await call(handler, { method: 'POST', ip: '172.64.5.9', headers });
  const mapped = await call(handler, { method: 'POST', ip: '::ffff:173.245.48.7', headers });
  assert.equal(first.body.recorded, true);
  assert.equal(next.body.recorded, false);
  assert.equal(mapped.body.recorded, false);
  assert.equal(next.body.totalVisits, 1);
  assert.equal(mapped.body.totalVisits, 1);
  assert.deepEqual(lookedUp, ['8.8.8.8']);
  assert.equal(records.length, 1);
  assert.equal(records[0].visitorId, createDailyVisitorHasher(SECRET)('8.8.8.8', '2026-11-03'));
  assert.equal(JSON.stringify(records).includes('8.8.8.8'), false);
  assert.equal(JSON.stringify(records).includes('104.16.1.1'), false);
  assert.equal(first.body.currentIp,'8.8.8.8');
  assert.equal(JSON.stringify(first.body.points).includes('8.8.8.8'),false);
});

test('trusted Cloudflare IPv6 ranges support public IPv4 and IPv6 visitors', async () => {
  const lookedUp = [];
  const handler = createVisitorHandler(options({ geolocate: async address => { lookedUp.push(address); return GEO; } }));
  assert.equal((await call(handler, { method: 'POST', ip: '2400:cb00::1', headers: { 'cf-connecting-ip': '8.8.8.8' } })).body.recorded, true);
  assert.equal((await call(handler, { method: 'POST', ip: '2a06:98c0::1', headers: { 'cf-connecting-ip': '2001:4860:4860::8888' } })).body.recorded, true);
  assert.equal((await call(handler, { method: 'POST', ip: '2a06:98c7:ffff::1', headers: { 'cf-connecting-ip': '2001:4860:4860::8888' } })).body.recorded, false);
  assert.deepEqual(lookedUp, ['8.8.8.8', '2001:4860:4860::8888']);
});

test('invalid, missing, private or multiple connecting headers never geolocate trusted edges', async () => {
  const handler = createVisitorHandler(options({ geolocate: () => assert.fail('Invalid connecting header triggered provider lookup') }));
  for (const value of [undefined, '', 'invalid', '8.8.8.8, 1.1.1.1', ['8.8.8.8', '1.1.1.1'], ['8.8.8.8'], '127.0.0.1', '10.0.0.1', '192.168.1.1', '::1', 'fd00::1', '2001:db8::1', 'https://evil.example/']) {
    const response = await call(handler, { method: 'POST', ip: '104.16.1.1', headers: { 'cf-connecting-ip': value, 'x-forwarded-for': '8.8.8.8' } });
    assert.equal(response.status, 200, String(value));
    assert.equal(response.body.current, null, String(value));
    assert.equal(response.body.recorded, false, String(value));
    assert.equal(response.body.totalVisits, 0, String(value));
  }
});

test('Cloudflare range boundaries do not trust adjacent unrelated networks', async () => {
  const lookedUp = [];
  const handler = createVisitorHandler(options({ geolocate: async address => { lookedUp.push(address); return GEO; } }));
  for (const ip of ['104.15.255.254', '104.28.0.1', '173.245.47.255', '2a06:98c8::1']) {
    assert.equal((await call(handler, { ip, headers: { 'cf-connecting-ip': '8.8.8.8' } })).status, 200);
  }
  assert.deepEqual(lookedUp, ['104.15.255.254', '104.28.0.1', '173.245.47.255', '2a06:98c8::1']);
});

test('methods, malformed bodies, content types, and oversized raw/streamed bodies are rejected', async () => {
  const handler = createVisitorHandler(options());
  const other = await call(handler, { path: '/api/other' });
  assert.equal(other.handled, false);
  assert.equal(other.status, undefined);
  const method = await call(handler, { method: 'DELETE' });
  assert.equal(method.status, 405);
  assert.equal(method.headers.Allow, 'GET, POST');
  for (const body of ['invalid JSON', '[]', 'null', 'true', '{"unexpected":1}']) assert.equal((await call(handler, { method: 'POST', body })).status, 400);
  assert.equal((await call(handler, { method: 'POST', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call(handler, { method: 'POST', body: ' '.repeat(300) })).status, 413);
  assert.equal((await call(handler, { method: 'POST', headers: { 'content-length': '300' } })).status, 413);
  assert.equal((await call(handler, { method: 'POST', rawBody: Buffer.from(' '.repeat(300)) })).status, 413);
  assert.equal((await call(handler, { method: 'POST', rawBody: '{}' })).status, 400);
  assert.equal((await call(handler, { method: 'POST', rawBody: Buffer.from('{}') })).status, 200);
});

test('per-visitor and global rate limits apply before provider/database work', async () => {
  let lookups = 0;
  const handler = createVisitorHandler(options({ maxRequestsPerMinute: 2, geolocate: async () => { lookups++; return GEO; } }));
  assert.equal((await call(handler)).status, 200);
  assert.equal((await call(handler)).status, 200);
  const limited = await call(handler);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(lookups, 1);
  const global = createVisitorHandler(options({ maxGlobalRequestsPerMinute: 2 }));
  assert.equal((await call(global)).status, 200);
  assert.equal((await call(global, { ip: '1.1.1.1' })).status, 200);
  assert.equal((await call(global, { ip: '9.9.9.9' })).status, 429);
});

test('failed geolocation leaves an honest unknown location and never creates a map pin', async () => {
  for (const geolocate of [async () => null, async () => ({ city: 'Unknown' }), async () => { throw new Error('Provider detail 8.8.8.8'); }]) {
    const handler = createVisitorHandler(options({ geolocate }));
    const response = await call(handler, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(response.body.recorded, false);
    assert.equal(response.body.current, null);
    assert.equal(response.body.totalVisits, 0);
  }
});

test('database/configuration failures are safe and only a fixed event is logged', async () => {
  const events = [];
  const handler = createVisitorHandler(options({
    store: { recordVisit: async () => ({ recorded: true }), listPoints: async () => { throw new Error('Private query 8.8.8.8'); } },
    logger: value => events.push(value),
  }));
  const response = await call(handler);
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'map_unavailable');
  assert.equal(response.text.includes('8.8.8.8'), false);
  assert.deepEqual(events, ['visitor_map_unavailable']);
  assert.equal((await call(createVisitorHandler(options({ env: {} })))).status, 503);
  assert.equal((await call(createVisitorHandler(options({ hashVisitor: () => '8.8.8.8' })))).status, 503);
});

test('public responses whitelist/quantize aggregate fields and cap map points', async () => {
  const points = Array.from({ length: 150 }, (_, i) => ({ ...POINT, id: `US:${Math.floor(i / 72)}:${i % 72}`, visits: 1, ip: GEO.ip, lat: 39.2904, lon: -76.6122, label: GEO.ip }));
  const handler = createVisitorHandler(options({ store: { recordVisit: async () => ({}), listPoints: async () => ({ points, totalVisits: 150, secret: SECRET, ip: GEO.ip }) } }));
  const response = await call(handler);
  assert.equal(response.body.points.length, 100);
  assert.equal(response.text.includes(SECRET), false);
  assert.equal(response.body.currentIp,GEO.ip);
  assert.equal(JSON.stringify(response.body.points).includes(GEO.ip),false);
  assert.equal(response.body.points[0].lat, -87.5);
  assert.equal(response.body.points[0].label, 'United States');
});

test('new UTC day creates a fresh dedup key and refreshes geolocation', async () => {
  let timestamp = NOW;
  let lookups = 0;
  const handler = createVisitorHandler(options({ now: () => timestamp, geolocate: async () => { lookups++; return GEO; } }));
  assert.equal((await call(handler, { method: 'POST' })).body.recorded, true);
  timestamp += DAY;
  const second = await call(handler, { method: 'POST' });
  assert.equal(second.body.recorded, true);
  assert.equal(second.body.totalVisits, 2);
  assert.equal(lookups, 2);
});

test('memory storage bounds daily visits and excludes expired aggregates', async () => {
  const store = createMemoryVisitorStore({ maxDailyVisits: 1 });
  assert.deepEqual(await store.recordVisit({ visitorId: 'a', day: '2026-11-03', point: POINT, now: NOW }), { recorded: true });
  assert.deepEqual(await store.recordVisit({ visitorId: 'b', day: '2026-11-03', point: POINT, now: NOW }), { recorded: false, limited: true });
  assert.equal((await store.listPoints({ since: '2026-10-05', now: NOW })).totalVisits, 1);
  assert.equal((await store.listPoints({ since: '2026-11-04', now: NOW + 8 * DAY })).totalVisits, 0);
});

test('Firestore transaction atomically deduplicates concurrent visits with coarse aggregates only', async () => {
  const mock = mockFirestore();
  const store = createVisitorStore({ db: mock.db });
  const visitorId = createDailyVisitorHasher(SECRET)('8.8.8.8', '2026-11-03');
  const record = { visitorId, day: '2026-11-03', point: { ...POINT, ip: GEO.ip, city: GEO.city }, now: NOW };
  const results = await Promise.all([store.recordVisit(record), store.recordVisit(record)]);
  assert.equal(results.filter(value => value.recorded).length, 1);
  assert.equal(mock.documents.size, 2);
  const day = mock.documents.get('visitor_days/2026-11-03');
  assert.equal(day.total, 1);
  assert.equal(day.regions[POINT.id].lat, 37.5);
  const seen = mock.documents.get(`visitor_seen/2026-11-03_${visitorId}`);
  assert.deepEqual(Object.keys(seen), ['expiresAt']);
  assert.equal(seen.expiresAt.getTime(), Date.parse('2026-11-05'));
  assert.equal(day.expiresAt.getTime(), Date.parse('2026-11-10'));
  assert.equal(JSON.stringify([...mock.documents]).includes(GEO.ip), false);
  assert.equal(JSON.stringify([...mock.documents]).includes(GEO.city), false);
  assert.equal((await store.listPoints({ since: '2026-10-05', now: NOW })).totalVisits, 1);
  assert.equal(mock.queries[0].max, 7);
});

test('Firestore daily and region bounds refuse writes without consuming a dedup record', async () => {
  const mock = mockFirestore();
  const store = createVisitorStore({ db: mock.db, maxDailyVisits: 1 });
  const hash = createDailyVisitorHasher(SECRET);
  assert.equal((await store.recordVisit({ visitorId: hash('8.8.8.8', '2026-11-03'), day: '2026-11-03', point: POINT, now: NOW })).recorded, true);
  assert.deepEqual(await store.recordVisit({ visitorId: hash('1.1.1.1', '2026-11-03'), day: '2026-11-03', point: POINT, now: NOW }), { recorded: false, limited: true });
  assert.equal(mock.documents.size, 2);
  const secondMock = mockFirestore();
  const regionStore = createVisitorStore({ db: secondMock.db, maxRegionsPerDay: 1 });
  await regionStore.recordVisit({ visitorId: hash('8.8.8.8', '2026-11-03'), day: '2026-11-03', point: POINT, now: NOW });
  const otherPoint = visitorLocation({ ...GEO, latitude: 10, longitude: 10 }).publicPoint;
  assert.equal((await regionStore.recordVisit({ visitorId: hash('1.1.1.1', '2026-11-03'), day: '2026-11-03', point: otherPoint, now: NOW })).limited, true);
  assert.equal(secondMock.documents.size, 2);
});

test('Firestore queries enforce a seven-day window despite TTL delay or an overly early caller cutoff', async () => {
  const mock = mockFirestore({ ignoreQueryFilters: true });
  const store = createVisitorStore({ db: mock.db });
  const row = (day, expiresAt) => ({ day, total: 3, regions: { [POINT.id]: { ...POINT, visits: 3 } }, expiresAt: new Date(expiresAt) });
  mock.documents.set('visitor_days/2026-10-27', row('2026-10-27', NOW + DAY));
  mock.documents.set('visitor_days/2026-10-28', row('2026-10-28', NOW + DAY));
  mock.documents.set('visitor_days/2026-11-03', row('2026-11-03', NOW + DAY));
  mock.documents.set('visitor_days/2026-11-04', row('2026-11-04', NOW + DAY));
  mock.documents.set('visitor_days/2026-11-02', row('2026-11-02', NOW - 1));
  const result = await store.listPoints({ since: '2000-01-01', now: NOW });
  assert.equal(result.totalVisits, 6);
  assert.equal(result.points[0].visits, 6);
  assert.deepEqual(mock.queries[0].filters, [['day', '>=', '2026-10-28'], ['day', '<=', '2026-11-03']]);
});

test('visitor endpoint requests only this week and reports the seven-day window', async () => {
  let query;
  const handler = createVisitorHandler(options({store: {
    async recordVisit() {return {recorded: false};},
    async listPoints(value) {query=value;return {totalVisits:0,points:[]};},
  }}));
  const result=await call(handler);
  assert.equal(result.status,200);
  assert.equal(result.body.windowDays,7);
  assert.equal(query.since,'2026-10-28');
});

test('Firestore rejects raw-IP identities and precise coordinates without writing', async () => {
  const mock = mockFirestore();
  const store = createVisitorStore({ db: mock.db });
  const record = { visitorId: 'a'.repeat(64), day: '2026-11-03', point: POINT, now: NOW };
  for (const patch of [{ visitorId: GEO.ip }, { day: '2026-11-02' }, { point: { ...POINT, lat: 39.2904 } }, { point: { ...POINT, id: 'US:99:99' } }]) await assert.rejects(store.recordVisit({ ...record, ...patch }));
  assert.equal(mock.documents.size, 0);
});

test('daily storage exhaustion returns a safe 429', async () => {
  const handler = createVisitorHandler(options({ store: { recordVisit: async () => ({ recorded: false, limited: true }), listPoints: async () => ({ points: [], totalVisits: 0 }) } }));
  const response = await call(handler, { method: 'POST' });
  assert.equal(response.status, 429);
  assert.equal(response.headers['Retry-After'], '3600');
});
