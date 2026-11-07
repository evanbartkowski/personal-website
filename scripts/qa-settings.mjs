import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const origin = process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
const errors = [];
function mockMedia() {
  const states = new WeakMap();
  const state = element => {if (!states.has(element)) states.set(element, {paused: true, time: 0}); return states.get(element);};
  window.__settingsMediaCalls = 0;
  window.__settingsPlayPreferences = [];
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {configurable: true, get() {return state(this).paused;}});
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {configurable: true, get() {return 300;}});
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {configurable: true, get() {return 4;}});
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {configurable: true, get() {return state(this).time;}, set(value) {state(this).time = value; this.dispatchEvent(new Event('timeupdate'));}});
  HTMLMediaElement.prototype.play = function() {window.__settingsMediaCalls++;window.__settingsPlayPreferences.push({volume:this.volume,muted:this.muted}); state(this).paused = false; this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')); return Promise.resolve();};
  HTMLMediaElement.prototype.pause = function() {state(this).paused = true; this.dispatchEvent(new Event('pause'));};
  HTMLMediaElement.prototype.load = function() {state(this).paused = true; queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));};
}
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 850}, reducedMotion: 'reduce'});
  await context.addInitScript(mockMedia);
  const source = process.env.SETTINGS_QA_SOURCE === '1' ? await readFile('settings.js','utf8') : null;
  const serveSettings = async context => {
    await context.route('**/api/**', route => route.fulfill({status:503,json:{error:'Disabled during settings QA.'}}));
    if(source){await context.route('**/settings.js*',route=>route.fulfill({contentType:'text/javascript',body:source}));await context.route('**/music-player.js*',async route=>route.fulfill({contentType:'text/javascript',body:await readFile('music-player.js','utf8')}));}
  };
  await serveSettings(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.locator('.settings-launch').waitFor();
  assert.equal(await page.locator('.settings-launch').count(), 1);
  assert.equal(await page.evaluate(() => window.__settingsMediaCalls), 1,'an allowed fresh visit attempts playback before any gesture');
  assert.deepEqual(await page.evaluate(()=>window.__settingsPlayPreferences),[{volume:0,muted:false}],'quiet volume is applied before autoplay starts');
  await page.waitForFunction(()=>Math.abs(document.querySelector('#portfolio-background-music').volume-.1)<.00001);
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.volume), .1);
  assert.equal(await page.locator('#header-mute').count(), 1);
  await page.locator('#header-mute').click();
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.muted), true);
  assert.equal(await page.locator('#header-mute').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#settings-mute').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#site-settings').evaluate(dialog => dialog.open), false, 'quick mute does not open settings');
  assert.equal(await page.evaluate(() => window.__settingsMediaCalls), 1, 'quick mute does not start another play request');
  await page.locator('#header-mute').click();
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.muted), false);
  assert.equal(await page.locator('#settings-mute').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => window.__settingsMediaCalls), 1);
  const originalColor = await page.locator('body').evaluate(body => getComputedStyle(body).color);
  assert.equal(originalColor, 'rgb(184, 196, 205)', 'A fresh visit defaults to Silver');
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).getPropertyValue('--green').trim()), '#849bab');
  assert.equal(await page.locator('input[name="settings-palette"][value="silver"]').isChecked(), true);
  const geometryColors = () => page.evaluate(() => {
    const color = (selector, property) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node)[property] : '';
    };
    return {
      gear: color('.settings-launch', 'color'), gearBorder: color('.settings-launch', 'borderTopColor'),
      headerLine: color('.site-header', 'borderBottomColor'), panelLine: color('.lab-panel', 'borderTopColor') || color('.lab-section', 'borderTopColor'),
      actionFill: color('.button-primary', 'backgroundColor'), muteIcon: color('#header-mute', 'color'),
      dialogLine: color('#site-settings', 'borderTopColor'), dialogFill: color('#site-settings', 'backgroundColor'),
    };
  });
  const initialGeometry = await geometryColors();
  assert.equal(await page.locator('.header-actions').evaluate(actions => actions.lastElementChild.classList.contains('settings-launch')), true, 'gear is the last, rightmost header control');
  assert.equal(await page.locator('.settings-launch').evaluate(button => button.getBoundingClientRect().left > innerWidth * .75), true, 'gear occupies the top right');
  await page.locator('.settings-launch').click();
  await page.locator('#site-settings[open]').waitFor();
  for (const [palette, hex, rgb] of [['default','#2cd00b','rgb(44, 208, 11)'], ['amber','#d18b29','rgb(209, 139, 41)'], ['lavender','#af4dff','rgb(175, 77, 255)']]) {
    await page.locator(`input[name="settings-palette"][value="${palette}"]`).check();
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).color), rgb, `${palette} text uses the requested color`);
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).getPropertyValue('--green').trim()), hex, `${palette} geometry shares the requested color`);
  }
  await page.locator('#settings-reset-color').click();
  assert.equal(await page.locator('input[name="settings-palette"][value="silver"]').isChecked(), true, 'Reset selects Silver');
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).color), originalColor);
  assert.equal(await page.evaluate(() => window.__settingsMediaCalls), 1);
  assert.match(await page.locator('#settings-music-status').innerText(), /^Playing.*10% volume/);
  await page.locator('input[name="settings-palette"][value="mint"]').check();
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).color), 'rgb(166, 200, 184)');
  const actionContrast = await page.locator('.button-primary').first().evaluate(button => {
    const style = getComputedStyle(button), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    const luminance = color => {context.fillStyle = color; context.fillRect(0, 0, 1, 1); const values = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];};
    const a = luminance(style.color), b = luminance(style.backgroundColor); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  assert.ok(actionContrast >= 4.5, 'filled action text remains readable in another palette');
  const mintGeometry = await geometryColors();
  for (const key of Object.keys(initialGeometry)) assert.notEqual(mintGeometry[key], initialGeometry[key], key + ' follows the selected palette');
  await page.locator('#settings-color-hex').fill('#b3a5cc');
  await page.locator('#settings-color-hex').press('Tab');
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).color), 'rgb(179, 165, 204)');
  await page.locator('#settings-color-hex').fill('invalid');
  await page.locator('#settings-color-hex').press('Tab');
  assert.equal(await page.locator('#settings-color-hex').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).color), 'rgb(179, 165, 204)');
  await page.locator('#settings-color-hex').fill('#000000');
  await page.locator('#settings-color-hex').press('Tab');
  assert.match(await page.locator('#settings-color-note').innerText(), /dark tone/);
  assert.notEqual(await page.locator('#settings-reset-color').evaluate(button => getComputedStyle(button).color), 'rgb(0, 0, 0)', 'reset remains readable with a black custom color');
  await page.locator('#settings-reset-color').click();
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).color), originalColor);
  await page.locator('input[name="settings-palette"][value="amber"]').check();
  await page.locator('#settings-volume').evaluate(input => {input.value = '23'; input.dispatchEvent(new Event('input', {bubbles: true}));});
  await page.waitForFunction(()=>Math.abs(document.querySelector('#portfolio-background-music').volume-.23)<.00001);
  await page.waitForFunction(()=>Math.abs(document.querySelector('#portfolio-background-music').volume-.23)<.00001);
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.volume), .23);
  assert.equal(await page.locator('#settings-volume-label').innerText(), '23%');
  await page.locator('#settings-mute').click();
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.muted), true);
  assert.equal(await page.locator('#header-mute').getAttribute('aria-pressed'), 'true', 'dialog and quick mute stay synchronized');
  assert.match(await page.locator('#settings-music-status').innerText(), /muted/);
  await page.locator('#settings-play').click();
  assert.equal(await page.locator('#settings-music-status').innerText(), 'Paused');
  await page.locator('#settings-track').selectOption('leberch-space-587944.mp3');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-music-deck]')].every(audio=>audio.paused));
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.paused), true);
  await page.locator('#settings-play').click();
  await page.locator('#portfolio-background-music').evaluate(audio => {audio.currentTime = 42.5;});
  await page.goto(origin + '/experience.html');
  await page.locator('.settings-launch').waitFor();
  assert.equal(await page.evaluate(() => window.__settingsMediaCalls), 1);
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).color), 'rgb(209, 139, 41)');
  await page.waitForFunction(()=>Math.abs(document.querySelector('#portfolio-background-music').volume-.23)<.00001);
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.volume), .23);
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.muted), true);
  assert.equal(await page.locator('#header-mute').getAttribute('aria-pressed'), 'true', 'quick mute preference survives reload');
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.currentTime), 42.5);
  assert.deepEqual(await page.evaluate(()=>window.__settingsPlayPreferences),[{volume:0,muted:true}],'saved mute and volume are applied before a new document autoplays');
  assert.match(await page.locator('#settings-music-status').innerText(), /Playing.*muted/);
  await page.locator('.settings-launch').click();
  assert.match(await page.locator('#settings-music-status').innerText(), /Playing.*muted/);
  await page.locator('#portfolio-background-music').evaluate(audio => audio.dispatchEvent(new Event('ended')));
  await page.waitForFunction(()=>document.querySelector('#settings-track').value==='solarflex-space-541545.mp3');
  assert.equal(await page.locator('#settings-track').inputValue(), 'solarflex-space-541545.mp3');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#site-settings').evaluate(dialog => dialog.open), false);
  assert.equal(await page.locator('.settings-launch').evaluate(button => document.activeElement === button), true);
  await page.goto(origin + '/blog.html');
  await page.locator('.settings-launch').waitFor();
  assert.equal(await page.locator('.settings-launch').count(), 1);
  await page.locator('.settings-launch').click();
  assert.equal(await page.locator('#settings-track').inputValue(), 'solarflex-space-541545.mp3');
  await page.locator('#settings-play').click();
  assert.equal(await page.locator('#settings-music-status').innerText(), 'Paused');
  await page.goto(origin + '/projects.html');
  await page.locator('.settings-launch').click();
  assert.equal(await page.locator('#settings-music-status').innerText(), 'Paused');
  assert.equal(await page.evaluate(() => window.__settingsMediaCalls), 0);
  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: 780});
    assert.equal(await page.locator('#site-settings').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.settings-launch').evaluate(button => button.getBoundingClientRect().left > innerWidth * .75), true, 'mobile gear stays in the top right');
    assert.equal(await page.locator('.site-header').evaluate(header => header.scrollWidth <= header.clientWidth), true, `${width}px header overflow`);
    await page.locator('.settings-launch').click();
    assert.equal(await page.locator('.settings-close').isVisible(), true);
  }
  const blocked = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  await serveSettings(blocked);
  await blocked.addInitScript(mockMedia);
  await blocked.addInitScript(() => {Storage.prototype.getItem = () => {throw Error('Storage blocked');}; Storage.prototype.setItem = () => {throw Error('Storage blocked');};});
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', error => errors.push(error.message));
  await blockedPage.goto(origin);
  await blockedPage.locator('.settings-launch').click();
  await blockedPage.locator('input[name="settings-palette"][value="silver"]').check();
  assert.equal(await blockedPage.locator('body').evaluate(body => getComputedStyle(body).color), 'rgb(184, 196, 205)');
  assert.match(await blockedPage.locator('#settings-storage-status').innerText(), /storage is unavailable/);
  const autoplayBlocked = await browser.newContext({viewport: {width: 1280, height: 850}});
  await serveSettings(autoplayBlocked);
  await autoplayBlocked.addInitScript(mockMedia);
  await autoplayBlocked.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    window.__resumeAttempts = 0;
    HTMLMediaElement.prototype.play = function() {window.__resumeAttempts++; if (window.__resumeAttempts === 1) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError')); return original.call(this);};
  });
  const resumePage = await autoplayBlocked.newPage();
  resumePage.on('pageerror', error => errors.push(error.message));
  await resumePage.goto(origin);
  await resumePage.waitForFunction(() => document.querySelector('#settings-music-status')?.textContent.includes('Click or press a key to resume'));
  assert.equal(await resumePage.evaluate(() => window.__resumeAttempts), 1);
  await resumePage.evaluate(()=>{
    document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));
  });
  await resumePage.keyboard.press('Escape');
  assert.equal(await resumePage.evaluate(()=>window.__resumeAttempts),1,'synthetic events and Escape cannot trigger a blocked autoplay retry');
  await resumePage.locator('#header-mute').click();
  assert.equal(await resumePage.evaluate(()=>window.__resumeAttempts),1,'the first trusted mute gesture does not trigger an audible start');
  assert.equal(await resumePage.locator('#portfolio-background-music').evaluate(audio=>audio.muted),true);
  assert.equal(await resumePage.locator('#portfolio-background-music').evaluate(audio=>audio.paused),true);
  await resumePage.locator('.settings-launch').click();
  assert.match(await resumePage.locator('#settings-music-status').innerText(), /^Playing/);
  assert.equal(await resumePage.evaluate(() => window.__resumeAttempts), 2);
  assert.deepEqual(await resumePage.evaluate(()=>window.__settingsPlayPreferences),[{volume:0,muted:true}],'the trusted retry respects the newly saved mute and quiet volume');
  await resumePage.locator('#settings-play').click();
  await resumePage.keyboard.press('Escape');
  const pausedAttempts=await resumePage.evaluate(()=>window.__resumeAttempts);
  await resumePage.locator('.settings-launch').click();
  assert.equal(await resumePage.evaluate(()=>window.__resumeAttempts),pausedAttempts,'ordinary gestures do not override an explicit pause');
  await resumePage.keyboard.press('Escape');
  await resumePage.reload();
  await resumePage.locator('.settings-launch').waitFor();
  assert.equal(await resumePage.evaluate(()=>window.__resumeAttempts),0,'saved pause prevents autoplay on a fresh document');

  for (const [palette, color, expected] of [
    ['silver','#b8c4cd','rgb(184, 196, 205)'],
    ['default','#7b9d60','rgb(44, 208, 11)'],
    ['amber','#b79455','rgb(209, 139, 41)'],
    ['lavender','#a18ac2','rgb(175, 77, 255)'],
    ['custom','#5ba1ce','rgb(91, 161, 206)'],
  ]) {
    const savedContext = await browser.newContext({viewport:{width:1000,height:780},reducedMotion:'reduce'});
    await serveSettings(savedContext);
    await savedContext.addInitScript(mockMedia);
    await savedContext.addInitScript(({palette,color}) => {
      localStorage.setItem('evan-portfolio-settings-v1',JSON.stringify({version:1,palette,color,musicEnabled:false,volume:.1,muted:false,track:'leberch-celestial-590364.mp3',positions:{}}));
    },{palette,color});
    const savedPage = await savedContext.newPage();
    savedPage.on('pageerror',error=>errors.push(error.message));
    await savedPage.goto(origin);
    await savedPage.locator('.settings-launch').waitFor();
    assert.equal(await savedPage.locator('body').evaluate(body=>getComputedStyle(body).color),expected,`${palette} saved preference uses the current preset or retains its custom color`);
    assert.equal(await savedPage.evaluate(()=>window.__settingsMediaCalls),0,'color migration preserves an explicit music pause');
    await savedContext.close();
  }

  const real = await browser.newContext({viewport:{width:1280,height:850},reducedMotion:'reduce'});
  await serveSettings(real);
  await real.addInitScript(()=>{
    localStorage.setItem('evan-portfolio-settings-v1',JSON.stringify({version:1,palette:'default',color:'#2cd00b',musicEnabled:true,volume:.07,muted:true,track:'leberch-celestial-590364.mp3',positions:{}}));
  });
  const realPage=await real.newPage(),musicResponses=[];
  realPage.on('pageerror',error=>errors.push(error.message));
  realPage.on('response',response=>{if(response.url().includes('/assets/music/')&&/\.mp3(?:\?|$)/.test(response.url()))musicResponses.push({status:response.status(),type:response.headers()['content-type']});});
  await realPage.goto(origin);
  await realPage.waitForFunction(()=>{const audio=document.querySelector('#portfolio-background-music');return audio&&(!audio.paused||document.querySelector('#settings-music-status').textContent.includes('Click or press a key'));});
  const realAutoplayPolicy=await realPage.locator('#portfolio-background-music').evaluate(audio=>audio.paused?'gesture-required':'allowed');
  if(realAutoplayPolicy==='gesture-required'){
    await realPage.locator('.settings-launch').click();
    await realPage.keyboard.press('Escape');
  }
  await realPage.waitForFunction(()=>{const audio=document.querySelector('#portfolio-background-music');return audio&&!audio.paused&&audio.readyState>=2&&audio.currentTime>.15;});
  assert.ok(musicResponses.some(response=>[200,206].includes(response.status)&&response.type?.startsWith('audio/')),'the real MP3 request returns decodable audio');
  await realPage.evaluate(()=>{window.__settingsRealAudio=document.querySelector('#portfolio-background-music');window.__settingsRealEvents=[];for(const event of ['pause','emptied','loadstart'])window.__settingsRealAudio.addEventListener(event,()=>window.__settingsRealEvents.push(event));});
  const realInitial=await realPage.locator('#portfolio-background-music').evaluate(audio=>audio.currentTime);
  await realPage.locator('.desktop-nav a[href="/about.html"]').click();
  await realPage.waitForFunction(()=>document.documentElement.dataset.navigationState==='idle'&&location.pathname==='/about.html');
  await realPage.waitForFunction(time=>document.querySelector('#portfolio-background-music').currentTime>time+.1,realInitial);
  assert.equal(await realPage.evaluate(()=>document.querySelector('#portfolio-background-music')===window.__settingsRealAudio),true,'real playback retains the same player during navigation');
  assert.deepEqual(await realPage.evaluate(()=>window.__settingsRealEvents),[],'page changes never pause, empty or reload the real player');
  await realPage.waitForFunction(()=>document.querySelector('#portfolio-background-music').volume===.07);
  assert.deepEqual(await realPage.locator('#portfolio-background-music').evaluate(audio=>({muted:audio.muted,volume:audio.volume})),{muted:true,volume:.07});
  await real.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({result: 'passed',sourceOverride:!!source, palette: 'text, gear, lines, shapes, fills, controls, custom hex, dark-color recovery, reset, persistence', music: '10% fresh autoplay, saved volume/mute before play, pause/play, track selection and advance, position, pause persistence, blocked autoplay retries only on eligible trusted gestures', accessibility: 'native dialog, Escape, focus return, 320px/390px layouts', pages: 'home, experience, projects, blog', storage: 'blocked storage remains usable', media: 'mocked control checks plus real muted MP3 decoding and uninterrupted player identity on navigation',realAutoplayPolicy,musicResponses,pageErrors: errors}));
} finally {
  await browser.close();
}
