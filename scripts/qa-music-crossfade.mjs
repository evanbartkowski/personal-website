import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium, expect} from '@playwright/test';

const base=process.env.PORTFOLIO_QA_URL||'http://127.0.0.1:4173';
const executablePath=process.env.CHROME_PATH||join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executablePath)?{executablePath}:{channel:'chrome'}),headless:true,args:['--enable-unsafe-swiftshader']});
const files=['leberch-celestial-590364.mp3','leberch-space-587944.mp3','solarflex-space-541545.mp3','universfield-ambient-space-background-30s-342767.mp3'];
const errors=[];
const values=page=>page.locator('[data-music-deck]').evaluateAll(nodes=>nodes.map(node=>({track:node.dataset.track,paused:node.paused,volume:node.volume,muted:node.muted,time:node.currentTime,ready:node.readyState})));
const active=page=>page.locator('#portfolio-background-music');
async function ready(page){await page.waitForFunction(()=>document.documentElement.dataset.navigationState==='idle');}
async function openSettings(page){if(!await page.locator('#site-settings').evaluate(node=>node.open))await page.locator('.settings-launch').click();}
async function closeSettings(page){if(await page.locator('#site-settings').evaluate(node=>node.open))await page.keyboard.press('Escape');}
async function settle(page){await page.waitForFunction(()=>document.querySelector('#portfolio-music-player').dataset.crossfading==='false'&&document.querySelector('#portfolio-music-player').dataset.musicState==='playing'&&Math.abs(document.querySelector('#portfolio-background-music').volume-.1)<.00001);}
async function configure(context,{mock=false}={}){
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Disabled during music QA.'}}));
  await context.addInitScript(()=>localStorage.setItem('evan-portfolio-settings-v1',JSON.stringify({version:1,palette:'silver',color:'#b8c4cd',musicEnabled:true,volume:.1,muted:true,track:'leberch-celestial-590364.mp3',positions:{}})));
  if(mock)await context.addInitScript(()=>{
    const states=new WeakMap();window.__musicFailures={};
    const state=node=>{if(!states.has(node))states.set(node,{paused:true,time:0});return states.get(node);};
    Object.defineProperty(HTMLMediaElement.prototype,'paused',{configurable:true,get(){return state(this).paused;}});
    Object.defineProperty(HTMLMediaElement.prototype,'duration',{configurable:true,get(){return 100;}});
    Object.defineProperty(HTMLMediaElement.prototype,'readyState',{configurable:true,get(){return 4;}});
    Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{configurable:true,get(){return state(this).time;},set(value){state(this).time=value;this.dispatchEvent(new Event('timeupdate'));}});
    HTMLMediaElement.prototype.load=function(){queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));};
    HTMLMediaElement.prototype.play=function(){if(window.__musicFailures[this.dataset.track])return Promise.reject(new DOMException('Unavailable','NotAllowedError'));state(this).paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve();};
    HTMLMediaElement.prototype.pause=function(){state(this).paused=true;this.dispatchEvent(new Event('pause'));};
  });
}
try{
  const context=await browser.newContext({viewport:{width:1000,height:780},reducedMotion:'reduce'});await configure(context,{mock:true});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await ready(page);await settle(page);await openSettings(page);
  assert.equal(await page.locator('[data-music-deck]').count(),2);
  await page.evaluate(()=>{window.__musicHost=document.querySelector('#portfolio-music-player');window.__musicDecks=[...document.querySelectorAll('[data-music-deck]')];});
  await page.locator('#settings-track').selectOption(files[1]);await page.waitForFunction(()=>document.querySelector('#portfolio-music-player').dataset.crossfading==='true');
  await page.waitForTimeout(1500);const middle=await values(page);assert.ok(middle.every(deck=>!deck.paused&&deck.volume>.03&&deck.volume<.095));assert.ok(Math.abs(middle.reduce((sum,deck)=>sum+deck.volume**2,0)-.01)<.0001);
  await closeSettings(page);await page.locator('.desktop-nav a[href="/about.html"]').click();await ready(page);
  assert.equal(await page.evaluate(()=>document.querySelector('#portfolio-music-player')===window.__musicHost&&[...document.querySelectorAll('[data-music-deck]')].every((node,index)=>node===window.__musicDecks[index])),true);
  await settle(page);assert.equal((await values(page)).filter(deck=>!deck.paused).length,1);
  await active(page).evaluate(audio=>{audio.currentTime=98;});await page.waitForFunction(()=>document.querySelector('#portfolio-music-player').dataset.crossfading==='true');
  await openSettings(page);await page.locator('#settings-play').click();await expect(page.locator('#settings-play')).toHaveText('Play');await page.locator('#settings-play').click();await settle(page);
  assert.equal((await values(page)).filter(deck=>!deck.paused).length,1,'quick pause/resume retires the old deck');
  await page.evaluate(file=>{window.__musicFailures[file]=true;},files[3]);const before=await active(page).getAttribute('data-track');
  await page.locator('#settings-track').selectOption(files[3]);await page.waitForFunction(()=>document.querySelector('#settings-music-status').textContent.includes('current track is still playing'));
  assert.equal(await active(page).getAttribute('data-track'),before);assert.equal(await active(page).evaluate(audio=>audio.paused),false);
  await page.locator('#settings-play').click();await page.waitForFunction(()=>[...document.querySelectorAll('[data-music-deck]')].every(node=>node.paused));
  await page.locator('#settings-track').selectOption(files[0]);assert.equal(await active(page).evaluate(audio=>audio.paused),true);await context.close();

  // Real muted MP3s exercise decode/readiness, not only synthetic media events.
  const real=await browser.newContext({viewport:{width:1280,height:850},reducedMotion:'reduce'});await configure(real);
  const realPage=await real.newPage();realPage.on('pageerror',error=>errors.push(error.message));await realPage.goto(base);await ready(realPage);await openSettings(realPage);
  await realPage.waitForFunction(()=>{const a=document.querySelector('#portfolio-background-music');return a&&!a.paused&&a.readyState>=2&&a.currentTime>.15;});await settle(realPage);
  await realPage.evaluate(()=>{window.__realMusicHost=document.querySelector('#portfolio-music-player');window.__realMusicDecks=[...document.querySelectorAll('[data-music-deck]')];});
  await realPage.locator('#settings-track').selectOption(files[1]);
  await realPage.waitForFunction(()=>document.querySelector('#portfolio-music-player').dataset.crossfading==='true'&&[...document.querySelectorAll('[data-music-deck]')].every(node=>!node.paused&&node.readyState>=2&&node.volume>.005));
  const realBefore=await values(realPage);await realPage.waitForTimeout(180);const realAfter=await values(realPage);
  assert.ok(realAfter.every((deck,index)=>deck.time>realBefore[index].time),'both real songs decode and advance during overlap');assert.ok(realAfter.every(deck=>deck.muted&&deck.volume>0&&deck.volume<.1));
  await closeSettings(realPage);await realPage.locator('.desktop-nav a[href="/about.html"]').click();await ready(realPage);
  assert.equal(await realPage.evaluate(()=>document.querySelector('#portfolio-music-player')===window.__realMusicHost&&[...document.querySelectorAll('[data-music-deck]')].every((node,index)=>node===window.__realMusicDecks[index])),true);
  await settle(realPage);const realDone=await values(realPage);assert.equal(realDone.filter(deck=>!deck.paused).length,1);assert.equal(await active(realPage).getAttribute('data-track'),files[1]);
  await active(realPage).evaluate(audio=>{audio.currentTime=audio.duration-3;});
  await realPage.waitForFunction(()=>document.querySelector('#portfolio-music-player').dataset.crossfading==='true'&&document.querySelector('#portfolio-background-music').dataset.track==='solarflex-space-541545.mp3');
  assert.ok((await values(realPage)).every(deck=>deck.muted&&!deck.paused),'near-end natural transition overlaps real decoded songs');
  await settle(realPage);assert.equal((await values(realPage)).filter(deck=>!deck.paused).length,1);
  const completedPosition=await realPage.evaluate(file=>{
    const retired=[...document.querySelectorAll('[data-music-deck]')].find(node=>node.dataset.track===file);
    retired.dispatchEvent(new Event('timeupdate'));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return JSON.parse(localStorage.getItem('evan-portfolio-settings-v1')).positions[file];
  },files[1]);
  assert.equal(completedPosition,0,'a queued retired-deck update cannot restore the completed song position');
  await real.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,simulated:'manual equal-power overlap, navigation, natural advance, rapid pause/resume, blocked incoming fallback, paused selection',real:'two muted MP3s decode and advance during manual overlap, survive navigation, finish cleanly and naturally advance near the end',pageErrors:errors}));
}finally{await browser.close();}
