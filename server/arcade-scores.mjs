import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {ARCADE_STEP, createArcadeState, arcadeAction, stepArcade, createArcadeRandom} from '../arcade-model.js';
import {visitorRequestAddress} from './visitors.mjs';

export const ARCADE_MAX_STEPS = 108_000;
const RUN_LIFETIME = 15 * 60_000;
const MAX_BODY = 100_000;
const MAX_FLAPS = 10_000;
const ORIGINS = new Set(['https://evanbartkowski.com', 'https://personal-website-7d04c.web.app', 'https://personal-website-7d04c.firebaseapp.com']);
const SECRET_DOMAIN = 'portfolio-flappy-run-v1\0';
const ownKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function send(res, status, body, extra = {}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow', ...extra});
  res.end(JSON.stringify(body));
}
function localOrigin(value) {
  try {const url = new URL(value);return url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.origin === value && !url.username && !url.password;} catch {return false;}
}
async function readBody(req) {
  if (String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') return {status:415};
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY) return {status:413};
  let raw;
  if (Buffer.isBuffer(req.rawBody)) raw = req.rawBody;
  else if (req.rawBody !== undefined) return {status:400};
  else {
    const parts = [];let size = 0;
    for await (const part of req) {const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);size += bytes.length;if (size > MAX_BODY) return {status:413};parts.push(bytes);}
    raw = Buffer.concat(parts);
  }
  if (raw.length > MAX_BODY) return {status:413};
  try {return {value:JSON.parse(raw.toString('utf8'))};} catch {return {status:400};}
}
function summary(value) {
  if (!value || !Number.isSafeInteger(value.highScore) || value.highScore < 0 || value.highScore > 1_200) throw Error('Invalid arcade record');
  const timestamp = value.updatedAt ? new Date(value.updatedAt) : null;
  return {highScore:value.highScore, updatedAt:timestamp && Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null};
}

// Replay exactly the same fixed ticks and seeded course as the browser. A
// caller-supplied score alone can never update the shared record.
export function verifyFlappyReplay({seed, steps, flaps, score}) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff || !Number.isSafeInteger(steps) || steps < 1 || steps > ARCADE_MAX_STEPS
    || !Number.isSafeInteger(score) || score < 0 || score > 1_200 || !Array.isArray(flaps) || flaps.length > MAX_FLAPS) return null;
  let previous = -1;
  for (const step of flaps) {if (!Number.isSafeInteger(step) || step <= previous || step < 0 || step >= steps) return null;previous = step;}
  let state = arcadeAction(createArcadeState('flappy'), 'start'), flapIndex = 0;
  const random = createArcadeRandom(seed);
  for (let step = 0; step < steps; step++) {
    if (flaps[flapIndex] === step) {state = arcadeAction(state, 'flap');flapIndex++;}
    state = stepArcade(state, ARCADE_STEP, {}, random);
    if (state.status === 'over' && step !== steps - 1) return null;
  }
  return state.status === 'over' && state.score[0] === score ? score : null;
}

export function createMemoryArcadeStore() {
  let record = {highScore:0, updatedAt:null};
  return {async getRecord(){return {...record};}, async submitScore({score, now}) {
    const changed = score > record.highScore;
    if (changed) record = {highScore:score, updatedAt:new Date(now).toISOString()};
    return {...record, record:changed};
  }};
}

