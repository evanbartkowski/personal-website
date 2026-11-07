import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({...(existsSync(executablePath) ? {executablePath} : {channel: 'chrome'}), headless: true, args: ['--enable-unsafe-swiftshader']});
const errors = [];
const results = {};

// Observe actual GPU clears without requiring production-only frame counters.
// Each Three renderer clears once per painted frame; the ambient sky is 2D.
async function instrument(context) {
  await context.addInitScript(() => {
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const prototype = window[name]?.prototype;
      if (!prototype) continue;
      const clear = prototype.clear;
      prototype.clear = function (...args) {
        if (this.canvas.dataset.visual === 'dyson-sphere') this.canvas.__qaFrames = (this.canvas.__qaFrames || 0) + 1;
        return clear.apply(this, args);
      };
    }
  });
}

function track(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type()) && /THREE|WebGL|shader|GLSL|GL_INVALID/i.test(message.text())) errors.push(message.text());
  });
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  await page.locator('#reactor canvas').waitFor();
  await page.waitForFunction(() => document.querySelector('#reactor canvas').__qaFrames > 0);
  await page.evaluate(() => document.fonts.ready);
}

async function diagnostics(page, renderer) {
  const detail = await page.locator('#reactor').evaluate(node => ({...node.dataset}));
  assert.equal(detail.architecture, 'orbital-rings', `${renderer}: broad orbital-ring architecture`);
  assert.equal(Number(detail.orbitalBands), 5, `${renderer}: five major rings`);
  assert.ok(Number(detail.collectorPanels) > 0, `${renderer}: inner collector surfaces`);
  assert.equal(detail.ringStyle, 'flush-panel', `${renderer}: sleek panelled hulls`);
  assert.equal(Number(detail.cityModules), 0, `${renderer}: skyline protrusions removed`);
  assert.equal(Number(detail.protrusions), 0, `${renderer}: clean outer silhouettes`);
  assert.ok(Number(detail.hullInlays) > 0, `${renderer}: inset hull detail remains`);
  assert.equal(Number(detail.satellites), 3, `${renderer}: restrained satellite count`);
  assert.equal(Number(detail.plasmaPlumes), 6, `${renderer}: short solar wisps`);
  if (await page.locator('#reactor > svg').count()) {
    const geometry = await page.locator('#reactor > svg').evaluate(svg => {
      const unique = attribute => new Set([...svg.querySelectorAll(`[${attribute}]`)].map(node => node.getAttribute(attribute))).size;
      return {bands: unique('data-orbital-band'), panels: unique('data-collector-panel'), inlays: unique('data-hull-inlay'), protrusions:svg.querySelectorAll('[data-city-module]').length};
    });
    assert.equal(geometry.bands, Number(detail.orbitalBands), `${renderer}: reported bands match projected geometry`);
    assert.equal(geometry.panels, Number(detail.collectorPanels), `${renderer}: reported panels match projected geometry`);
    assert.equal(geometry.inlays, Number(detail.hullInlays), `${renderer}: reported inlays match projected geometry`);
    assert.equal(geometry.protrusions, 0, `${renderer}: no legacy protruding geometry`);
  }
  return detail;
}

const frames = page => page.locator('#reactor canvas').evaluate(canvas => canvas.__qaFrames || 0);

async function pixels(page, first, second = first) {
  return page.evaluate(async ({first, second}) => {
    async function decode(encoded) {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return {data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height};
    }
    const a = await decode(first);
    const b = await decode(second);
    if (a.width !== b.width || a.height !== b.height) throw new Error('The reactor moved or resized while checking its rendered pixels.');
    let changed = 0;
    let absoluteDelta = 0;
    let warm = 0;
    let blue = 0;
    for (let index = 0; index < a.data.length; index += 4) {
      const [r, g, blueChannel] = a.data.subarray(index, index + 3);
      if (r > 140 && g > 90 && blueChannel < r * .95) warm++;
      if (blueChannel > 75 && blueChannel > r * 1.08 && blueChannel > g * .98) blue++;
      const difference = Math.abs(r - b.data[index]) + Math.abs(g - b.data[index + 1]) + Math.abs(blueChannel - b.data[index + 2]);
      absoluteDelta += difference;
      if (difference > 30) changed++;
    }
    return {changedFraction: changed / (a.width * a.height), meanPixelDelta:absoluteDelta/(a.width*a.height), warmPixels: warm, bluePixels: blue, width: a.width, height: a.height};
  }, {first: first.toString('base64'), second: second.toString('base64')});
}

async function still(page, reason) {
  // Resize/intersection/media handlers may request one final static frame.
  await page.waitForTimeout(180);
  const before = await frames(page);
  await page.waitForTimeout(180);
  assert.equal(await frames(page), before, reason);
  return before;
}

