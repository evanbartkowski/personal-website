import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createPortraitGeometry} from '../portrait-geometry.js';

const sourceGeometry=JSON.parse(await readFile(new URL('../assets/portrait/evan-face.json',import.meta.url),'utf8'));
const robotGeometry=createPortraitGeometry(sourceGeometry);
assert.ok(robotGeometry.points.every(point=>!point.kind.includes('hair'))&&robotGeometry.edges.every(edge=>!edge.kind.includes('hair')),'the projection contains no hair geometry');
assert.ok(robotGeometry.points.every(point=>point.kind!=='ear'),'the smooth head silhouette has no ear geometry');
assert.ok(robotGeometry.points.length>sourceGeometry.positions.length*3,'the head refines the source landmarks into a substantially denser mesh');
assert.ok(robotGeometry.edges.length>sourceGeometry.edges.length*3,'the head has a detailed network of connected wire facets');
assert.deepEqual(robotGeometry.points.slice(0,sourceGeometry.positions.length).map(point=>point.p),sourceGeometry.positions,'the refined mesh preserves the original owner-derived facial landmarks');
assert.ok(robotGeometry.points.every(point=>point.p.length===3&&point.p.every(Number.isFinite)),'all projection vertices have finite 3D coordinates');
assert.ok(robotGeometry.edges.every(edge=>Number.isInteger(edge.a)&&Number.isInteger(edge.b)&&edge.a>=0&&edge.b>=0&&edge.a<robotGeometry.points.length&&edge.b<robotGeometry.points.length),'wire facets connect valid projection vertices');
assert.ok(robotGeometry.panels.every(panel=>panel.indices.length>=3&&panel.indices.every(index=>Number.isInteger(index)&&index>=0&&index<robotGeometry.points.length)),'any filled accents reference valid 3D vertices');

const base = process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({ ...(existsSync(executablePath) ? { executablePath } : { channel: 'chrome' }), headless: true, args:['--enable-unsafe-swiftshader'] });
const errors = [], results = [], requests = [];

async function prepare(page) {
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Disabled during portrait QA.' } }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    // Observe the actual local projection drawing, including its geometry.
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('portrait-canvas')) {
        this.canvas.__portraitPaints = (this.canvas.__portraitPaints || 0) + 1;
        this.canvas.__portraitOptics = [];
        this.canvas.__portraitStrokes = 0;
      }
      return clear.apply(this, args);
    };
    const stroke=CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke=function(...args){
      if(this.canvas.classList.contains('portrait-canvas'))this.canvas.__portraitStrokes++;
      return stroke.apply(this,args);
    };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      const optics=this.canvas.__portraitOptics;
      if(optics&&optics.length<2)optics.push([args[0],args[1]]);
      return arc.apply(this, args);
    };
  });
}

async function ready(page) {
  await page.goto(base);
  await expect(page.locator('#portrait')).toHaveAttribute('data-state', 'ready');
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  assert.equal(await page.locator('#portrait .portrait-canvas').count(), 1);
  assert.equal(Number(await page.locator('#portrait').getAttribute('data-point-count')),robotGeometry.points.length,'the renderer uses the dense geometry');
  assert.equal(Number(await page.locator('#portrait').getAttribute('data-edge-count')),robotGeometry.edges.length,'the renderer uses the complete connected wire mesh');
  assert.ok(await page.locator('.portrait-canvas').evaluate(canvas=>canvas.__portraitStrokes>2),'the live canvas paints connected wire strokes');
  await expect(page.locator('#portrait')).toHaveAttribute('data-renderer', 'perspective-3d');
  assert.equal(await page.locator('#portrait').evaluate(host => getComputedStyle(host, '::after').opacity), '0', 'live projection hides the fallback eye layer');
}

