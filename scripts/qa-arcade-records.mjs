import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium, expect} from '@playwright/test';
import {createArcadeState, arcadeAction, stepArcade, createArcadeRandom, ARCADE_STEP} from '../arcade-model.js';

const base = (process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({...(existsSync(executablePath) ? {executablePath} : {channel: 'chrome'}), headless: true, args: ['--enable-unsafe-swiftshader']});
let highScore = 0, starts = 0, finishes = 0;
const sessions = new Map(), errors = [], replayFailures = [];

async function prepare(context, {offline = false, hold = false} = {}) {
  let release;
  const gate = hold ? new Promise(resolve => {release = resolve;}) : Promise.resolve();
  await context.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path !== '/api/arcade') return route.fulfill({status: 503, json: {error: 'Disabled during arcade QA.'}});
    if (offline) return route.fulfill({status: 503, json: {error: 'Scores unavailable.'}});
    if (request.method() === 'GET') return route.fulfill({json: {highScore, updatedAt: null}});
    const data = request.postDataJSON();
    if (data.action === 'start') {
      const runId = `qa-flight-${++starts}`, seed = starts;
      sessions.set(runId, seed);await gate;
      return route.fulfill({json: {runId, seed, highScore, expiresAt: Date.now() + 900000, step: ARCADE_STEP, maxSteps: 108000}}).catch(() => {});
    }
    if (data.action === 'finish') {
      finishes++;
      try {
        assert.ok(sessions.has(data.runId));
        assert.ok(Number.isInteger(data.steps) && data.steps > 0);
        assert.ok(data.flaps.every((value, index) => Number.isInteger(value) && value >= 0 && value < data.steps && (index === 0 || value > data.flaps[index - 1])));
        let state = arcadeAction(createArcadeState('flappy'), 'start'), flap = 0;
        const random = createArcadeRandom(sessions.get(data.runId));
        for (let step = 0; step < data.steps; step++) {
          assert.equal(state.status, 'running', 'the replay has not already ended');
          if (data.flaps[flap] === step) {state = arcadeAction(state, 'flap');flap++;}
          state = stepArcade(state, ARCADE_STEP, {}, random);
        }
        assert.equal(state.status, 'over', 'the final submitted tick ends the actual flight');
        assert.equal(state.score[0], data.score, 'the server-derived score matches the played flight');
        const record = state.score[0] > highScore;highScore = Math.max(highScore, state.score[0]);
        return route.fulfill({json: {verifiedScore: state.score[0], highScore, record}});
      } catch (error) {
        replayFailures.push(error.message);return route.fulfill({status: 400, json: {error: 'Invalid replay.'}});
      }
    }
    return route.fulfill({status: 400, json: {error: 'Invalid action.'}});
  });
  return () => release?.();
}

async function mount(page) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  await page.evaluate(async () => {
    const version = document.documentElement.dataset.buildVersion;
    const {mountTerminalArcade} = await import(`/terminal-game.js?v=${version}`);
    const dialog = document.createElement('dialog');dialog.id = 'qa-record-dialog';
    dialog.style.cssText = 'width:min(560px,calc(100vw - 20px));max-width:none;max-height:calc(100vh - 20px);padding:12px;overflow:auto;background:#03060b;color:#bac6cf;border:1px solid #34454e';
    const panel = document.createElement('section');dialog.append(panel);document.body.append(dialog);dialog.showModal();
    window.__recordPanel = panel;
    window.__recordArcade = mountTerminalArcade(panel, {dialog, onExit: () => {window.__recordArcade.dispose();panel.remove();dialog.close();}});
    window.__recordArcade.open('flappy');
  });
  await expect(page.locator('.terminal-game-panel')).toHaveAttribute('data-outcome', 'ready');
}

