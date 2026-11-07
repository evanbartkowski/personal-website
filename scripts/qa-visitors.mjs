import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({ ...(existsSync(executablePath) ? { executablePath } : { channel: 'chrome' }), headless: true });
const outline = JSON.parse(await readFile(new URL('../assets/maps/world.json', import.meta.url), 'utf8'));
const errors = [];
const results = [];
const fixture = {
  points: [
    { id: 'US:25:15', label: 'United States', country: 'United States', countryCode: 'US', lat: 37.5, lon: -102.5, visits: 7, ip: '9.9.9.9' },
    { id: 'CA:29:12', label: 'Canada', country: 'Canada', countryCode: 'CA', lat: 57.5, lon: -117.5, visits: 5 },
  ],
  current: { label: 'Baltimore, Maryland, United States', country: 'United States', countryCode: 'US', lat: 39.3, lon: -76.6, accuracy: 'approximate', accuracyRadiusKm: 50 },
  currentIp: '8.8.8.8',
  totalVisits: 12,
  windowDays: 7,
  updatedAt: '2026-11-03T14:00:00.000Z',
};
const device = { latitude: 12.345678, longitude: 98.765432 };

async function instrument(page) {
  await page.addInitScript(() => {
    window.__gpsCalls = 0;
    window.__gpsMode = 'denied';
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, denied, options) {
        window.__gpsCalls++;
        window.__gpsOptions = options;
        if (window.__gpsMode === 'hold') { window.__gpsCallback = success; return; }
        queueMicrotask(() => window.__gpsMode === 'granted'
          ? success({ coords: { latitude: 12.345678, longitude: 98.765432, accuracy: 35 } })
          : denied({ code: 1, message: 'Permission denied' }));
      },
    } });
    window.__visitorDocumentToken = Math.random();
  });
  page.on('pageerror', error => errors.push(error.message));
}

async function waitForPage(page, pathname) {
  await page.waitForFunction(path => location.pathname === path && document.documentElement.dataset.navigationState === 'idle', pathname);
}

async function navigate(page, pathname, mobile = false) {
  if (mobile) {
    await page.locator('.menu-toggle').click();
    await page.locator(`#mobile-nav a[href="${pathname}"]`).click();
  } else await page.locator(`.desktop-nav a[href="${pathname}"]`).click();
  await waitForPage(page, pathname);
}

function noDeviceCoordinates(requests) {
  for (const request of requests) {
    const value = `${request.url} ${request.body || ''}`;
    assert.equal(value.includes(String(device.latitude)), false, 'precise device latitude never leaves the browser');
    assert.equal(value.includes(String(device.longitude)), false, 'precise device longitude never leaves the browser');
  }
}

async function markerDimensions(marker) {
  return marker.evaluate(element => {
    const size = selector => {
      const bounds = element.querySelector(selector).getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    };
    return { visible: size('.visitor-dot,.visitor-self-core'), hit: size('.visitor-marker-hit') };
  });
}

