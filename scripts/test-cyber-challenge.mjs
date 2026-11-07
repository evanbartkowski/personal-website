import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCyberChallengeState,cyberChallengeCommand,completeCyberChallenge,challengeHint} from '../cyber-challenge-model.js';

const hash='21232f297a57a5a743894a0e4a801fc3';
const run=(state,command)=>cyberChallengeCommand(state,command);
const query=()=>run(createCyberChallengeState(),"query ' OR '1'='1' --").state;
const authenticated=()=>run(query(),'login admin admin').state;
const connected=()=>run(run(authenticated(),'nmap internal-node').state,'ssh admin@internal-node').state;
const text=result=>result.lines.map(line=>line.text).join('\n');

test('only a recognized mock tautology reveals the fictional identity',()=>{
  const original=createCyberChallengeState();
  for(const invalid of ['query admin',"query ' OR '1'='2' --",'query SELECT * FROM users',"query ' OR '1'='1'"]){
    const result=run(original,invalid);assert.equal(result.state.stage,'query');assert.doesNotMatch(text(result),new RegExp(hash));
  }
  for(const syntax of ["query ' OR '1'='1' --", "' or 1=1 --",'query " OR "1"="1" --']){
    const result=run(original,syntax);assert.equal(result.state.stage,'authenticate');assert.match(text(result),/admin/);assert.match(text(result),new RegExp(hash));
  }
  assert.deepEqual(original,createCyberChallengeState(),'commands never mutate their previous state');
});

test('all privileged stages refuse attempts to skip the prior boundary',()=>{
  const locked=createCyberChallengeState();
  for(const command of ['login admin admin','crack '+hash,'nmap','scan localhost','ssh admin@internal-node',':(){ :|:& };:','overload']){
    const result=run(locked,command);assert.equal(result.state.stage,'query',command);assert.equal(result.event,undefined);
  }
  const identity=query();
  for(const command of ['nmap internal-node','ssh admin@internal-node','overload'])assert.equal(run(identity,command).state.stage,'authenticate',command);
  const recon=authenticated();
  assert.equal(run(recon,'ssh admin@internal-node').state.stage,'recon');assert.equal(run(recon,'overload').state.stage,'recon');
});

test('test hash matching is bounded to the supplied wordlist and digest',()=>{
  const state=query();
  assert.match(text(run(state,'wordlist')),/guest\nletmein\nadmin\npassword123\nwelcome/);
  assert.equal(run(state,'crack '+'0'.repeat(32)).state.hashMatched,false);
  assert.equal(run(state,'crack not-a-hash').state.hashMatched,false);
  for(const command of ['crack '+hash,'hashcat -m 0 '+hash+' wordlist','decode '+hash.toUpperCase()]){
    const result=run(state,command);assert.equal(result.state.stage,'authenticate');assert.equal(result.state.hashMatched,true);assert.match(text(result),/: admin/);assert.match(text(result),/one-way/);
  }
});

test('authentication requires the recovered username and matching plaintext',()=>{
  const state=query();
  for(const command of ['login root admin','login admin password123','login admin '+hash,'login ADMIN admin','login admin','login admin admin extra'])assert.equal(run(state,command).state.stage,'authenticate',command);
  const result=run(state,'login admin admin');assert.equal(result.state.stage,'recon');assert.match(text(result),/IDENTITY VERIFIED/);
});

test('recon displays a fixed mock SSH table without accepting external targets',()=>{
  const state=authenticated();
  for(const command of ['nmap','nmap -sV internal-node','scan localhost','scan 127.0.0.1','status']){
    const result=run(state,command);assert.equal(result.state.stage,'connect');assert.match(text(result),/22\/tcp\s+open\s+ssh/);
  }
  for(const command of ['nmap example.com','scan 8.8.8.8','nmap 10.0.0.0/8']){
    const result=run(state,command);assert.equal(result.state.stage,'recon');assert.match(text(result),/fictional/);
  }
});

test('SSH attaches only the discovered identity to the fictional internal node',()=>{
  const state=run(authenticated(),'scan localhost').state;
  for(const command of ['ssh root@internal-node','ssh admin@example.com','ssh admin@localhost','ssh admin@internal-node command'])assert.equal(run(state,command).state.stage,'connect',command);
  const result=run(state,'ssh admin@internal-node');assert.equal(result.state.stage,'shell');assert.match(text(result),/Mock shell access granted/);
});

test('the shell exposes bounded mock state and every overload is just a reboot event',()=>{
  const state=connected();
  assert.equal(text(run(state,'whoami')),'admin');assert.equal(text(run(state,'pwd')),'/srv/sandbox');assert.match(text(run(state,'cat process-guard.txt')),/64 simulated/);
  for(const command of [':(){ :|:& };:',':() { : | : & }; :','overload','stress-test','forkbomb']){
    const result=run(state,command);assert.equal(result.state.stage,'reboot');assert.equal(result.event,'reboot');assert.ok(text(result).length<250);assert.equal(state.stage,'shell');
    assert.equal(run(result.state,'ssh admin@internal-node').state.stage,'reboot');
    assert.equal(completeCyberChallenge(result.state).stage,'complete');
  }
});

test('completion is gated to the reboot transition and reset restores a fresh run',()=>{
  for(const state of [createCyberChallengeState(),query(),authenticated(),connected()])assert.equal(completeCyberChallenge(state),state);
  const state=completeCyberChallenge(run(connected(),'overload').state);
  assert.equal(run(state,'nmap').state.stage,'complete');assert.match(text(run(state,'status')),/complete/i);
  const result=run(state,'reset');assert.deepEqual(result.state,createCyberChallengeState());assert.equal(result.event,'reset');
});

test('hints, clear and close preserve earned progress',()=>{
  const state=connected();
  assert.match(challengeHint(state),/process guard/);
  const hinted=run(state,'hint');assert.equal(hinted.state.stage,'shell');assert.equal(hinted.state.hintsUsed,1);
  assert.match(text(run(state,'hint more')),/overload/);
  assert.equal(run(state,'clear').event,'clear');assert.equal(run(state,'exit').event,'close');assert.equal(run(state,'quit').state.stage,'shell');
});

test('empty, oversized and arbitrary code strings are inert and bounded',()=>{
  const state=connected();
  assert.equal(run(state,'').state,state);assert.equal(run(state,{}).state,state);assert.equal(run(state,'x'.repeat(513)).state,state);
  for(const command of ['<script>globalThis.__ctfExecuted=true</script>','fetch("https://example.com")','process.exit()','rm -rf /','while(true){}','$(curl example.com)']){
    const result=run(state,command);assert.equal(result.state.stage,'shell');assert.equal(result.event,undefined);assert.ok(text(result).length<140);
  }
  assert.equal(globalThis.__ctfExecuted,undefined);
});

test('the standalone challenge modules contain no network or execution primitives',async()=>{
  const source=(await Promise.all(['cyber-challenge-model.js','cyber-challenge.js'].map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')))).join('\n');
  assert.doesNotMatch(source,/\b(?:fetch|eval|WebSocket|XMLHttpRequest|Worker|EventSource)\s*\(/);
  assert.doesNotMatch(source,/new\s+Function\s*\(/);
});
