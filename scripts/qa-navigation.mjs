import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({...(existsSync(executablePath) ? {executablePath} : {channel: 'chrome'}), headless: true, args: ['--enable-unsafe-swiftshader']});
const pages = {'/': '#home', '/about.html': '#about', '/experience.html': '#background', '/credentials.html': '#credentials', '/projects.html': '#work', '/blog.html': '#blog-main'};
const errors = [];
try {
  const context = await browser.newContext({viewport: {width: 1440, height: 950}});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  await page.locator('#header-mute').click();
  assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.muted), true);
  assert.equal(await page.locator('#site-settings').evaluate(dialog => dialog.open), false);
  await page.locator('.settings-launch').click();
  await page.waitForFunction(() => {const audio = document.querySelector('#portfolio-background-music'); return audio && !audio.paused && audio.currentTime > .15;});
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.__musicNode = document.querySelector('#portfolio-background-music');
    window.__musicHost = document.querySelector('#portfolio-music-player');
    window.__musicDecks = [...document.querySelectorAll('[data-music-deck]')];
    window.__musicEvents = [];
    for (const type of ['pause', 'emptied', 'loadstart']) window.__musicNode.addEventListener(type, () => window.__musicEvents.push(type));
    window.__persistentDocument = true;
  });
  const initialTime = await page.locator('#portfolio-background-music').evaluate(audio => audio.currentTime);
  const waitForPage = async path => {
    await page.waitForURL(base + path);
    await page.waitForFunction(({path, selector}) => document.documentElement.dataset.navigationState === 'idle' && location.pathname === path && !!document.querySelector(selector), {path, selector: pages[path]});
    await page.locator('.ambient-field canvas').waitFor();
    assert.equal(await page.locator('.ambient-field').count(), 1, 'one current celestial scene');
    assert.equal(await page.locator('.settings-launch').count(), 1, 'one settings button');
    assert.equal(await page.locator('#site-settings').count(), 1, 'one persistent settings dialog');
    assert.equal(await page.locator('#portfolio-music-player').count(),1,'one persistent player host');
    assert.equal(await page.locator('[data-music-deck]').count(),2,'two persistent crossfade decks');
    assert.equal(await page.evaluate(()=>document.querySelector('#portfolio-music-player')===window.__musicHost&&[...document.querySelectorAll('[data-music-deck]')].every((node,index)=>node===window.__musicDecks[index])),true,'both deck identities survive page replacement');
    assert.equal(await page.evaluate(() => document.querySelector('#portfolio-background-music') === window.__musicNode), true, 'audio identity is preserved');
    assert.equal(await page.evaluate(() => window.__persistentDocument), true, 'the browsing document is preserved');
    assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.paused), false, 'music remains playing');
    assert.equal(await page.locator('#portfolio-background-music').evaluate(audio => audio.muted), true);
    if (path !== '/blog.html') {
      assert.equal(await page.locator('#chat-dialog').count(), 1);
      assert.equal(await page.locator('#terminal-dialog').count(), 1);
      await page.keyboard.press('Control+k');
      assert.equal(await page.locator('#terminal-dialog').evaluate(dialog => dialog.open), true, 'current terminal handles the keyboard shortcut');
      await page.keyboard.press('Escape');
    } else assert.equal(await page.locator('#chat-dialog,#terminal-dialog').count(), 0, 'portfolio-only controls are disposed on the blog');
  };
  const visit = async path => {
    const selector = path === '/' ? 'header .brand, header .blog-brand' : `header nav a[href="${path}"]`;
    await page.locator(selector).first().click();
    await waitForPage(path);
  };
  for (let round = 0; round < 2; round++) for (const path of ['/experience.html', '/credentials.html', '/projects.html', '/about.html', '/blog.html', '/']) await visit(path);
  const finalTime = await page.locator('#portfolio-background-music').evaluate(audio => audio.currentTime);
  assert.ok(finalTime > initialTime + .2, 'real MP3 decoding advances while pages change');
  assert.deepEqual(await page.evaluate(() => window.__musicEvents), [], 'navigation never pauses, empties, or reloads the player');

  await page.goBack();
  await waitForPage('/blog.html');
  await page.goForward();
  await waitForPage('/');

  // A late response from an abandoned navigation must not replace the page
  // selected by the user's newer click.
  await page.route('**/experience.html', async route => {await new Promise(resolve => setTimeout(resolve, 250)); try {await route.continue();} catch { /* Request may have been canceled. */ }});
  await page.locator('.desktop-nav a[href="/experience.html"]').click();
  await page.locator('.brand').click();
  await page.waitForTimeout(400);
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.locator('#home').count(), 1);
  assert.deepEqual(await page.evaluate(() => window.__musicEvents), []);
  await page.unroute('**/experience.html');

  // Direct requests still work as independent pages, including reloads and
  // opening a link in a new browser tab.
  const direct = await context.newPage();
  direct.on('pageerror', error => errors.push(error.message));
  for (const path of Object.keys(pages)) {
    const response = await direct.goto(base + path);
    assert.equal(response.status(), 200);
    await direct.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
    assert.equal(await direct.locator(pages[path]).count(), 1);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({result: 'passed', audio: 'real muted MP3 keeps identity, decoding, and uninterrupted playback across 12 page changes and history navigation', lifecycle: 'one player, settings dialog, ambient field, and current keyboard handlers; no stale portfolio dialogs on blog', routing: 'distinct page content, real URLs, browser history, direct requests, and canceled stale fetches', pageErrors: errors}));
} finally {await browser.close();}