async function activateMarker(page, marker, touch = false) {
  if (!touch) return marker.click();
  const bounds = await marker.locator('.visitor-marker-hit').boundingBox();
  assert.ok(bounds, 'touch target is visible');
  await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

async function expectCompactMarker(marker, touch = false) {
  await expect.poll(async () => (await markerDimensions(marker)).hit.width).toBeGreaterThanOrEqual(touch ? 23 : 13);
  const dimensions = await markerDimensions(marker);
  assert.ok(dimensions.visible.width >= 4 && dimensions.visible.width <= 8, 'map marker has a small, legible visual dot');
  assert.ok(dimensions.hit.width <= 25 && Math.abs(dimensions.hit.width-dimensions.hit.height) < .5, 'small marker retains a practical pointer target');
  return dimensions;
}

try {
  for (const width of [1440, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, hasTouch: width < 761, reducedMotion: 'reduce' });
    await instrument(page);
    const requests = [];
    let gets = 0;
    let outlines = 0;
    page.on('request', request => {
      requests.push({ url: request.url(), method: request.method(), body: request.postData() });
      if (new URL(request.url()).pathname === '/assets/maps/world.json') outlines++;
    });
    // Mock only analytics. Every HTML/CSS/module/world-outline asset is the
    // actual local build. No AI request or production analytics write can run.
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path !== '/api/visitors') return route.fulfill({ status: 503, json: { error: 'Disabled during visitor-map QA.' } });
      if (request.method() !== 'GET') return route.fulfill({ json: { ...fixture, recorded: false } });
      gets++;
      return route.fulfill({ json: { ...fixture, totalVisits: 11 + gets, points: [{ ...fixture.points[0], visits: 6 + gets }, fixture.points[1]] } });
    });
    await page.goto(`${base}/about.html`);
    await waitForPage(page, '/about.html');
    const details = page.locator('#visitor-map');
    await expect(details).not.toHaveAttribute('open');
    assert.equal(gets, 0, 'visitor map defers its aggregate GET until the dropdown opens');
    assert.equal(outlines, 0, 'world geometry is lazy loaded');
    assert.equal(await page.evaluate(() => window.__gpsCalls), 0, 'loading About never requests device location');
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(page.locator('[data-visitor-total]')).toHaveText('12');
    await expect(page.locator('[data-visitor-regions]')).toHaveText('2');
    assert.equal(gets, 1);
    assert.equal(outlines, 1);
    assert.equal(await page.locator('.visitor-land').getAttribute('d'), outline.path, 'real Natural Earth outline is rendered, not a placeholder');
    assert.ok(outline.path.length > 10000, 'world outline includes detailed continental boundaries');
    await expect(page.locator('.visitor-region')).toHaveCount(2);
    await expect(page.locator('.visitor-self')).toHaveCount(1);
    await expect(page.locator('.visitor-legend')).toContainText('Visitor regions');
    await expect(page.locator('.visitor-legend')).toContainText('Your location');
    await expect(page.locator('[data-visitor-updated]')).toContainText('Updated');
    await expect(page.locator('.visitor-empty')).toBeHidden();
    await expect(page.locator('.visitor-status')).toBeEmpty();
    await expect(page.locator('[data-visitor-ip]')).toHaveText(fixture.currentIp);
    assert.equal((await details.innerText()).includes('9.9.9.9'), false, 'another visitor address is never displayed');
    const initialView = (await page.locator('.visitor-world').getAttribute('viewBox')).split(' ').map(Number);
    assert.deepEqual(initialView, [0,0,960,480], 'map starts at Fit world even when the visitor location is available');
    await expect(page.locator('.visitor-selection,.visitor-privacy')).toHaveCount(0);
    const mapBounds = await details.boundingBox();
    const frameBounds = await page.locator('.visitor-map-frame').boundingBox();
    assert.ok(mapBounds.width <= 1041, 'map disclosure stays compact on large screens');
    assert.ok(frameBounds.height <= (width < 761 ? 240 : 520), 'map frame does not dominate the page');

    const region = page.locator('.visitor-region').first();
    const self = page.locator('.visitor-self');
    const tooltip = page.locator('.visitor-tooltip');
    await expect(tooltip).toBeHidden();
    const initialRegionSize = await expectCompactMarker(region, width < 761);
    const initialSelfSize = await expectCompactMarker(self, width < 761);
    const ownRing = await self.locator('.visitor-self-ring').boundingBox();
    assert.ok(ownRing.width > initialSelfSize.visible.width && ownRing.width <= 18, 'your marker has a clear, compact outer ring');
    await expect(self.locator('.visitor-self-tag')).toHaveText('YOU');

    if (width >= 761) {
      await region.hover();
      await expect(tooltip).toBeVisible();
      await expect(tooltip.locator('[data-map-tooltip-title]')).toHaveText('United States');
      await expect(tooltip.locator('[data-map-tooltip-detail]')).toHaveText('7 visits');
      await expect(tooltip.locator('[data-map-tooltip-address]')).toBeHidden();
      assert.equal((await tooltip.innerText()).includes('9.9.9.9'), false, 'region hover never reveals a supplied visitor IP');
      await page.locator('.visitor-map-frame').hover({ position: { x: 8, y: 8 } });
      await expect(tooltip).toBeHidden();
    }
    await region.focus();
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('[data-map-tooltip-detail]')).toHaveText('7 visits');
    await page.keyboard.press('Enter');
    await expect(tooltip.locator('[data-map-tooltip-detail]')).toHaveText('7 visits');
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await activateMarker(page, page.locator('.visitor-region').nth(1), width < 761);
    await expect(tooltip.locator('[data-map-tooltip-detail]')).toHaveText('5 visits');
    await expect(tooltip.locator('[data-map-tooltip-address]')).toBeHidden();
    await page.keyboard.press('Escape');
    await self.focus();
    await page.keyboard.press('Enter');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('[data-map-tooltip-address]')).toBeVisible();
    await expect(tooltip.locator('[data-map-tooltip-address]')).toHaveText(fixture.currentIp);
    await expect(tooltip.locator('[data-map-tooltip-title]')).toHaveText('You');
    await expect(tooltip.locator('[data-map-tooltip-detail]')).toHaveText(fixture.current.label);
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await activateMarker(page, self, width < 761);
    await expect(tooltip.locator('[data-map-tooltip-address]')).toHaveText(fixture.currentIp);
    if (width >= 761) {
      await page.locator('.visitor-map-frame').hover({ position: { x: 8, y: 8 } });
      await expect(tooltip).toBeVisible();
    }
    const tooltipBounds = await tooltip.boundingBox();
    assert.ok(tooltipBounds.x >= frameBounds.x - .5 && tooltipBounds.x + tooltipBounds.width <= frameBounds.x + frameBounds.width + .5, 'tooltip stays within the compact map');
    await page.keyboard.press('Escape');
    await page.locator('[data-map-zoom-in]').click();
    const zoomed = (await page.locator('.visitor-world').getAttribute('viewBox')).split(' ').map(Number);
    assert.ok(zoomed[2] < 960 && zoomed[2] >= 240, 'zoom changes the actual map viewport');
    const zoomedRegionSize = await expectCompactMarker(region, width < 761);
    const zoomedSelfSize = await expectCompactMarker(self, width < 761);
    assert.ok(Math.abs(zoomedRegionSize.visible.width-initialRegionSize.visible.width) < .5, 'visitor dots keep the same screen size when zoomed');
    assert.ok(Math.abs(zoomedSelfSize.visible.width-initialSelfSize.visible.width) < .5, 'your marker keeps the same screen size when zoomed');
    await page.locator('[data-map-zoom-out]').click();
    const wider = (await page.locator('.visitor-world').getAttribute('viewBox')).split(' ').map(Number);
    assert.ok(wider[2] > zoomed[2]);
    await page.locator('[data-map-reset]').click();
    await expect(page.locator('.visitor-world')).toHaveAttribute('viewBox', '0 0 960 480');
    if(width>=761){
      const center=await page.locator('.visitor-world').boundingBox();
      await page.mouse.move(center.x+center.width*.5,center.y+center.height*.5);
      const scrollBefore=await page.evaluate(()=>scrollY);
      await page.mouse.wheel(0,-180);
      await expect.poll(async()=>Number((await page.locator('.visitor-world').getAttribute('viewBox')).split(' ')[2])).toBeLessThan(960);
      const wheelBox=(await page.locator('.visitor-world').getAttribute('viewBox')).split(' ').map(Number);
      assert.ok(wheelBox[2]>=240,'wheel zoom respects the closest map scale');
      assert.ok(Math.abs((wheelBox[0]+wheelBox[2]/2)-480)<1,'wheel zoom keeps the pointed map location stationary');
      assert.equal(await page.evaluate(()=>scrollY),scrollBefore,'scrolling inside the map zooms instead of scrolling the page');
      await expectCompactMarker(region);
      await page.mouse.wheel(0,600);
      await expect(page.locator('.visitor-world')).toHaveAttribute('viewBox','0 0 960 480');
    }
    await page.locator('[data-map-home]').click();
    assert.equal((await page.locator('.visitor-world').getAttribute('viewBox')).split(' ')[2], '560', 'Your area explicitly focuses your network region');
    await page.locator('[data-map-reset]').click();

    const networkMarker = await page.locator('.visitor-self').getAttribute('transform');
    await page.locator('[data-map-locate]').click();
    await expect(page.locator('.visitor-status')).toContainText('Location was not shared');
    assert.equal(await page.evaluate(() => window.__gpsCalls), 1);
    assert.equal(await page.locator('.visitor-self').getAttribute('transform'), networkMarker, 'denied permission keeps the network estimate');
    await expect(page.locator('[data-map-locate]')).toBeEnabled();
    await page.evaluate(() => { window.__gpsMode = 'granted'; });
    await page.locator('[data-map-locate]').click();
    await expect(page.locator('[data-visitor-current]')).toContainText('only you');
    await expect(page.locator('.visitor-status')).toContainText('only in this browser');
    assert.equal(await page.evaluate(() => window.__gpsCalls), 2);
    assert.equal(await page.evaluate(() => window.__gpsOptions.enableHighAccuracy), false);
    const deviceMarker = await page.locator('.visitor-self').getAttribute('transform');
    await page.locator('.visitor-self').focus();
    await expect(tooltip.locator('[data-map-tooltip-detail]')).toHaveText('Your device location');
    await expect(tooltip.locator('[data-map-tooltip-address]')).toHaveText(fixture.currentIp);
    assert.equal((await tooltip.innerText()).includes(String(device.latitude)), false, 'device tooltip does not publish precise coordinates');
    await page.keyboard.press('Escape');
    await page.locator('[data-map-zoom-in]').click();
    const deviceView = await page.locator('.visitor-world').getAttribute('viewBox');
    assert.notEqual(deviceMarker, networkMarker);
    const coordinates = deviceMarker.match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
    assert.ok(Math.abs(coordinates[0] - (480 + device.longitude * 8 / 3)) < .00001);
    assert.ok(Math.abs(coordinates[1] - (240 - device.latitude * 8 / 3)) < .00001);
    await expect(page.locator('.visitor-region')).toHaveCount(2);
    await expect(page.locator('[data-visitor-total]')).toHaveText('12');
    assert.equal(gets, 1, 'device location causes no analytics request');
    noDeviceCoordinates(requests);

    await page.locator('[data-map-refresh]').click();
    await expect(page.locator('[data-visitor-total]')).toHaveText('13');
    assert.equal(gets, 2);
    assert.equal(outlines, 1, 'refresh reuses loaded continental geometry');
    assert.equal(await page.locator('.visitor-self').getAttribute('transform'), deviceMarker, 'refresh preserves the private device marker');
    assert.equal(await page.locator('.visitor-world').getAttribute('viewBox'), deviceView, 'refresh never snaps away from the visitor chosen zoom');
    await expect(page.locator('.visitor-region')).toHaveCount(2);
    await page.locator('.visitor-region').first().focus();
    await page.keyboard.press(' ');
    await expect(tooltip.locator('[data-map-tooltip-detail]')).toHaveText('8 visits');
    await expect(tooltip.locator('[data-map-tooltip-address]')).toBeHidden();
    await page.keyboard.press('Escape');
    await details.locator('summary').click();
    await details.locator('summary').click();
    assert.equal(gets, 2, 'reopening a loaded disclosure does not duplicate requests');

    const overflow = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      boxes: [...document.querySelectorAll('#visitor-map,.visitor-content,.visitor-map-frame,.visitor-stats,.visitor-actions')].map(element => {
        const box = element.getBoundingClientRect(); return { selector: element.className, left: box.left, right: box.right };
      }),
    }));
    assert.ok(overflow.scrollWidth <= overflow.width + 1, `${width}px page has no horizontal overflow`);
    for (const box of overflow.boxes) assert.ok(box.left >= -.5 && box.right <= width + .5, `${box.selector} fits a ${width}px viewport`);

    // Hold a GPS callback across real soft navigation and retain old controls
    // to verify that disposal aborts listeners and removes all SVG marks.
    await page.evaluate(() => { window.__gpsMode = 'hold'; });
    await page.locator('[data-map-locate]').click();
    await expect(page.locator('[data-map-locate]')).toBeDisabled();
    assert.equal(await page.evaluate(() => window.__gpsCalls), 3);
    const token = await page.evaluate(() => {
      window.__oldVisitorDetails = document.querySelector('#visitor-map');
      window.__oldVisitorSVG = document.querySelector('.visitor-world');
      window.__oldVisitorRefresh = document.querySelector('[data-map-refresh]');
      window.__oldVisitorRegion = document.querySelector('.visitor-region');
      return window.__visitorDocumentToken;
    });
    await navigate(page, '/experience.html', width < 761);
    assert.equal(await page.evaluate(() => window.__visitorDocumentToken), token, 'navigation preserves the document and exercises disposal');
    await expect(page.locator('#visitor-map,.visitor-region,.visitor-self')).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.__oldVisitorDetails.isConnected), false);
    assert.equal(await page.evaluate(() => window.__oldVisitorSVG.childElementCount), 0, 'disposed map SVG is emptied');
    await page.evaluate(() => {
      window.__oldVisitorRefresh.click();
      window.__oldVisitorDetails.open = false;
      window.__oldVisitorDetails.open = true;
      window.__oldVisitorDetails.dispatchEvent(new Event('toggle'));
      window.__oldVisitorRegion.dispatchEvent(new MouseEvent('click'));
      window.__gpsCallback({ coords: { latitude: 12.345678, longitude: 98.765432 } });
    });
    await page.waitForTimeout(100);
    assert.equal(gets, 2, 'retired map controls cannot issue requests');
    await expect(page.locator('.visitor-self,.visitor-region')).toHaveCount(0);
    await navigate(page, '/about.html', width < 761);
    await page.locator('#visitor-map summary').click();
    await expect(page.locator('[data-visitor-total]')).toHaveText('14');
    await expect(page.locator('.visitor-world')).toHaveCount(1);
    await expect(page.locator('.visitor-self')).toHaveCount(1);
    assert.equal(await page.locator('.visitor-self').getAttribute('transform'), networkMarker, 'a new page mount does not retain earlier precise coordinates');
    await expect(page.locator('.visitor-world')).toHaveAttribute('viewBox', '0 0 960 480');
    noDeviceCoordinates(requests);
    results.push({ width, regions: 2, initialView: 'world', compactMarkers: true, constantScreenSize: true, tooltip: width < 761 ? 'touch and keyboard' : 'hover, click and keyboard', outlinePathCharacters: outline.path.length, permissionCalls: 3, aggregateGets: gets, deviceCoordinatesUploaded: false, horizontalOverflow: false, disposed: true });
    await page.close();
  }

  // Small geographic differences can put several transparent hit targets on
  // top of one another. Pointer selection must follow the nearest visible dot,
  // including the visitor's own point drawn above the regional points.
  for (const width of [1440,320]) {
    const page = await browser.newPage({ viewport:{width,height:950},hasTouch:width<761,reducedMotion:'reduce' });
    await instrument(page);
    const nearby = {...fixture,points:[{...fixture.points[0],lon:-77.5},{...fixture.points[1],lat:42.5,lon:-77.5}]};
    await page.route('**/api/**',route=>new URL(route.request().url()).pathname==='/api/visitors'
      ? route.fulfill({json:nearby})
      : route.fulfill({status:503,json:{error:'Disabled during visitor-map QA.'}}));
    await page.goto(`${base}/about.html`);
    await waitForPage(page,'/about.html');
    await page.locator('#visitor-map summary').click();
    await expect(page.locator('.visitor-region')).toHaveCount(2);
    const regionDot=page.locator('.visitor-region').first().locator('.visitor-dot');
    await regionDot.scrollIntoViewIfNeeded();
    const regionBounds=await regionDot.boundingBox();
    const ownBounds=await page.locator('.visitor-self-core').boundingBox();
    const regionCenter={x:regionBounds.x+regionBounds.width/2,y:regionBounds.y+regionBounds.height/2};
    const ownCenter={x:ownBounds.x+ownBounds.width/2,y:ownBounds.y+ownBounds.height/2};
    assert.ok(Math.hypot(regionCenter.x-ownCenter.x,regionCenter.y-ownCenter.y)<12,'fixture really overlaps the two hit targets');
    if(width<761)await page.touchscreen.tap(regionCenter.x,regionCenter.y);
    else await page.mouse.move(regionCenter.x,regionCenter.y);
    await expect(page.locator('[data-map-tooltip-title]')).toHaveText('United States');
    await expect(page.locator('[data-map-tooltip-detail]')).toHaveText('7 visits');
    await expect(page.locator('[data-map-tooltip-address]')).toBeHidden();
    if(width<761)await page.touchscreen.tap(ownCenter.x,ownCenter.y);
    else await page.mouse.move(ownCenter.x,ownCenter.y);
    await expect(page.locator('[data-map-tooltip-title]')).toHaveText('You');
    await expect(page.locator('[data-map-tooltip-address]')).toHaveText(fixture.currentIp);
    results.push({width,nearestOverlappingPoint:true});
    await page.close();
  }

  const failurePage = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
  await instrument(failurePage);
  let attempts = 0;
  await failurePage.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname !== '/api/visitors') return route.fulfill({ status: 503, json: {} });
    if (route.request().method() !== 'GET') return route.fulfill({ json: { recorded: false } });
    attempts++;
    return route.fulfill(attempts === 1 ? { status: 503, json: { error: 'temporarily unavailable' } } : { json: fixture });
  });
  await failurePage.goto(`${base}/about.html`);
  await waitForPage(failurePage, '/about.html');
  await failurePage.locator('#visitor-map summary').click();
  await expect(failurePage.locator('.visitor-status')).toContainText('could not be loaded');
  await expect(failurePage.locator('[data-visitor-current]')).toHaveText('Location unavailable');
  await expect(failurePage.locator('.visitor-region,.visitor-self')).toHaveCount(0);
  await expect(failurePage.locator('[data-map-refresh]')).toBeEnabled();
  await failurePage.locator('[data-map-refresh]').click();
  await expect(failurePage.locator('[data-visitor-total]')).toHaveText('12');
  await expect(failurePage.locator('.visitor-region')).toHaveCount(2);
  assert.equal(attempts, 2);
  await failurePage.close();

  // Exercise the exact served recording module at a test-only non-loopback
  // origin; this avoids modifying location checks or contacting production.
  const moduleResponse = await fetch(`${base}/visitor-map.js`);
  assert.equal(moduleResponse.status, 200);
  const moduleSource = await moduleResponse.text();
  // A real public-origin mount must wait for the visit POST before its first
  // aggregate GET, or the very first visitor can see a misleading empty map.
  const aboutSource = await fetch(`${base}/about.html`).then(response=>response.text());
  const mapMarkup = aboutSource.match(/<details id="visitor-map"[\s\S]*?<\/details>/)?.[0];
  assert.ok(mapMarkup);
  const orderingPage = await browser.newPage();
  orderingPage.on('pageerror',error=>errors.push(error.message));
  await orderingPage.clock.install();
  let releaseVisit, visitStarted = false, orderingGets = 0;
  const pendingVisit = new Promise(resolve=>{releaseVisit=resolve;});
  await orderingPage.route('**/*', async route=>{
    const { pathname } = new URL(route.request().url());
    if(pathname==='/visitor-map.js') return route.fulfill({contentType:'text/javascript',body:moduleSource});
    if(pathname==='/assets/maps/world.json') return route.fulfill({json:outline});
    if(pathname==='/api/visitors') {
      if(route.request().method()==='POST'){visitStarted=true;await pendingVisit;return route.fulfill({json:{recorded:true}});}
      orderingGets++;
      return route.fulfill({json:{...fixture,dataSource:'live-preview'}});
    }
    if(pathname==='/test') return route.fulfill({contentType:'text/html',body:`${mapMarkup}<script type="module">import {recordSiteVisit,mountVisitorMap} from '/visitor-map.js';recordSiteVisit();window.disposeMap=mountVisitorMap(document.querySelector('#visitor-map'));window.visitorMapReady=true;</script>`});
    return route.abort();
  });
  await orderingPage.goto('http://portfolio-map.test/test');
  await orderingPage.waitForFunction(()=>window.visitorMapReady);
  await orderingPage.locator('#visitor-map summary').click();
  await expect.poll(()=>visitStarted).toBe(true);
  await orderingPage.waitForTimeout(100);
  assert.equal(orderingGets,0,'initial map GET waits for the in-flight recording');
  releaseVisit();
  await expect(orderingPage.locator('[data-visitor-total]')).toHaveText('12');
  await expect(orderingPage.locator('.visitor-region')).toHaveCount(2);
  await expect(orderingPage.locator('.visitor-status')).toBeEmpty();
  assert.equal(orderingGets,1);
  await orderingPage.clock.fastForward(61000);
  await expect.poll(()=>orderingGets).toBe(2);
  await orderingPage.locator('#visitor-map summary').click();
  await orderingPage.waitForTimeout(50);
  await orderingPage.clock.fastForward(61000);
  assert.equal(orderingGets,2,'closed maps do not poll');
  await orderingPage.locator('#visitor-map summary').click();
  await orderingPage.locator('.visitor-world').scrollIntoViewIfNeeded();
  await orderingPage.waitForTimeout(100);
  await orderingPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await orderingPage.clock.fastForward(61000);
  assert.equal(orderingGets,2,'hidden documents do not poll');
  await orderingPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await orderingPage.waitForTimeout(100);
  await orderingPage.clock.fastForward(61000);
  await expect.poll(()=>orderingGets).toBe(3);
  await orderingPage.evaluate(()=>{document.querySelector('.visitor-map-frame').style.display='none';});
  await orderingPage.waitForTimeout(100);
  await orderingPage.clock.fastForward(61000);
  assert.equal(orderingGets,3,'offscreen maps do not poll');
  await orderingPage.evaluate(()=>{document.querySelector('.visitor-map-frame').style.display='block';});
  await orderingPage.waitForTimeout(100);
  await orderingPage.clock.fastForward(61000);
  await expect.poll(()=>orderingGets).toBe(4);
  await orderingPage.evaluate(()=>window.disposeMap());
  await orderingPage.clock.fastForward(61000);
  assert.equal(orderingGets,4,'disposed maps do not poll');
  await orderingPage.close();

  const statePage = await browser.newPage();
  let state = 'invalid';
  await statePage.route('**/api/**',route=>{
    if(route.request().method()!=='GET')return route.fulfill({json:{recorded:false}});
    const data = state==='invalid' ? {unexpected:true} : {
      ...fixture,locationStatus:state,current:null,currentIp:state==='invalid_address'?'not-an-address':state==='ipv6'?'2606:4700:4700::1111':fixture.currentIp,
      points:[...fixture.points,{label:'Invalid coordinate',lat:999,lon:10,visits:1}],
    };
    return route.fulfill({json:data});
  });
  await statePage.goto(`${base}/about.html`);
  await waitForPage(statePage,'/about.html');
  await statePage.locator('#visitor-map summary').click();
  await expect(statePage.locator('.visitor-status')).toContainText('could not be loaded');
  await expect(statePage.locator('.visitor-region')).toHaveCount(0);
  state='lookup_unavailable';
  await statePage.locator('[data-map-refresh]').click();
  await expect(statePage.locator('[data-visitor-current]')).toHaveText('Location temporarily unavailable');
  await expect(statePage.locator('.visitor-status')).toContainText('Refresh will retry');
  await expect(statePage.locator('.visitor-region')).toHaveCount(2);
  await expect(statePage.locator('[data-visitor-regions]')).toHaveText('2');
  await expect(statePage.locator('[data-visitor-ip]')).toHaveText(fixture.currentIp);
  await expect(statePage.locator('.visitor-world')).toHaveAttribute('viewBox','0 0 960 480');
  await expect(statePage.locator('[data-map-home]')).toBeDisabled();
  state='privacy';
  await statePage.locator('[data-map-refresh]').click();
  await expect(statePage.locator('[data-visitor-current]')).toHaveText('Privacy preference enabled');
  await expect(statePage.locator('.visitor-status')).toContainText('browser privacy preference');
  await expect(statePage.locator('.visitor-self')).toHaveCount(0);
  await expect(statePage.locator('[data-visitor-ip]')).toHaveText(fixture.currentIp);
  state='ipv6';
  await statePage.locator('[data-map-refresh]').click();
  await expect(statePage.locator('[data-visitor-ip]')).toHaveText('2606:4700:4700::1111');
  state='invalid_address';
  await statePage.locator('[data-map-refresh]').click();
  await expect(statePage.locator('[data-visitor-ip]')).toHaveText('Unavailable on this network');
  await statePage.close();
  for (const mode of ['normal', 'retry', 'dnt', 'gpc']) {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mode => {
      Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: mode === 'dnt' ? '1' : null });
      Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: mode === 'gpc' });
    }, mode);
    const writes = [];
    await page.route('**/*', route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/visitor-map.js') return route.fulfill({ contentType: 'text/javascript', body: moduleSource });
      if (pathname === '/api/visitors') {
        writes.push({ method: route.request().method(), body: route.request().postData() });
        return route.fulfill({ json: mode === 'retry' && writes.length === 1 ? {...fixture,current:null,recorded:false,locationStatus:'lookup_unavailable'} : { ...fixture, recorded: true } });
      }
      if (pathname === '/test') return route.fulfill({ contentType: 'text/html', body: '<script type="module">import {recordSiteVisit} from "/visitor-map.js";window.recordVisitForQA=recordSiteVisit;window.visitorModuleReady=true;</script>' });
      return route.abort();
    });
    await page.goto('http://portfolio-privacy.test/test');
    await page.waitForFunction(() => window.visitorModuleReady);
    await page.evaluate(async () => {
      await Promise.all([window.recordVisitForQA(), window.recordVisitForQA()]);
      await window.recordVisitForQA();
    });
    const expectedWrites = mode === 'retry' ? 2 : mode === 'normal' ? 1 : 0;
    assert.deepEqual(writes, Array.from({length:expectedWrites},()=>({method:'POST',body:'{}'})), `${mode} privacy mode has the expected write behavior`);
    results.push({ privacyMode: mode, writes: writes.length });
    await page.close();
  }
  assert.deepEqual(errors, [], 'visitor interactions and soft navigation produce no uncaught browser errors');
  console.log(JSON.stringify({ passed: true, failureRetry: true, initialVisitOrdering: true, malformedResponseRejected: true, locationStatuses: true, refreshLifecycle: true, results }, null, 2));
} finally {
  await browser.close();
}