try {
  const first = await browser.newContext({viewport: {width: 1200, height: 900}});await prepare(first);
  const page = await first.newPage();await mount(page);
  await expect(page.locator('.arcade-record strong')).toHaveText('0');
  await page.locator('[data-arcade-action="start"]').click();
  await expect(page.locator('.terminal-game-panel')).toHaveAttribute('data-outcome', 'running');
  const deadline = Date.now() + 12000;
  let paused = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.__recordArcade.snapshot);
    if (state.status === 'over') break;
    if (state.score[0] >= 1) {await page.waitForTimeout(700);break;}
    if (!paused && state.elapsed > 1) {
      await page.locator('[data-arcade-action="pause"]').click();
      await expect(page.locator('.terminal-game-panel')).toHaveAttribute('data-outcome', 'paused');
      const steps = await page.locator('.terminal-game-panel').getAttribute('data-flight-steps');
      await page.waitForTimeout(150);assert.equal(await page.locator('.terminal-game-panel').getAttribute('data-flight-steps'), steps);
      await page.locator('[data-arcade-action="pause"]').click();paused = true;
    }
    const target = state.pipes.find(pipe => pipe.x + 56 > state.bird.x - 12)?.gapY ?? 180;
    if (state.bird.y > target + 18 && state.bird.vy > -45) await page.locator('.terminal-game-canvas').press('Space');
    await page.waitForTimeout(30);
  }
  await expect(page.locator('.terminal-game-panel')).toHaveAttribute('data-outcome', 'over');
  await expect(page.locator('.arcade-record-status')).toContainText('New all-time high');
  assert.ok(highScore >= 1, 'a legal played flight becomes a shared record');
  assert.equal(finishes, 1);assert.deepEqual(replayFailures, []);
  await expect(page.locator('.arcade-record strong')).toHaveText(String(highScore));
  await expect(page.locator('.arcade-overlay > span')).toContainText(`all-time high ${highScore}`);
  const localBest = await page.evaluate(() => localStorage.getItem('evan-flappy-best-v1'));
  assert.equal(Number(localBest), highScore, 'the device best survives leaving the game');

  const second = await browser.newContext({viewport: {width: 320, height: 800}, hasTouch: true});await prepare(second);
  const visitor = await second.newPage();await mount(visitor);
  await expect(visitor.locator('.arcade-record strong')).toHaveText(String(highScore));
  await expect(visitor.locator('.arcade-score')).toContainText('YOUR BEST 0');
  assert.equal(await visitor.locator('.terminal-game-panel').evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await visitor.locator('[data-arcade-mode="pong"]').click();
  await expect(visitor.locator('.arcade-record')).toBeHidden();
  await expect(visitor.locator('.arcade-score')).toContainText('YOU 0 : 0 CPU');
  await second.close();

  const unavailable = await browser.newContext({viewport: {width: 390, height: 850}});await prepare(unavailable, {offline: true});
  const practice = await unavailable.newPage();await mount(practice);
  await expect(practice.locator('.arcade-record strong')).toHaveText('Unavailable');
  await expect(practice.locator('.arcade-record-status')).toContainText('local practice');
  const beforePractice = finishes;
  await practice.locator('[data-arcade-action="start"]').click();
  await expect(practice.locator('.terminal-game-panel')).toHaveAttribute('data-outcome', 'over');
  assert.equal(finishes, beforePractice, 'an offline course is never submitted as verified');await unavailable.close();

  const delayed = await browser.newContext({viewport: {width: 1200, height: 900}});
  const release = await prepare(delayed, {hold: true});const waiting = await delayed.newPage();await mount(waiting);
  await waiting.locator('[data-arcade-action="start"]').click();
  await expect(waiting.locator('.arcade-record-status')).toContainText('Preparing');
  await expect(waiting.locator('.terminal-game-panel')).toHaveAttribute('data-outcome', 'ready');
  const beforeExit = finishes;
  await waiting.locator('[data-arcade-action="shell"]').click();release();
  await waiting.waitForTimeout(150);
  assert.equal(await waiting.locator('.terminal-game-panel').count(), 0);
  assert.equal(await waiting.evaluate(() => window.__recordPanel.dataset.outcome), 'disposed');
  assert.equal(finishes, beforeExit, 'late flight responses cannot restart or submit an exited game');await delayed.close();

  await first.close();assert.deepEqual(errors, []);
  console.log(JSON.stringify({result: 'Shared arcade records passed', highScore, verifiedFlights: finishes, checks: ['real fixed-step seeded replay', 'pause/resume input replay', 'shared record across isolated visitors', 'persistent device best', '320px layout and Pong', 'honest offline practice', 'late start disposal'], errors}));
} finally {await browser.close();}
