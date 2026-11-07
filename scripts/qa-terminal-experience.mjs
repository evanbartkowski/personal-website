import assert from 'node:assert/strict';
import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

const origin = (process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({...(existsSync(executablePath) ? {executablePath} : {channel: 'chrome'}), headless: true, args: ['--enable-unsafe-swiftshader']});
const errors = []; let paidRequests = 0;
mkdirSync('.artifacts', {recursive: true});
async function prepare(context) {
  await context.route('**/api/**', route => route.fulfill({status: 503, json: {error: 'Disabled during terminal QA.', trackingDisabled: true, recorded: false}}));
  await context.route('**/api/chat/status', route => route.fulfill({json: {available: false}}));
  await context.route('**/api/chat', route => {paidRequests++; return route.abort();});
  await context.route('**/api/visitors', route => route.fulfill({json: {points: [], totalVisits: 0, current: null, trackingDisabled: true, recorded: false}}));
  await context.route('**/api/arcade', route => {
    const data = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    return route.fulfill({json: data?.action === 'start' ? {highScore: 19, runId: 'terminal-qa-flight', seed: 1, expiresAt: Date.now() + 900000, step: 1 / 120, maxSteps: 108000} : data?.action === 'finish' ? {highScore: 19, verifiedScore: data.score, record: false} : {highScore: 19}});
  });
  await context.addInitScript(() => {
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (...args) {
      if (this.canvas.classList.contains('terminal-sky')) this.canvas.__qaMeteorStrokes = (this.canvas.__qaMeteorStrokes || 0) + 1;
      return stroke.apply(this, args);
    };
  });
}
async function ready(page) {await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');}
async function command(page, value) {const input = page.locator('#terminal-input'); await input.fill(value); await input.press('Enter');}
async function openTerminal(page) {await page.locator('.terminal-launch').first().click(); await page.locator('#terminal-dialog[open]').waitFor();}
async function checkHint(page) {
  const hint = page.locator('.terminal-game-hint');
  assert.equal(await hint.count(), 1); assert.match(await hint.innerText(), /flappy.*Flappy Orbit.*pong.*Pong/s);
  for (const name of ['Play Flappy Orbit', 'Play Pong']) {
    const button = hint.getByRole('button', {name, exact:true});
    assert.equal(await button.isVisible(), true, `${name} is visible on terminal startup`);
    assert.ok((await button.boundingBox()).height >= 44, 'Game menu has usable touch targets');
  }
  assert.doesNotMatch(await page.locator('#terminal-output').textContent(), /Asteroid Run/i);
  assert.equal(await hint.evaluate(node => node.previousElementSibling.textContent.trim().endsWith('Type help for commands.')), true);
}
async function game(page) {return page.locator('.terminal-game-panel').evaluate(node => ({mode: node.dataset.game, status: node.dataset.outcome, frames: Number(node.dataset.frames), y: Number(node.dataset.birdY), paddle: Number(node.dataset.paddleY), score: node.dataset.score}));}
async function status(page, state) {await page.waitForFunction(value => document.querySelector('.terminal-game-panel')?.dataset.outcome === value, state);}
async function scene(page) {return page.locator('#terminal-dialog').evaluate(dialog => ({state: dialog.dataset.terminalSkyState, frames: Number(dialog.dataset.terminalSkyFrames || 0), strokes: dialog.querySelector('.terminal-sky')?.__qaMeteorStrokes || 0, pixels: dialog.querySelector('.terminal-sky')?.toDataURL()}));}
async function start(page) {await page.locator('.arcade-overlay [data-arcade-action="start"]').click(); await status(page, 'running');}
async function exitToShell(page, throughCommand = false) {
  const retired = await page.locator('.terminal-game-panel').evaluate(node => {
    window.__retiredArcades ||= [];
    window.__retiredArcades.push(node);
    return {index: window.__retiredArcades.length - 1};
  });
  if (throughCommand) await command(page, 'quit');
  else await page.locator('[data-arcade-action="shell"]').click();
  await page.waitForFunction(() => !document.querySelector('.terminal-game-panel') && document.querySelector('#terminal-dialog').dataset.gameState === 'quit');
  assert.equal(await page.locator('#terminal-dialog').evaluate(node => node.open), true, 'Leaving a game keeps the shell open');
  assert.equal(await page.locator('#terminal-input').evaluate(node => document.activeElement === node), true, 'Leaving a game restores shell focus');
  assert.match(await page.locator('#terminal-output > div').last().innerText(), /Arcade closed/);
  const finalFrames = await page.evaluate(index => window.__retiredArcades[index].dataset.frames, retired.index);
  await page.waitForTimeout(100);
  const stopped = await page.evaluate(index => {
    const node = window.__retiredArcades[index];
    return {connected: node.isConnected, status: node.dataset.outcome, frames: node.dataset.frames};
  }, retired.index);
  assert.deepEqual(stopped, {connected: false, status: 'disposed', frames: finalFrames}, 'The exited game is detached, disposed, and no longer advances');
}

try {
  const context = await browser.newContext({viewport: {width: 1360, height: 920}}); await prepare(context);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, {waitUntil: 'load'}); await ready(page);
  assert.equal(await page.locator('.lab-disclosure').count(), 0, 'the home terminal no longer uses an AI accordion');
  const homeTerminal = page.locator('main .terminal-launch');
  assert.equal((await homeTerminal.innerText()).replace(/[>_↗\s]/g,''), 'Terminal');
  await homeTerminal.focus(); await page.keyboard.press('Enter');
  await page.locator('#terminal-dialog[open]').waitFor();
  assert.equal(await page.locator('#portrait-conversation').isVisible(), false, 'the home Terminal control opens only the shell');
  await page.keyboard.press('Escape');
  await openTerminal(page); await checkHint(page);
  await page.waitForFunction(() => document.querySelector('#terminal-dialog').dataset.terminalSkyState === 'running' && Number(document.querySelector('#terminal-dialog').dataset.terminalSkyFrames) > 1);
  const moving = await scene(page); await page.waitForTimeout(220); const advanced = await scene(page);
  assert.ok(advanced.frames > moving.frames && advanced.strokes > moving.strokes); assert.notEqual(advanced.pixels, moving.pixels);

  await page.locator('.terminal-game-hint button').first().click(); await status(page, 'ready');
  assert.equal((await game(page)).mode, 'flappy');
  const idle = await game(page); await page.waitForTimeout(120); assert.deepEqual(await game(page), idle, 'The menu has no animation loop');
  await start(page);
  const arena = page.locator('.terminal-game-canvas');
  assert.equal(await arena.evaluate(node => document.activeElement === node), true);
  await page.waitForTimeout(160); const falling = await game(page); assert.ok(falling.y > idle.y + 4, 'Gravity moves the actual bird');
  await page.keyboard.press('Space'); await page.waitForTimeout(150); assert.ok((await game(page)).y < falling.y - 15, 'Space flaps upward');
  await page.keyboard.press('p'); await status(page, 'paused'); const paused = await game(page);
  await page.waitForTimeout(180); assert.deepEqual(await game(page), paused, 'Pause stops both simulation and painting');
  await page.locator('[data-arcade-action="pause"]').click(); await status(page, 'running');
  await status(page, 'over');
  assert.match(await page.locator('.arcade-overlay').innerText(), /One more orbit/);
  await start(page); assert.equal((await game(page)).score, '0:0');
  await page.locator('[data-arcade-action="restart"]').click(); await status(page, 'ready');
  assert.equal((await game(page)).y, 170);
  await start(page); await exitToShell(page);
  await command(page, 'game'); await status(page, 'ready');
  assert.equal((await game(page)).score, '0:0');
  assert.equal((await game(page)).y, 170, 'An exited flight starts fresh instead of resuming');
  assert.equal(await page.locator('.terminal-game-panel').count(), 1);
  await exitToShell(page);
  await command(page, 'mkdir -p terminal-game-qa'); await command(page, 'echo "<img src=x onerror=unsafe()>" > terminal-game-qa/check.txt');
  await command(page, 'pwd'); assert.equal(await page.locator('#terminal-output > div').last().innerText(), '/home/visitor');
  await command(page, 'cat terminal-game-qa/check.txt'); assert.equal(await page.locator('#terminal-output > div').last().innerText(), '<img src=x onerror=unsafe()>\n');
  assert.equal(await page.locator('#terminal-output img').count(), 0);
  await command(page, 'help game'); assert.match(await page.locator('#terminal-output > div').last().innerText(), /FLAPPY ORBIT[\s\S]*PONG[\s\S]*First to five/);
  await command(page, 'help'); assert.doesNotMatch(await page.locator('#terminal-output > div').last().innerText(), /\b(?:nano|rm|rmdir|touch|mkdir|echo|cp|mv|sudo|su|head|tail|wc|grep|find|tree|sort|printf)\b/);

  await command(page, 'play');
  await page.locator('[data-terminal-game="pong"]').click();
  await status(page, 'ready'); await start(page);
  const paddle = (await game(page)).paddle;
  await page.keyboard.down('w'); await page.waitForTimeout(170); await page.keyboard.up('w');
  assert.ok((await game(page)).paddle < paddle - 30, 'W moves the player paddle');
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(200); await page.keyboard.up('ArrowDown');
  assert.ok((await game(page)).paddle > paddle - 20, 'ArrowDown moves the player paddle');
  const bounds = await arena.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height * .8); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  assert.ok((await game(page)).paddle > 220, 'Pointer position controls the Pong paddle');
  await page.locator('[data-arcade-action="pause"]').click(); await status(page, 'paused');
  await page.screenshot({path: '.artifacts/terminal-arcade-desktop.png'});
  await exitToShell(page);
  await command(page, 'pong'); await status(page, 'ready');
  assert.equal((await game(page)).score, '0:0');
  assert.equal((await game(page)).paddle, paddle, 'An exited match resets paddle position');
  assert.equal(await page.locator('.terminal-game-panel').count(), 1);
  await start(page);
  await page.evaluate(() => {Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange'));});
  await status(page, 'paused'); const hidden = await game(page); const hiddenSky = await scene(page);
  await page.waitForTimeout(180); assert.deepEqual(await game(page), hidden); assert.deepEqual(await scene(page), hiddenSky);
  await page.evaluate(() => {delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));});
  await start(page);
  await page.evaluate(() => {const spacer = document.createElement('div'); spacer.id = 'qa-offscreen-spacer'; spacer.style.height = '900px'; document.querySelector('.terminal-game-panel').before(spacer); document.querySelector('#terminal-output').scrollTop = 0;});
  await status(page, 'paused'); const offscreen = await game(page); await page.waitForTimeout(150); assert.deepEqual(await game(page), offscreen);
  await page.evaluate(() => {document.querySelector('#qa-offscreen-spacer').remove(); document.querySelector('.terminal-game-panel').scrollIntoView({block: 'end'});});
  await command(page, 'game'); assert.equal((await game(page)).mode, 'pong'); await start(page);
  await command(page, 'exit'); await page.waitForFunction(() => !document.querySelector('#terminal-dialog').open);
  const closed = await game(page); const closedSky = await scene(page); await page.waitForTimeout(160);
  assert.deepEqual(await game(page), closed); assert.deepEqual(await scene(page), closedSky);
  await openTerminal(page); await command(page, 'game'); assert.equal((await game(page)).mode, 'pong');
  await exitToShell(page, true);
  await command(page, 'clear'); assert.equal(await page.locator('#terminal-output').innerText(), '');
  await command(page, 'game'); await status(page, 'ready'); assert.equal(await page.locator('.terminal-game-panel').count(), 1);
  await page.evaluate(() => {window.__oldTerminal = document.querySelector('#terminal-dialog'); window.__oldGame = document.querySelector('.terminal-game-panel');});
  await page.keyboard.press('Escape'); await page.locator('.desktop-nav a[href="/about.html"]').click(); await ready(page);
  assert.equal(await page.evaluate(() => window.__oldGame.isConnected), false);
  assert.equal(await page.evaluate(() => window.__oldGame.dataset.outcome), 'disposed');
  assert.equal(await page.evaluate(() => window.__oldTerminal.dataset.terminalSkyState), 'disposed');
  const disposedFrames = await page.evaluate(() => window.__oldGame.dataset.frames); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__oldGame.dataset.frames), disposedFrames);
  await openTerminal(page); await checkHint(page); await command(page, 'cat terminal-game-qa/check.txt');
  assert.equal(await page.locator('#terminal-output > div').last().innerText(), '<img src=x onerror=unsafe()>\n'); await context.close();

  const mobile = await browser.newContext({viewport: {width: 320, height: 740}, reducedMotion: 'reduce', hasTouch: true}); await prepare(mobile);
  const phone = await mobile.newPage(); phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(origin, {waitUntil: 'load'}); await ready(phone); await openTerminal(phone); await checkHint(phone);
  await phone.waitForFunction(() => document.querySelector('#terminal-dialog').dataset.terminalSkyState === 'still');
  const still = await scene(phone); await phone.waitForTimeout(160); assert.deepEqual(await scene(phone), still);
  await command(phone, 'flappy'); await start(phone);
  await phone.locator('.terminal-game-canvas').tap(); await phone.waitForTimeout(100);
  assert.ok((await game(phone)).y < 170, 'Touch flaps even with reduced-motion preferences after explicit start');
  await exitToShell(phone);
  await command(phone, 'game'); await status(phone, 'ready');
  assert.equal((await game(phone)).y, 170);
  assert.equal((await game(phone)).score, '0:0');
  await exitToShell(phone);
  await command(phone, 'pong'); await start(phone);
  const upButton = phone.locator('[data-arcade-hold="-1"]'); const upBounds = await upButton.boundingBox();
  await phone.mouse.move(upBounds.x + upBounds.width / 2, upBounds.y + upBounds.height / 2); await phone.mouse.down(); await phone.waitForTimeout(160); await phone.mouse.up();
  assert.ok((await game(phone)).paddle < 120, 'Phone arrow control moves the paddle');
  await phone.locator('[data-arcade-action="pause"]').click(); await status(phone, 'paused');
  for (const selector of ['#terminal-dialog', '#terminal-output', '.terminal-game-panel', '.arcade-arena']) assert.equal(await phone.locator(selector).evaluate(node => node.scrollWidth <= node.clientWidth), true, `320px layout fits ${selector}`);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const button of await phone.locator('.terminal-game-controls button:visible').all()) {const box = await button.boundingBox(); assert.ok(box.width >= 30 && box.height >= 32 && box.x >= 0 && box.x + box.width <= 320);}
  await phone.screenshot({path: '.artifacts/terminal-arcade-mobile.png'});
  await exitToShell(phone);
  await command(phone, 'pong'); await status(phone, 'ready');
  assert.equal((await game(phone)).score, '0:0');
  assert.equal(await phone.locator('.terminal-game-panel').count(), 1);
  await start(phone); await exitToShell(phone, true);
  await command(phone, 'pwd');
  assert.equal(await phone.locator('#terminal-output > div').last().innerText(), '/home/visitor');
  await mobile.close();
  assert.equal(paidRequests, 0); assert.deepEqual(errors, []);
  console.log(JSON.stringify({result: 'passed', games: 'Flappy gravity/flap/collision/retry, Pong keyboard/pointer/phone controls, pause/resume/quit and clear', shell: 'Back to shell and quit dispose both games, restore focus, and reopen fresh on desktop/phone; Linux commands and files remain usable', lifecycle: 'idle/closed/hidden/offscreen freeze, reduced-motion menu, soft-navigation disposal', visuals: 'actual meteor canvas strokes and pixels', layout: 'direct Terminal action and usable 320px canvas controls', paidAIRequests: paidRequests, pageErrors: errors}));
} finally {await browser.close();}
