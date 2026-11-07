import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicPlayer, blendMusicGain, MUSIC_FADES} from '../music-player.js';

const flush = async () => {for (let i=0;i<20;i++) await Promise.resolve();};
function fixture({muted = false, volume = .1, readonlyVolume = false, noContext = false} = {}) {
  let time=0, nextId=0;
  const intervals=new Map(), delays=new Map(), nodes=[], failures=new Map(), waiting=new Map(), positions={}, contexts=[];
  class Element extends EventTarget {
    constructor(type){super();this.type=type;this.dataset={};this.children=[];this.paused=true;this.duration=100;this.currentTime=0;this.volume=0;this.muted=false;this.ended=false;this.playCalls=0;if(readonlyVolume&&type==='audio')Object.defineProperty(this,'volume',{get:()=>1,set:()=>{}});}
    append(node){this.children.push(node);}
    remove(){this.removed=true;}
    removeAttribute(name){if(name==='src')this.src='';}
    load(){this.ended=false;this.dispatchEvent(new Event('loadedmetadata'));}
    async play(){this.playCalls++;const file=this.src.split('/').at(-1);if(failures.has(file))throw failures.get(file);if(waiting.has(file))await waiting.get(file).promise;this.paused=false;this.dispatchEvent(new Event('playing'));}
    pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
  }
  class FakeContext {
    constructor(){this.state='suspended';this.channels=[];contexts.push(this);}
    createMediaElementSource(){return {connect(){},disconnect(){}};}
    createGain(){const node={gain:{value:0},connect(){},disconnect(){}};this.channels.push(node);return node;}
    async resume(){this.state='running';}
    async close(){this.state='closed';}
  }
  const document={body:new Element('body'),createElement(type){const node=new Element(type);nodes.push(node);return node;}};
  const player=createMusicPlayer({tracks:['a.mp3','b.mp3','c.mp3'],track:'a.mp3',volume,muted,document,AudioContext:noContext?null:FakeContext,now:()=>time,setInterval:fn=>{const id=++nextId;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),setTimeout:(fn,ms)=>{const id=++nextId;delays.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>delays.delete(id),onPosition:(file,value)=>{positions[file]=value;}});
  return {player,positions,failures,waiting,intervals,nodes,contexts,
    hold(file){let release;const promise=new Promise(resolve=>{release=resolve;});waiting.set(file,{promise,release});return release;},
    async advance(ms){for(let elapsed=0;elapsed<ms;elapsed+=25){time+=Math.min(25,ms-elapsed);for(const fn of [...intervals.values()])fn();for(const [id,entry] of [...delays])if(entry.at<=time){delays.delete(id);entry.fn();}await flush();}},
  };
}
const near=(value,expected,tolerance=.0001)=>assert.ok(Math.abs(value-expected)<tolerance,`${value} should be near ${expected}`);

test('crossfade envelopes preserve equal power and never exceed their endpoints',()=>{
  for(let i=0;i<=100;i++){
    const a=blendMusicGain(1,0,i/100),b=blendMusicGain(0,1,i/100);
    near(a*a+b*b,1);assert.ok(a>=0&&a<=1&&b>=0&&b<=1);
  }
});

test('play fades in, manual tracks overlap at midpoint and outgoing stops at completion',async()=>{
  const f=fixture(),p=f.player;
  await p.play();near(p.audio.volume,0);await f.advance(MUSIC_FADES.play);near(p.audio.volume,.1);
  const old=p.audio,change=p.select('b.mp3');await flush();
  assert.notEqual(p.audio,old);assert.equal(old.paused,false);assert.equal(p.audio.paused,false);
  await f.advance(MUSIC_FADES.track/2);
  near(old.volume,.1/Math.sqrt(2));near(p.audio.volume,.1/Math.sqrt(2));
  await f.advance(MUSIC_FADES.track/2);assert.equal(await change,true);
  assert.equal(old.paused,true);near(old.volume,0);near(p.audio.volume,.1);assert.equal(f.intervals.size,0);
  p.dispose();
});

test('natural advance begins before the end and resets the completed track position',async()=>{
  const f=fixture(),p=f.player;await p.play();await f.advance(800);
  const old=p.audio;old.currentTime=97;old.dispatchEvent(new Event('timeupdate'));await flush();
  assert.equal(p.audio.dataset.track,'b.mp3');assert.equal(old.paused,false,'outgoing remains audible before the physical end');
  await f.advance(3300);assert.equal(old.paused,true);assert.equal(f.positions['a.mp3'],0);
  old.dispatchEvent(new Event('timeupdate'));assert.equal(f.positions['a.mp3'],0,'a queued event from the retired deck cannot overwrite the completed-track reset');
  p.dispose();
});

test('pause fades out and a rapid second click resumes instead of leaving a stale pause',async()=>{
  const f=fixture(),p=f.player;await p.play();await f.advance(800);
  p.pause();assert.equal(p.enabled,false);assert.equal(p.audio.paused,false);
  await f.advance(200);assert.ok(p.audio.volume>0&&p.audio.volume<.1);
  await p.play();await f.advance(800);assert.equal(p.enabled,true);assert.equal(p.audio.paused,false);near(p.audio.volume,.1);
  const paused=p.pause();p.setVolume(.35);await f.advance(500);await paused;
  assert.ok(p.audios.every(audio=>audio.paused));near(p.audio.volume,0);
  await p.select('c.mp3');assert.equal(p.audio.paused,true,'track selection while paused never starts playback');
  await p.play();await f.advance(800);near(p.audio.volume,.35);p.dispose();
});

test('mute silences both decks immediately and unmute/volume changes use ramps',async()=>{
  const f=fixture(),p=f.player;await p.play();await f.advance(800);
  const change=p.select('b.mp3');await flush();await f.advance(1000);p.setMuted(true);
  assert.ok(p.audios.every(audio=>audio.muted));
  p.setVolume(.24);await f.advance(250);assert.ok(p.audios.every(audio=>audio.muted));
  p.setMuted(false);assert.ok(p.audios.every(audio=>!audio.muted&&audio.volume===0));
  await f.advance(225);assert.ok(p.audios.some(audio=>audio.volume>0));
  await f.advance(2500);await change;near(p.audio.volume,.24);
  p.setVolume(0);await f.advance(250);near(p.audio.volume,0);assert.equal(p.enabled,true);assert.equal(p.audio.muted,false);
  p.dispose();
});

test('a blocked incoming track keeps the outgoing song and rapid track requests choose the latest',async()=>{
  const f=fixture(),p=f.player;await p.play();await f.advance(800);const original=p.audio;
  f.failures.set('b.mp3',new DOMException('Gesture required','NotAllowedError'));
  assert.equal(await p.select('b.mp3'),false);assert.equal(p.audio,original);assert.equal(original.paused,false);near(original.volume,.1);
  f.failures.delete('b.mp3');const release=f.hold('b.mp3');const stale=p.select('b.mp3');await flush();
  const latest=p.select('c.mp3');await flush();release();await flush();await f.advance(3400);
  assert.equal(await stale,false);assert.equal(await latest,true);assert.equal(p.audio.dataset.track,'c.mp3');
  assert.equal(p.audios.filter(audio=>!audio.paused).length,1);p.dispose();assert.equal(f.intervals.size,0);
});

test('pause during overlap and disposal stop both decks, ramps and pending requests',async()=>{
  const f=fixture(),p=f.player;await p.play();await f.advance(800);
  const change=p.select('b.mp3');await flush();await f.advance(1400);
  const paused=p.pause();await f.advance(500);await paused;assert.equal(await change,false);
  assert.ok(p.audios.every(audio=>audio.paused));assert.equal(f.intervals.size,0);
  await p.play();await f.advance(800);assert.equal(p.audios.filter(audio=>!audio.paused).length,1);
  const other=p.select('c.mp3');await flush();p.dispose();await flush();assert.equal(await other,false);
  assert.ok(p.audios.every(audio=>audio.paused&&audio.volume===0));assert.equal(f.intervals.size,0);assert.equal(p.host.removed,true);
});

test('a play promise resolving after its timeout cannot leave a silent ghost deck running',async()=>{
  const f=fixture(),p=f.player;await p.play();await f.advance(800);const old=p.audio;
  const release=f.hold('b.mp3'),incoming=p.select('b.mp3');await flush();await f.advance(10_050);
  assert.equal(await incoming,false);assert.equal(p.audio,old);assert.equal(old.paused,false);
  release();await flush();assert.equal(p.audios.filter(audio=>!audio.paused).length,1);
  assert.equal(p.audio,old);p.dispose();
  const initial=fixture(),resume=initial.hold('a.mp3');const attempt=initial.player.play();await flush();await initial.advance(10_050);await attempt;
  assert.equal(initial.player.state,'error');resume();await flush();assert.ok(initial.player.audios.every(audio=>audio.paused));initial.player.dispose();
});

test('hardware-only media volume uses quiet WebAudio gains, or keeps playback off',async()=>{
  const f=fixture({readonlyVolume:true}),p=f.player;await p.play();
  assert.equal(p.host.dataset.gainControl,'webaudio');assert.equal(f.contexts.length,1);
  assert.equal(f.contexts[0].state,'running');near(f.contexts[0].channels[0].gain.value,0);
  await f.advance(800);near(f.contexts[0].channels[0].gain.value,.1);
  const change=p.select('b.mp3');await flush();await f.advance(1600);
  near(f.contexts[0].channels[0].gain.value,.1/Math.sqrt(2));near(f.contexts[0].channels[1].gain.value,.1/Math.sqrt(2));
  p.setMuted(true);assert.ok(p.audios.every(audio=>audio.muted));assert.ok(f.contexts[0].channels.every(node=>node.gain.value===0),'mute is enforced at the actual graph output');await f.advance(1700);await change;p.dispose();assert.equal(f.contexts[0].state,'closed');
  const unsupported=fixture({readonlyVolume:true,noContext:true});await unsupported.player.play();
  assert.equal(unsupported.player.state,'error');assert.ok(unsupported.player.audios.every(audio=>audio.paused&&audio.playCalls===0),'never fall back to hardware full volume');unsupported.player.dispose();
});

test('choosing a healthy song after initial autoplay failure restores the master fade',async()=>{
  const f=fixture(),p=f.player;f.failures.set('a.mp3',new Error('Unavailable'));await p.play();assert.equal(p.state,'error');near(p.audio.volume,0);
  const changed=p.select('b.mp3');await flush();await f.advance(1000);assert.equal(await changed,true);assert.equal(p.state,'playing');assert.equal(p.audio.paused,false);near(p.audio.volume,.1);
  p.setVolume(0);await f.advance(250);const silent=p.select('c.mp3');await flush();await f.advance(3300);await silent;near(p.audio.volume,0);p.dispose();
});