// The renderer starts with the optical glows at the two stable iris landmarks.
// Unlike depth/opacity stroke batches, their order does not change with a turn.
const vertices = page => page.locator('.portrait-canvas').evaluate(canvas => canvas.__portraitOptics);
const distance = (first, second) => first.reduce((sum, point, index) => sum + Math.hypot(point[0] - second[index][0], point[1] - second[index][1]), 0) / first.length;
const paints = page => page.locator('.portrait-canvas').evaluate(canvas => canvas.__portraitPaints);
const eyeTint = page => page.locator('.portrait-canvas').evaluate(canvas => {
  const sample=document.createElement('canvas');sample.width=canvas.width;sample.height=canvas.height;
  const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0);
  const ratio=canvas.width/canvas.clientWidth;
  const average=data=>{let alpha=0,r=0,g=0,b=0;for(let i=0;i<data.length;i+=4){const a=data[i+3]/255;alpha+=a;r+=data[i]*a;g+=data[i+1]*a;b+=data[i+2]*a;}return [r/alpha,g/alpha,b/alpha];};
  const eyes=canvas.__portraitOptics.map(([x,y])=>average(context.getImageData(Math.round(x*ratio)-1,Math.round(y*ratio)-1,3,3).data));
  return {left:eyes[0],right:eyes[1],cheek:average(context.getImageData(0,0,sample.width,sample.height).data)};
});
function assertDistinctEyes(tint) {
  const separation = eye => Math.hypot(...eye.map((channel, index) => channel - tint.cheek[index]));
  assert.ok(separation(tint.left) > 10 && separation(tint.right) > 10, 'both painted irises have a distinct accent from the face');
}
const digest = image => createHash('sha256').update(image).digest('hex');
const pixels = page => page.locator('.portrait-canvas').evaluate(canvas => {
  // Read through a separate sampling canvas so repeated QA readback does not
  // switch the production canvas between Chrome's GPU/CPU raster backends.
  const sample = document.createElement('canvas'); sample.width = canvas.width; sample.height = canvas.height;
  const context = sample.getContext('2d', { willReadFrequently: true }); context.drawImage(canvas, 0, 0);
  const rgba = context.getImageData(0, 0, sample.width, sample.height).data;
  let visible = 0, alpha = 0, red = 0, green = 0, blue = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > 2) visible++;
    const a = rgba[i + 3] / 255;
    alpha += a; red += rgba[i] * a; green += rgba[i + 1] * a; blue += rgba[i + 2] * a;
  }
  return { visible, total: rgba.length / 4, color: [red / alpha, green / alpha, blue / alpha], image: canvas.toDataURL() };
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  await prepare(page); await ready(page);
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state', 'running');
  const geometryResponse = await page.request.get(`${base}/assets/portrait/evan-face.json`);
  assert.equal(geometryResponse.ok(), true);
  const geometry = await geometryResponse.json();
  assert.ok(geometry.positions.length >= 468 && geometry.edges.length > 1000, 'locally derived source proportions remain available');
  const depths = geometry.positions.map(point => point[2]);
  assert.ok(Math.max(...depths) - Math.min(...depths) > .5, 'face vertices have genuine depth');

  await page.mouse.move(5, 400); await page.waitForTimeout(800);
  const left = await vertices(page);
  assert.equal(left.length, 2, 'the renderer paints both stable projected optical landmarks');
  await page.mouse.move(1435, 400);
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  const early = await vertices(page);
  await page.waitForTimeout(800);
  const right = await vertices(page);
  const firstStep = distance(left, early), fullTurn = distance(left, right);
  assert.ok(fullTurn > 2, 'moving the pointer changes actual 3D projected vertices');
  assert.ok(firstStep < fullTurn * .8, 'pointer rotation eases in without an immediate jump');
  await page.mouse.move(720,15);await page.waitForTimeout(1000);const top=await vertices(page);
  await page.mouse.move(720,985);await page.waitForTimeout(1000);const bottom=await vertices(page);
  const verticalTurn=distance(top,bottom);
  assert.ok(verticalTurn>2,'vertical cursor movement changes the actual perspective projection');
  assert.ok(Math.abs((top[1][1]-top[0][1])-(bottom[1][1]-bottom[0][1]))>.02,'the portrait includes subtle roll and asymmetric gaze rather than a flat horizontal slide');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  // rAF polling lets headless Chromium deliver the pending media-change frame
  // after the production loop observes reduced motion and stops scheduling.
  await page.waitForFunction(() => document.querySelector('#portrait').dataset.motionState === 'paused');
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state', 'paused');
  await page.locator('.settings-launch').click();
  await page.locator('input[name="settings-palette"][value="default"]').check();
  const forest = await pixels(page);
  assert.ok(forest.color[1] > forest.color[0] && forest.color[1] > forest.color[2], 'Forest recolors the actual projection');
  const forestEyes = await eyeTint(page); assertDistinctEyes(forestEyes);
  await page.locator('input[name="settings-palette"][value="lavender"]').check();
  const lavender = await pixels(page);
  assert.ok(lavender.color[2] > lavender.color[1], 'Lavender recolors projection lines and points');
  const lavenderEyes = await eyeTint(page); assertDistinctEyes(lavenderEyes);
  assert.notDeepEqual(forestEyes.left, lavenderEyes.left, 'the separate eye tint also follows the chosen theme');
  await page.locator('#settings-reset-color').click(); await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.querySelector('#portrait').dataset.motionState === 'running');

  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state', 'paused');
  const hiddenPaints = await paints(page);
  await page.waitForTimeout(220);
  assert.equal(await paints(page), hiddenPaints, 'hidden documents stop painting the portrait');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state', 'running');
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.evaluate(() => {const spacer = document.createElement('div');spacer.id='qa-portrait-offscreen';spacer.style.height='800px';document.querySelector('main').append(spacer);scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });});
  assert.ok(await page.locator('#portrait').evaluate(node => node.getBoundingClientRect().bottom < -30), 'the test scrolls beyond the observer margin');
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state', 'paused');
  const offscreenPaints = await paints(page);
  await page.waitForTimeout(220);
  assert.equal(await paints(page), offscreenPaints, 'offscreen portraits stop painting');
  await page.evaluate(() => {scrollTo({ top: 0, behavior: 'instant' });document.querySelector('#qa-portrait-offscreen').remove();});
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state', 'running');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.evaluate(() => { window.__oldPortrait = document.querySelector('#portrait'); window.__oldPortraitCanvas = document.querySelector('.portrait-canvas'); });
  await page.locator('.desktop-nav a[href="/about.html"]').click();
  await page.waitForFunction(() => location.pathname === '/about.html' && document.documentElement.dataset.navigationState === 'idle');
  assert.equal(await page.locator('#portrait').count(), 0);
  assert.equal(await page.evaluate(() => window.__oldPortrait.dataset.motionState), 'disposed');
  const disposedPaints = await page.evaluate(() => window.__oldPortraitCanvas.__portraitPaints);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__oldPortraitCanvas.__portraitPaints), disposedPaints, 'the old portrait loop is disposed on navigation');
  await page.locator('.brand').click();
  await expect(page.locator('#portrait')).toHaveAttribute('data-state', 'ready');
  assert.equal(await page.locator('.portrait-canvas').count(), 1, 'returning home mounts one fresh projection');
  await page.locator('.portrait-canvas').evaluate(canvas => { window.__lostPortraitCanvas = canvas; canvas.dispatchEvent(new Event('contextlost', { cancelable: true })); });
  await expect(page.locator('#portrait')).toHaveAttribute('data-state', 'fallback');
  assert.equal(await page.locator('.portrait-canvas').count(), 0);
  const lostPaints = await page.evaluate(() => window.__lostPortraitCanvas.__portraitPaints);
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => window.__lostPortraitCanvas.__portraitPaints), lostPaints, 'lost drawing contexts stop painting and restore the fallback');
  await page.close();

  for (const width of [320, 390, 760, 1024, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await prepare(page); await ready(page);
    const layout = await page.evaluate(() => {
      const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, face: bounds('#portrait'), title: bounds('#hero-title'), copy: bounds('.hero-copy'), bio: bounds('.hero-details'), dyson: bounds('.reactor-panel') };
    });
    assert.equal(layout.overflow, false, `${width}px has no horizontal overflow`);
    assert.ok(layout.face.width >= 120 && layout.face.width <= 700, 'portrait has a responsive presence beside the sphere');
    assert.ok(layout.face.height >= 210 && layout.face.height <= 460, 'projection retains a substantial responsive height');
    assert.ok(layout.face.x >= 0 && layout.face.x + layout.face.width <= width, 'portrait stays inside the viewport');
    assert.equal(layout.face.height, layout.dyson.height, 'the two artworks share a symmetric stage height');
    if (width > 760) {
      assert.ok(layout.face.x + layout.face.width <= layout.copy.x, 'the portrait sits to the left of the centered introduction');
      assert.ok(layout.dyson.x >= layout.copy.x + layout.copy.width, 'the sphere sits to the right of the introduction');
      assert.ok(Math.abs(layout.copy.x + layout.copy.width / 2 - width / 2) < 2, 'the biography is centered in the viewport');
    } else {
      assert.ok(layout.face.y >= layout.copy.y + layout.copy.height - 1, 'narrow screens place both artworks below the centered introduction');
      assert.ok(Math.abs(layout.face.y - layout.dyson.y) < 1, 'mobile artwork remains paired on one row');
    }
    assert.ok(layout.dyson.width >= 120, 'the existing Dyson sphere retains room');
    const frame = await pixels(page);
    assert.ok(frame.visible > 300 && frame.visible / frame.total < .55, 'real lines and points leave a predominantly transparent projection');
    await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state', 'paused');
    const initial = digest(frame.image);
    await page.waitForTimeout(180);
    assert.equal(digest((await pixels(page)).image), initial, 'reduced motion holds a still 3D portrait');
    results.push({ width, portrait: [layout.face.width, layout.face.height], visiblePixels: frame.visible });
    await page.close();
  }

  const fallback = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  await prepare(fallback);
  await fallback.route('**/assets/portrait/evan-face.json*', route => route.fulfill({ status: 503, body: '' }));
  await fallback.goto(base);
  await expect(fallback.locator('#portrait')).toHaveAttribute('data-state', 'fallback');
  assert.equal(await fallback.locator('.portrait-canvas').count(), 0);
  assert.equal(await fallback.locator('.portrait-fallback').evaluate(element => getComputedStyle(element).opacity), '0.52');
  assert.equal(await fallback.locator('#portrait').evaluate(host => getComputedStyle(host, '::after').opacity), '0.58');
  await expect(fallback.locator('#hero-title')).toBeVisible();
  await fallback.close();

  const failedModule = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  await prepare(failedModule);
  await failedModule.route('**/portrait.js*', route => route.fulfill({ status: 503, contentType: 'text/javascript', body: '' }));
  await failedModule.goto(base);
  await failedModule.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  assert.equal(await failedModule.locator('.portrait-canvas').count(), 0);
  assert.equal(await failedModule.locator('.portrait-fallback').evaluate(element => getComputedStyle(element).opacity), '0.52');
  await expect(failedModule.locator('#hero-title')).toBeVisible();
  await failedModule.close();

  const noJs = await browser.newPage({ viewport: { width: 320, height: 900 }, javaScriptEnabled: false });
  await noJs.goto(base);
  assert.match(await noJs.locator('.portrait-fallback').evaluate(element => getComputedStyle(element).maskImage), /evan-projection\.svg/);
  assert.equal(await noJs.locator('.portrait-fallback').evaluate(element => getComputedStyle(element).opacity), '0.52');
  assert.match(await noJs.locator('#portrait').evaluate(host => getComputedStyle(host, '::after').maskImage), /evan-projection-eyes\.svg/);
  assert.equal(await noJs.locator('#portrait').evaluate(host => getComputedStyle(host, '::after').opacity), '0.58');
  await expect(noJs.locator('#hero-title')).toBeVisible();
  await noJs.close();

  assert.equal(requests.some(url => /IMG_8479|IMG_8362|face_landmarker|mediapipe/i.test(url)), false, 'source photos and face detector are never requested by visitors');
  assert.deepEqual(errors, [], 'no browser errors');
  console.log(JSON.stringify({ result: 'Portrait checks passed', base, geometry:{points:robotGeometry.points.length,edges:robotGeometry.edges.length}, results, pointer: { firstStep, fullTurn,verticalTurn }, checks: ['dense hairless human wire mesh','preserved owner-derived face landmarks','accented optical eyes','real 3D geometry','smoothed multi-axis mouse response','theme colors','reduced/hidden/offscreen motion','navigation disposal','static and failed-load fallback','no public source photos'] }, null, 2));
} finally {
  await browser.close();
}
