import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {ARCADE_STEP,createArcadeState,arcadeAction,stepArcade,createArcadeRandom} from '../arcade-model.js';
import {createArcadeHandler,createArcadeProxyHandler,createMemoryArcadeStore,verifyFlappyReplay,ARCADE_MAX_STEPS} from '../server/arcade-scores.mjs';
import {createArcadeScoreStore} from '../functions/arcade-score-store.mjs';

const origin='https://evanbartkowski.com', secret='arcade-unit-test-only-private-salt-value';
const date=Date.parse('2026-11-05T18:00:00Z');
function flight(seed, gates=3) {
  let state=arcadeAction(createArcadeState(),'start'),steps=0;const flaps=[],random=createArcadeRandom(seed);
  while(state.status==='running' && steps<5000) {
    const pipe=state.pipes.find(pipe=>pipe.x+56>state.bird.x-state.bird.radius), target=pipe?.gapY??180;
    if(state.score[0]<gates && state.bird.y>target+8 && state.bird.vy>0) {state=arcadeAction(state,'flap');flaps.push(steps);}
    state=stepArcade(state,ARCADE_STEP,{},random);steps++;
  }
  assert.equal(state.status,'over');return{steps,flaps,score:state.score[0]};
}
function harness(options={}) {
  let timestamp=date;
  const handler=createArcadeHandler({env:{VISITOR_HASH_SALT:secret},now:()=>timestamp,...options});
  const advance=milliseconds=>{timestamp+=Math.round(milliseconds);};
  return{handler,advance};
}
async function invoke(handler,{method='GET',path='/api/arcade',ip='8.8.8.8',body,rawBody,headers={}}={}) {
  const result={};
  const request={method,url:path,originalUrl:path,headers:{origin,'content-type':'application/json',...headers},ip,socket:{remoteAddress:'10.0.0.1'},resume(){},
    ...(method==='POST'?{rawBody:rawBody===undefined?Buffer.from(JSON.stringify(body)):rawBody}:{})};
  const handled=await handler(request,{writeHead(status,value){result.status=status;result.headers=value;},end(value){result.body=JSON.parse(value);}},path);
  return{...result,handled};
}
async function completedRun(h, gates=3) {
  const start=await invoke(h.handler,{method:'POST',body:{action:'start'}});assert.equal(start.status,200);
  const replay=flight(start.body.seed,gates);h.advance(replay.steps*ARCADE_STEP*1000+20);
  return{start,replay,body:{action:'finish',runId:start.body.runId,...replay}};
}