try {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'no-preference'});
  await instrument(context);
  const page = await context.newPage();
  track(page);
  await page.goto(base);
  await ready(page);
  results.webgl = await diagnostics(page, 'WebGL');
  const initialFrames = await frames(page);
  await page.waitForFunction(count => document.querySelector('#reactor canvas').__qaFrames > count + 1, initialFrames);

  await page.emulateMedia({reducedMotion: 'reduce'});
  await still(page, 'OS reduced motion stops automatic reactor rendering');
  const canvas = page.locator('#reactor canvas');
  const bounds = await canvas.boundingBox();
  // A still scene isolates the actual rendered sun response from orbit motion.
  await page.mouse.move(bounds.x + bounds.width * .94, bounds.y + bounds.height * .12);
  await page.waitForFunction(() => Number(document.querySelector('#reactor').dataset.sunGlow) === 0);
  const core = await page.locator('#reactor').evaluate(node => ({x:Number(node.dataset.sunCoreX),y:Number(node.dataset.sunCoreY)}));
  const beforeHover = await canvas.screenshot();
  await page.mouse.move(bounds.x + bounds.width * core.x, bounds.y + bounds.height * core.y);
  await page.waitForFunction(() => Number(document.querySelector('#reactor').dataset.sunGlow) > .95);
  results.sunHover = await pixels(page,beforeHover,await canvas.screenshot());
  assert.ok(results.sunHover.meanPixelDelta > .02,'hovering near the star visibly changes its rendered glow');
  await still(page,'sun hover does not start an automatic loop with reduced motion');
  await page.mouse.move(bounds.x + bounds.width * .94, bounds.y + bounds.height * .12);
  await page.waitForFunction(() => Number(document.querySelector('#reactor').dataset.sunGlow) === 0);
  await page.mouse.move(4,4);
  await page.waitForFunction(() => Number(document.querySelector('#reactor').dataset.sunGlow) === 0);
  await still(page,'leaving the Dyson stage clears the glow and remains still');
  const x = bounds.x + bounds.width * .36;
  const y = bounds.y + bounds.height * .47;
  await page.mouse.move(x, y);
  const beforeDrag = await canvas.screenshot();
  await page.mouse.down();
  await page.mouse.move(x + bounds.width * .28, y + bounds.height * .08, {steps: 10});
  await page.mouse.up();
  await page.waitForTimeout(100);
  const afterDrag = await canvas.screenshot();
  results.desktop = await pixels(page, beforeDrag, afterDrag);
  assert.ok(results.desktop.warmPixels > 40, 'the live image contains a visible warm stellar core');
  assert.ok(results.desktop.bluePixels > 20, 'the live image contains blue collector surfaces');
  assert.ok(results.desktop.changedFraction > .008, 'a real mouse drag visibly rotates the ring assembly, including with reduced motion enabled');
  await still(page, 'manual rotation settles back to a still reduced-motion scene');

  await page.emulateMedia({reducedMotion: 'no-preference'});
  let before = await frames(page);
  await page.waitForFunction(count => document.querySelector('#reactor canvas').__qaFrames > count, before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, value: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await still(page, 'hidden-document handling stops drawing');
  await page.evaluate(() => {delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));});
  before = await frames(page);
  await page.waitForFunction(count => document.querySelector('#reactor canvas').__qaFrames > count, before);

  await page.evaluate(() => {document.body.style.minHeight = '3600px'; scrollTo({top: 2600, behavior: 'instant'});});
  await still(page, 'an offscreen reactor stops drawing');
  before = await frames(page);
  await page.evaluate(() => {document.body.style.minHeight = ''; scrollTo({top: 0, behavior: 'instant'});});
  await page.waitForFunction(count => document.querySelector('#reactor canvas').__qaFrames > count, before);

  await page.evaluate(() => {window.__oldReactor = document.querySelector('#reactor canvas');});
  await page.locator('.desktop-nav a[href="/about.html"]').click();
  await page.waitForFunction(() => location.pathname === '/about.html' && document.documentElement.dataset.navigationState === 'idle');
  assert.equal(await page.locator('#reactor canvas').count(), 0, 'a page without a Dyson sphere does not retain its renderer');
  assert.equal(await page.evaluate(() => window.__oldReactor.isConnected), false);
  const disposedFrames = await page.evaluate(() => window.__oldReactor.__qaFrames);
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => window.__oldReactor.__qaFrames), disposedFrames, 'the removed renderer no longer paints');
  await page.locator('header .brand').click();
  await ready(page);
  assert.equal(await page.locator('#reactor canvas').count(), 1, 'returning home creates exactly one renderer');
  assert.equal(await page.evaluate(() => document.querySelector('#reactor canvas') === window.__oldReactor), false);
  results.lifecycle = 'active animation, reduced-motion stillness, explicit rotation, hidden/offscreen pause and resume, disposed render loop, one renderer on return';

  await page.locator('#reactor canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', {cancelable: true})));
  await page.locator('#reactor > svg').waitFor();
  assert.equal(await page.locator('#reactor canvas').count(), 0);
  assert.match(await page.locator('#reactor > svg').getAttribute('aria-label'), /Dyson/i);
  results.contextLoss = await diagnostics(page, 'context-loss SVG');
  await context.close();

  const touchContext = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});
  await instrument(touchContext);
  const touch = await touchContext.newPage();
  track(touch);
  await touch.goto(base);
  await ready(touch);
  await touch.locator('#reactor canvas').scrollIntoViewIfNeeded();
  await still(touch, 'mobile reduced motion stops automatic rendering');
  const touchCanvas = touch.locator('#reactor canvas');
  const box = await touchCanvas.boundingBox();
  const start = {x: box.x + box.width * .7, y: Math.max(120, box.y + box.height * .5)};
  const session = await touchContext.newCDPSession(touch);
  const scrollBefore = await touch.evaluate(() => scrollY);
  const beforeTouch = await touchCanvas.screenshot();
  await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [start]});
  for (let index = 1; index <= 9; index++) {
    await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: start.x - box.width * .4 * index / 9, y: start.y + index * .3}]});
    await touch.waitForTimeout(17);
  }
  await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await touch.waitForTimeout(120);
  assert.ok(Math.abs(await touch.evaluate(() => scrollY) - scrollBefore) < 4, 'horizontal rotation does not move the page');
  results.touch = await pixels(touch, beforeTouch, await touchCanvas.screenshot());
  assert.ok(results.touch.changedFraction > .008, 'a native horizontal touch gesture visibly rotates the sphere');

  // Add only scroll room; exercise a genuine native vertical swipe through the
  // canvas to ensure the touch interaction does not trap normal page scrolling.
  await touch.evaluate(() => {document.body.style.minHeight = '3600px';});
  const scrollStart = await touch.evaluate(() => scrollY);
  const vertical = {x: box.x + box.width * .5, y: Math.min(730, Math.max(230, start.y))};
  await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [vertical]});
  for (let index = 1; index <= 9; index++) {
    await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: vertical.x + index * .2, y: vertical.y - index * 17}]});
    await touch.waitForTimeout(17);
  }
  await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await touch.waitForTimeout(150);
  assert.ok(await touch.evaluate(() => scrollY) > scrollStart + 30, 'vertical swiping over the sphere scrolls the page');
  await touchContext.close();

  const fallbackContext = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const fallback = await fallbackContext.newPage();
  track(fallback);
  await fallback.route('**/vendor/**', route => route.abort());
  await fallback.goto(base);
  await fallback.locator('#reactor > svg').waitFor();
  assert.equal(await fallback.locator('#reactor canvas').count(), 0, 'the static fallback works with Three unavailable');
  assert.match(await fallback.locator('#reactor > svg').getAttribute('aria-label'), /Dyson/i);
  results.blockedVendor = await diagnostics(fallback, 'standalone SVG');
  const svgBounds = await fallback.locator('#reactor > svg').boundingBox();
  const svgCore = await fallback.locator('#reactor > svg').evaluate(svg => {const point = new DOMPoint(320,302).matrixTransform(svg.getScreenCTM());return{x:point.x,y:point.y};});
  await fallback.mouse.move(svgBounds.x+svgBounds.width*.94,svgBounds.y+svgBounds.height*.12);
  const beforeSvgHover = await fallback.locator('#reactor > svg').screenshot();
  await fallback.mouse.move(svgCore.x,svgCore.y);
  await fallback.waitForFunction(() => Number(document.querySelector('#reactor').dataset.sunGlow)>.95);
  results.fallbackHover = await pixels(fallback,beforeSvgHover,await fallback.locator('#reactor > svg').screenshot());
  assert.ok(results.fallbackHover.meanPixelDelta>.02,'fallback sun responds visibly to actual pointer proximity');
  await fallback.mouse.move(4,4);
  await fallback.waitForFunction(() => Number(document.querySelector('#reactor').dataset.sunGlow)===0);
  const stillSvg = await fallback.locator('#reactor').innerHTML();
  await fallback.waitForTimeout(180);
  assert.equal(await fallback.locator('#reactor').innerHTML(), stillSvg, 'the standalone SVG has no animation loop');
  await fallback.keyboard.press('Control+k');
  assert.equal(await fallback.locator('#terminal-dialog').evaluate(dialog => dialog.open), true, 'the rest of the portfolio remains interactive after renderer fallback');
  await fallbackContext.close();

  assert.deepEqual(errors, [], 'no Three, shader, or page errors');
  console.log(JSON.stringify({result: 'passed', ...results, pageErrors: errors}));
} finally {
  await browser.close();
}