export function createArcadeHandler({store = createMemoryArcadeStore(), env = process.env, now = Date.now, random = randomBytes, allowLocal = false,
  clientLimit = 90, startLimit = 12, finishLimit = 12, globalLimit = 600, cacheMs = 5_000} = {}) {
  const clients = new Map();let globalWindow, cached, pendingRead;
  const secret = () => {const value = env.VISITOR_HASH_SALT;if (typeof value !== 'string' || value.length < 32) throw Error('Arcade signing unavailable');return value;};
  const ownerHash = address => createHmac('sha256',secret()).update('portfolio-flappy-owner-v1\0' + address).digest('hex');
  const signature = content => createHmac('sha256',secret()).update(SECRET_DOMAIN + content).digest('base64url');
  const reserve = (address, action, timestamp) => {
    for (const [key, value] of clients) if (timestamp - value.started >= 60_000) clients.delete(key);
    if (!globalWindow || timestamp - globalWindow.started >= 60_000) globalWindow = {started:timestamp,count:0};
    if (!clients.has(address) && clients.size >= 1024) return false;
    const value = clients.get(address) || {started:timestamp,count:0,start:0,finish:0};
    clients.set(address,value);
    if (value.count >= clientLimit || globalWindow.count >= globalLimit || action === 'start' && value.start >= startLimit || action === 'finish' && value.finish >= finishLimit) return false;
    value.count++;globalWindow.count++;if (action === 'start') value.start++;if (action === 'finish') value.finish++;
    return true;
  };
  async function getRecord(timestamp) {
    if (cached && timestamp - cached.at < cacheMs) return cached.value;
    if (pendingRead) return pendingRead;
    pendingRead = Promise.resolve().then(()=>store.getRecord()).then(summary).then(value => {
      // An older concurrent read cannot replace a just-verified record.
      if (!cached || value.highScore >= cached.value.highScore) cached = {at:timestamp,value};
      return cached.value;
    }).finally(()=>{pendingRead=undefined;});
    return pendingRead;
  }
  function issueRun(address,timestamp) {
    const bytes = random(20);
    const payload = {v:1,seed:bytes.readUInt32LE(0),at:timestamp,owner:ownerHash(address),nonce:bytes.subarray(4).toString('hex')};
    const content = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return {runId:`${content}.${signature(content)}`,seed:payload.seed,expiresAt:new Date(timestamp+RUN_LIFETIME).toISOString(),step:ARCADE_STEP,maxSteps:ARCADE_MAX_STEPS};
  }
  function decodeRun(token,address,timestamp) {
    if (typeof token !== 'string' || token.length > 600 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [content,supplied] = token.split('.'), expected = signature(content);
    if (!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return null;
    try {
      const value = JSON.parse(Buffer.from(content,'base64url').toString('utf8'));
      return ownKeys(value,['v','seed','at','owner','nonce']) && value.v===1 && Number.isSafeInteger(value.seed) && value.seed>=0 && value.seed<=0xffff_ffff
        && Number.isSafeInteger(value.at) && value.at<=timestamp+2_000 && timestamp-value.at<=RUN_LIFETIME && value.owner===ownerHash(address) && /^[a-f0-9]{32}$/.test(value.nonce) ? value : null;
    } catch {return null;}
  }
  return async function handleArcade(req,res,pathname) {
    const route = pathname || String(req.originalUrl || req.url || '').split('?')[0];
    if (route !== '/api/arcade') return false;
    const origin = req.headers?.origin;
    if (req.headers?.['sec-fetch-site']==='cross-site' || origin!==undefined && !ORIGINS.has(origin) && !(allowLocal && localOrigin(origin)) || req.method==='POST' && !origin) {
      req.resume?.();send(res,403,{error:'Arcade requests must come from this portfolio.'});return true;
    }
    if (!['GET','POST'].includes(req.method)) {req.resume?.();send(res,405,{error:'Use GET or POST.'},{Allow:'GET, POST'});return true;}
    const address = visitorRequestAddress(req,{allowLocal}) || 'unknown';
    const timestamp = now();
    if (!reserve(address,'request',timestamp)) {req.resume?.();send(res,429,{error:'Please wait before trying again.'},{'Retry-After':'60'});return true;}
    try {
      if (req.method==='GET') {send(res,200,await getRecord(timestamp));return true;}
      const body = await readBody(req);
      if (body.status) {req.resume?.();send(res,body.status,{error:'Invalid arcade request.'});return true;}
      const value = body.value;
      if (ownKeys(value,['action']) && value.action==='start') {
        if (!reserve(address,'start',timestamp)) {send(res,429,{error:'Please wait before starting another flight.'},{'Retry-After':'60'});return true;}
        send(res,200,{...issueRun(address,timestamp),...await getRecord(timestamp)});return true;
      }
      if (!ownKeys(value,['action','runId','steps','flaps','score']) || value.action!=='finish') {send(res,400,{error:'Invalid arcade action.'});return true;}
      if (!reserve(address,'finish',timestamp)) {send(res,429,{error:'Please wait before submitting another flight.'},{'Retry-After':'60'});return true;}
      const run = decodeRun(value.runId,address,timestamp);
      if (!run) {send(res,400,{error:'This flight could not be verified. Start a new flight.',code:'invalid_run'});return true;}
      if (Number(value.steps)*ARCADE_STEP*1000 > timestamp-run.at+2_000) {send(res,400,{error:'The flight timing could not be verified.',code:'invalid_replay'});return true;}
      const verifiedScore = verifyFlappyReplay({...value,seed:run.seed});
      if (verifiedScore===null) {send(res,400,{error:'The flight replay could not be verified.',code:'invalid_replay'});return true;}
      const result = await store.submitScore({score:verifiedScore,now:timestamp});
      const record = summary(result);
      if (!cached || record.highScore>=cached.value.highScore) cached={at:timestamp,value:record};
      send(res,200,{...cached.value,verifiedScore,record:result.record===true});return true;
    } catch {send(res,503,{error:'Shared scores are temporarily unavailable. You can still play.',code:'scores_unavailable'});return true;}
  };
}

// Local play joins the same shared board through one fixed endpoint. Browser
// origin and localhost checks remain in the local server; caller addresses,
// destinations and authorization headers are never forwarded.
export function createArcadeProxyHandler({fetchImpl = globalThis.fetch} = {}) {
  return async (req,res,pathname) => {
    if (pathname!=='/api/arcade') return false;
    if (!['GET','POST'].includes(req.method)) {req.resume?.();send(res,405,{error:'Use GET or POST.'},{Allow:'GET, POST'});return true;}
    try {
      let body;
      if (req.method==='POST') {
        const parsed = await readBody(req);
        if (parsed.status) {req.resume?.();send(res,parsed.status,{error:'Invalid arcade request.'});return true;}
        body=JSON.stringify(parsed.value);
      }
      const response=await fetchImpl('https://evanbartkowski.com/api/arcade',{method:req.method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15_000),headers:{Origin:'https://evanbartkowski.com',...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{})});
      const parts=[];let size=0;
      for await (const chunk of response.body || []) {size+=chunk.byteLength;if(size>4_000){await response.body?.cancel?.().catch(()=>{});throw Error('Invalid shared score response');}parts.push(Buffer.from(chunk));}
      const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (!data || typeof data!=='object' || Array.isArray(data)) throw Error('Invalid shared score response');
      const output={};
      for(const key of ['highScore','verifiedScore','seed','step','maxSteps']) if(typeof data[key]==='number' && Number.isFinite(data[key])) output[key]=data[key];
      for(const key of ['runId','expiresAt','updatedAt','error','code']) if(data[key]===null || typeof data[key]==='string' && data[key].length<650) output[key]=data[key];
      if(typeof data.record==='boolean') output.record=data.record;
      send(res,[200,400,403,405,413,415,429,503].includes(response.status)?response.status:503,output,response.status===429?{'Retry-After':'60'}:{});return true;
    } catch {send(res,503,{error:'Shared scores could not be reached. You can still play.',code:'scores_unavailable'});return true;}
  };
}