test('fixed seed replay verifies a completed flight and rejects fabricated scores or input histories',()=>{
  const replay=flight(42);assert.equal(replay.score,3);
  assert.equal(verifyFlappyReplay({seed:42,...replay}),3);
  for(const altered of [{score:999},{steps:replay.steps+1},{steps:0},{steps:ARCADE_MAX_STEPS+1},{flaps:[-1]},{flaps:[1,1]},{flaps:[2,1]},{flaps:[replay.steps]},{flaps:Array(10001).fill(1)}])
    assert.equal(verifyFlappyReplay({seed:42,...replay,...altered}),null);
});
test('all visitors read one all-time record and a verified lower score never replaces it',async()=>{
  const store=createMemoryArcadeStore(),h=harness({store});
  assert.deepEqual((await invoke(h.handler)).body,{highScore:0,updatedAt:null});
  const first=await completedRun(h);
  const saved=await invoke(h.handler,{method:'POST',body:first.body});
  assert.equal(saved.status,200);assert.equal(saved.body.verifiedScore,3);assert.equal(saved.body.highScore,3);assert.equal(saved.body.record,true);
  assert.equal((await invoke(h.handler,{ip:'1.1.1.1'})).body.highScore,3);
  const next=await completedRun(h,1),lower=await invoke(h.handler,{method:'POST',body:next.body});
  assert.equal(lower.status,200);assert.equal(lower.body.record,false);assert.equal(lower.body.highScore,3);
  h.advance(40*86400000);assert.equal((await invoke(h.handler)).body.highScore,3,'shared record has no visitor retention window');
});
test('opaque signed runs are client-bound, expire, and cannot be forged or completed too quickly',async()=>{
  const h=harness(),run=await completedRun(h);
  assert.equal((await invoke(h.handler,{method:'POST',ip:'1.1.1.1',body:run.body})).status,400);
  assert.equal((await invoke(h.handler,{method:'POST',body:{...run.body,runId:run.body.runId.slice(0,-1)+(run.body.runId.endsWith('a')?'b':'a')}})).status,400);
  const fresh=await invoke(h.handler,{method:'POST',body:{action:'start'}}),replay=flight(fresh.body.seed);
  assert.equal((await invoke(h.handler,{method:'POST',body:{action:'finish',runId:fresh.body.runId,...replay}})).body.code,'invalid_replay');
  h.advance(16*60000);assert.equal((await invoke(h.handler,{method:'POST',body:run.body})).body.code,'invalid_run');
  assert.equal((await invoke(h.handler)).body.highScore,0);
});
test('verified Cloudflare edges bind to the same connecting visitor rather than rotating edge addresses',async()=>{
  const h=harness(),headers={'cf-connecting-ip':'8.8.8.8'};
  const start=await invoke(h.handler,{method:'POST',ip:'104.16.0.1',headers,body:{action:'start'}}),replay=flight(start.body.seed);
  h.advance(replay.steps*ARCADE_STEP*1000+20);
  const saved=await invoke(h.handler,{method:'POST',ip:'172.64.0.5',headers,body:{action:'finish',runId:start.body.runId,...replay}});
  assert.equal(saved.status,200);assert.equal(saved.body.highScore,replay.score);
});
test('origins, methods, content types, consumed raw bodies, and size bounds are enforced before store writes',async()=>{
  let writes=0;const h=harness({store:{async getRecord(){return{highScore:0,updatedAt:null};},async submitScore(){writes++;throw Error('Should not write');}}});
  const invalid=[
    {method:'POST',body:{action:'start'},headers:{origin:'https://attacker.invalid'},status:403},
    {method:'POST',body:{action:'start'},headers:{origin:undefined},status:403},
    {method:'POST',body:{action:'start'},headers:{'sec-fetch-site':'cross-site'},status:403},
    {method:'DELETE',status:405},
    {method:'POST',rawBody:Buffer.from('{}'),headers:{'content-type':'text/plain'},status:415},
    {method:'POST',rawBody:'already parsed text',status:400},
    {method:'POST',rawBody:Buffer.from('not JSON'),status:400},
    {method:'POST',rawBody:Buffer.alloc(100001),status:413},
    {method:'POST',body:{action:'start',score:99},status:400},
    {method:'POST',body:{action:'finish',runId:'bad',steps:1,score:123,flaps:[]},status:400},
  ];
  for(const {status,...request} of invalid) assert.equal((await invoke(h.handler,request)).status,status);
  assert.equal(writes,0);assert.equal((await invoke(h.handler,{path:'/api/unknown'})).handled,false);
});
test('start/finish and global request limits bound replay and storage work',async()=>{
  const h=harness({startLimit:1,globalLimit:20});
  assert.equal((await invoke(h.handler,{method:'POST',body:{action:'start'}})).status,200);
  assert.equal((await invoke(h.handler,{method:'POST',body:{action:'start'}})).status,429);
  h.advance(60001);assert.equal((await invoke(h.handler,{method:'POST',body:{action:'start'}})).status,200);
  const limited=harness({globalLimit:2});
  assert.equal((await invoke(limited.handler)).status,200);assert.equal((await invoke(limited.handler,{ip:'1.1.1.1'})).status,200);
  assert.equal((await invoke(limited.handler,{ip:'9.9.9.9'})).status,429);
});
test('missing configuration and database failures are honest without leaking private exceptions',async()=>{
  const missing=harness({env:{}});
  const response=await invoke(missing.handler,{method:'POST',body:{action:'start'}});
  assert.equal(response.status,503);assert.equal(response.body.code,'scores_unavailable');
  const broken=harness({store:{async getRecord(){throw Error('private-db-path-secret');}}});
  assert.equal((await invoke(broken.handler)).status,503);
  assert.equal(JSON.stringify((await invoke(broken.handler)).body).includes('private-db-path'),false);
});
test('the Firestore record updates its maximum atomically and never stores an expiry or client information',async()=>{
  let data,chain=Promise.resolve();const writes=[];
  const ref={async get(){return{exists:!!data,data:()=>data};}};
  const db={collection(name){assert.equal(name,'arcade_records');return{doc(id){assert.equal(id,'flappy');return ref;}};},runTransaction(work){
    const next=chain.then(()=>work({async get(){return{exists:!!data,data:()=>data};},set(_ref,value){data=value;writes.push(value);}}));
    chain=next.catch(()=>{});return next;
  }};
  const store=createArcadeScoreStore({db});assert.deepEqual(await store.getRecord(),{highScore:0,updatedAt:null});
  await Promise.all([3,8,2,5].map(score=>store.submitScore({score,now:date})));
  assert.equal((await store.getRecord()).highScore,8);assert.deepEqual(Object.keys(data).sort(),['highScore','updatedAt']);
  assert.deepEqual(writes.map(value=>value.highScore),[3,8]);
  await assert.rejects(()=>store.submitScore({score:Infinity,now:date}));
});
test('local preview forwards only fixed arcade requests and never sends caller identities or arbitrary destinations',async()=>{
  const forwarded=[];
  const handler=createArcadeProxyHandler({fetchImpl:async(url,options)=>{
    forwarded.push({url,options});return Response.json({highScore:9,updatedAt:null});
  }});
  const result=await invoke(handler,{method:'POST',body:{action:'start'},headers:{authorization:'private-caller-token','x-forwarded-for':'9.9.9.9'}});
  assert.equal(result.status,200);assert.equal(result.body.highScore,9);assert.equal(forwarded[0].url,'https://evanbartkowski.com/api/arcade');
  assert.equal(forwarded[0].options.headers.Origin,origin);assert.equal(forwarded[0].options.headers.authorization,undefined);assert.equal(forwarded[0].options.headers['x-forwarded-for'],undefined);
  assert.equal(forwarded[0].options.redirect,'error');
  const broken=createArcadeProxyHandler({fetchImpl:async()=>{throw Error('private upstream detail');}});
  const unavailable=await invoke(broken);assert.equal(unavailable.status,503);assert.equal(unavailable.body.code,'scores_unavailable');
});
test('native streamed requests use the same bounded raw JSON path as Functions requests',async()=>{
  const h=harness({allowLocal:true});
  const server=createServer((req,res)=>h.handler(req,res,new URL(req.url,'http://localhost').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const local=`http://127.0.0.1:${server.address().port}`;
    const response=await fetch(local+'/api/arcade',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},body:JSON.stringify({action:'start'})});
    assert.equal(response.status,200);assert.equal(typeof(await response.json()).runId,'string');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
