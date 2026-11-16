import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Background audio can keep requests active after the page is ready.
// Wait for load and assert the relevant UI instead of waiting for network idle.
const artifacts = '.artifacts';
await mkdir(artifacts, { recursive: true });
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({ ...(existsSync(executablePath) ? { executablePath } : { channel: 'chrome' }), headless: true, args: ['--enable-unsafe-swiftshader'] });
const base = process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173';
const errors = [];
const failures = [];
const documents = [
  { path: '/', section: 'home' },
  { path: '/experience.html', section: 'background' },
  { path: '/credentials.html', section: 'credentials' },
  { path: '/projects.html', section: 'work' },
  { path: '/about.html', section: 'about' },
];
const navigationPaths = ['/about.html', '/experience.html', '/credentials.html', '/projects.html', '/blog.html'];
const sceneNames = {
  '/': 'orbital-frontier',
  '/about.html': 'lunar-archive',
  '/experience.html': 'gravity-well',
  '/credentials.html': 'stellar-forge',
  '/projects.html': 'expedition-belt',
  '/blog.html': 'violet-remnant',
};
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
async function track(target, label = '') {
  await target.route('**/api/**', route => route.fulfill({status: 503, json: {error: 'Disabled during general QA.', trackingDisabled: true, recorded: false}}));
  target.on('pageerror', error => errors.push(`${label}${error.message}`));
  target.on('response', response => { if (response.status() >= 400 && !response.url().includes('/api/')) failures.push(`${response.status()} ${response.url()}`); });
}
await track(page);
async function verifyDocument(target, document) {
  await target.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  await target.locator(`main #${document.section}`).waitFor();
  assert.equal(new URL(target.url()).pathname, document.path);
  assert.equal(await target.locator(`main #${document.section}`).count(), 1, `${document.path} has its own content`);
  for (const other of documents) if (other.section !== document.section) assert.equal(await target.locator(`main #${other.section}`).count(), 0, `${document.path} does not stack ${other.section}`);
  assert.equal((await target.locator('.brand').innerText()).replace(/\s/g, '').toLowerCase(), 'evanbartkowski');
  assert.equal(await target.locator('.brand-monogram,.brand small,.brand svg').count(), 0, 'full name without monogram or subtitle');
  assert.equal(await target.locator('.site-header').evaluate(node => Math.round(node.getBoundingClientRect().width)), target.viewportSize().width, 'full-width header');
  assert.equal(await target.locator('footer#contact').count(), 1);
  assert.match(await target.locator('.studio-credit').textContent(), /MESACHI/);
  assert.equal(await target.locator('.footer-row > :first-child').evaluate(node => node.classList.contains('studio-credit')), true, 'Mesachi occupies the left side of the footer');
  assert.equal(await target.locator('.back-top').count(), 0, 'footer no longer includes a back-to-top link');
  assert.equal(await target.locator('#terminal-dialog,#project-dialog,#certificate-dialog').count(), 3, 'shared dialogs on every portfolio document');
  assert.equal(await target.locator('.chat-launch').count() > 0, true, 'shared AI entrypoint');
  assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no overflow on ${document.path}`);
  assert.equal(await target.locator('.desktop-nav a[href^="#"]').count(), 0, 'top tabs use document URLs');
  assert.deepEqual(await target.locator('.desktop-nav a').evaluateAll(nodes => nodes.map(node => new URL(node.href).pathname)), navigationPaths, 'Blog follows Projects at the end of the document tabs');
  assert.equal(await target.locator('.blog-tab').count(), 0, 'Blog uses the main navigation rather than a separate header button');
  for (const entry of documents.filter(entry => entry.path !== '/')) assert.equal(await target.locator(`.desktop-nav a[href="${entry.path}"]`).count(), 1, `navigation includes ${entry.path}`);
  if (document.path !== '/') {
    assert.equal(await target.locator(`.desktop-nav a[href="${document.path}"]`).getAttribute('aria-current'), 'page');
    assert.equal(await target.locator('.desktop-nav a[aria-current="page"]').count(), 1, 'exactly one active page tab');
  }
}
async function navigateTab(path) {
  await page.evaluate(() => { window.__oldPortfolioDocument = true; window.__oldPortfolioMain = document.querySelector('main'); });
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().resourceType() === 'fetch'),
    page.locator(`.desktop-nav a[href="${path}"]`).click(),
  ]);
  await page.waitForURL(`**${path}`);
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  assert.equal(response.status(), 200, `fetched document navigation ${path}`);
  assert.equal(await page.evaluate(() => window.__oldPortfolioDocument), true, 'the music document persists across tabs');
  assert.equal(await page.evaluate(() => window.__oldPortfolioMain === document.querySelector('main')), false, 'each tab replaces the main content');
  await verifyDocument(page, documents.find(document => document.path === path));
}
try {
  const homeResponse = await page.goto(base, { waitUntil: 'load' });
  assert.equal(homeResponse.status(), 200);
  await page.locator('#reactor canvas').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await verifyDocument(page, documents[0]);
  assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(0, 0, 0)');
  assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).getPropertyValue('--green').trim()), '#849bab');
  assert.match(await page.locator('h1').evaluate(node => getComputedStyle(node).fontFamily), /\bBarlow\b/, 'the display type uses the Barlow theme');
  assert.equal(await page.evaluate(() => document.fonts.check('700 24px Barlow')), true, 'Barlow loads from the local font asset');
  assert.equal(await page.locator('.title-period,.brand-period,.ambient-grain,.blog-teaser,.signal-strip,#reactor-mode,#motion-toggle,.reactor-label').count(), 0);
  assert.equal(await page.locator('#toolkit,.toolkit-item').count(), 0, 'Skills stays off the home page');
  assert.equal(await page.locator('#reactor').getAttribute('data-architecture'), 'orbital-rings', 'Dyson uses broad orbital bands');
  assert.equal(await page.locator('#reactor').getAttribute('data-orbital-bands'), '5', 'five interlocking ring structures');
  assert.ok(Number(await page.locator('#reactor').getAttribute('data-collector-panels')) > 150, 'detailed collector surfaces within the rings');
  assert.equal(await page.locator('#reactor').getAttribute('data-protrusions'), '0', 'smooth ring silhouettes have no exterior spikes');
  assert.ok(Number(await page.locator('#reactor').getAttribute('data-hull-inlays')) > 150, 'flush hull detailing keeps the ring surfaces intricate');
  assert.equal(await page.locator('#reactor').getAttribute('data-satellites'), '3', 'three detailed orbiting satellites');
  assert.equal(await page.locator('#reactor').getAttribute('data-plasma-plumes'), '6', 'six small solar wisps');
  assert.match(await page.locator('h1').innerText(), /Hello, I.m Evan/);
  assert.doesNotMatch(await page.locator('.hero-copy').innerText(), /BARTKOWSKI/i, 'the hero uses a personal introduction rather than repeating the full-name brand');
  assert.equal(await page.locator('.hero-copy').evaluate(node => getComputedStyle(node).textAlign), 'center', 'the introduction is centered between the two artworks');
  assert.equal(await page.locator('#portrait-launch').getAttribute('aria-controls'), 'portrait-conversation');
  assert.equal(await page.locator('.lab-disclosure').count(), 0, 'the home action is a direct Terminal control');
  assert.equal(await page.locator('.career-strip img, .career-symbol, .career-arrow').count(), 0, 'career panes use centered text without illustrations');
  for (const card of await page.locator('.career-strip > a').all()) assert.equal(await card.evaluate(node=>getComputedStyle(node).textAlign), 'center');
  const field = page.locator('.ambient-field canvas');
  const before = await field.evaluate(node => node.toDataURL());
  await page.waitForTimeout(200);
  assert.notEqual(await field.evaluate(node => node.toDataURL()), before, 'background animates');
  await page.mouse.move(400, 300);
  assert.equal(await page.locator('.ambient-field').evaluate(node => node.style.getPropertyValue('--pointer-x')), '400px');
  assert.equal(await page.locator('.pointer-aura').evaluate(node => getComputedStyle(node).width), '110px');
  assert.match(await page.locator('.pointer-aura').evaluate(node => getComputedStyle(node).backgroundImage), /143, 213, 255/, 'soft light-blue cursor glow');
  assert.equal(await page.locator('.pointer-aura').evaluate(node => getComputedStyle(node,'::before').content), 'none', 'cursor has no crosshair');
  assert.equal(await page.locator('.pointer-aura').evaluate(node => getComputedStyle(node).pointerEvents), 'none', 'cursor glow never blocks controls');
  const blackRatio = await field.evaluate(node => {
    const data = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
    let black = 0, total = 0;
    for (let y = 0; y < node.height; y += 20) for (let x = 0; x < node.width; x += 20) {
      const index = (y * node.width + x) * 4;
      total++;
      if (Math.max(data[index], data[index + 1], data[index + 2]) < 8) black++;
    }
    return black / total;
  });
  assert.ok(blackRatio > .9, 'celestial field remains predominantly black');
  const beforeScroll = await field.evaluate(node => node.toDataURL());
  await page.evaluate(() => scrollTo(0, 600));
  await page.waitForTimeout(100);
  assert.notEqual(await field.evaluate(node => node.toDataURL()), beforeScroll, 'celestial scroll parallax');
  const pdf = await page.request.get(base + '/assets/Evan-Bartkowski-Resume.pdf');
  assert.equal(pdf.status(), 200);
  assert.match(pdf.headers()['content-type'], /application\/pdf/);
  assert.deepEqual(await pdf.body(), await readFile('assets/Evan-Bartkowski-Resume.pdf'));
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: join(artifacts, 'desktop.png') });

  await navigateTab('/experience.html');
  await page.waitForFunction(() => document.querySelector('.ambient-field')?.dataset.celestialPositions);
  await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
  await page.waitForTimeout(80);
  const skyBefore = await page.locator('.ambient-field').evaluate(node => JSON.parse(node.dataset.celestialPositions));
  assert.equal(await page.locator('.ambient-field').getAttribute('data-celestial-scene'), sceneNames['/experience.html']);
  assert.match(await page.locator('.ambient-field').getAttribute('data-celestial-bodies-visible'), /black-hole/, 'the experience scene begins with its gravity well visible');
  await page.evaluate(() => scrollTo({top:700,behavior:'instant'}));
  await page.waitForFunction(before => {
    const positions = document.querySelector('.ambient-field')?.dataset.celestialPositions;
    return positions && before - JSON.parse(positions)['black-hole'] > 500;
  }, skyBefore['black-hole'], {timeout: 3000});
  const skyAfter = await page.locator('.ambient-field').evaluate(node => JSON.parse(node.dataset.celestialPositions));
  assert.ok(skyBefore['black-hole']-skyAfter['black-hole']>500, 'the primary scene body travels through document depth');
  assert.doesNotMatch(await page.locator('.ambient-field').getAttribute('data-celestial-bodies-visible'), /black-hole/, 'the gravity well scrolls out of view');
  assert.equal(await page.locator('#toolkit-title').textContent(), 'Skills');
  assert.equal(await page.locator('.skills-disclosure').evaluate(node=>node.open), false, 'Skills starts collapsed');
  await page.locator('.skills-disclosure > summary').click();
  assert.equal(await page.locator('.skills-disclosure').evaluate(node=>node.open), true, 'Skills expands with its native summary');
  assert.equal(await page.locator('#background-title').textContent(), 'Experience');
  assert.match(await page.locator('.school-projects summary').textContent(), /College projects/);
  assert.equal(await page.locator('.programs-disclosure').evaluate(node => node.open), false, 'Programs starts collapsed');
  assert.match(await page.locator('.programs-disclosure > summary').textContent(), /Programs \/ Other/);
  assert.equal(await page.locator('.school-projects').evaluate(node => node.nextElementSibling?.classList.contains('programs-disclosure')), true, 'Programs follows College projects');
  await page.locator('.programs-disclosure > summary').click();
  assert.match(await page.locator('.programs-disclosure .training-record').innerText(), /AI4ALL Ignite[\s\S]*18 weeks[\s\S]*September 8, 2024/);
  await page.locator('.programs-disclosure > summary').click();
  assert.equal(await page.locator('.skill-domain').count(), 8);
  assert.ok(await page.locator('.skill-list li').count() >= 70, 'skills are individually listed with substantially broader coverage');
  assert.equal(await page.locator('.skill-art img').count(), 0, 'skill section has image icons removed');
  assert.match(await page.locator('.education-record').first().textContent(), /IN PROGRESS[\s\S]*EXPECTED DECEMBER 2028/);
  assert.match(await page.locator('.education-record').last().textContent(), /GRADUATED MAY 2025[\s\S]*Dean's List · Fall 2024/);
  assert.equal(await page.locator('.education-links a[href="/assets/credentials/umbc-certificate.pdf"]').count(), 1, 'academic recognition links to its original document');
  assert.equal(await page.locator('.experience-history').evaluate(node => node.open), false);
  assert.equal(await page.locator('.school-projects').evaluate(node => node.open), false);
  await page.locator('.experience-history summary').click();
  assert.equal(await page.locator('.timeline-item:visible').count(), 4);
  await page.locator('.experience-history summary').click();
  await page.locator('.school-projects summary').click();
  assert.equal(await page.locator('.research-link:visible').count(), 2);
  await page.locator('.school-projects summary').click();
  await page.locator('.college-projects-link').click();
  assert.equal(await page.locator('.school-projects').evaluate(node => node.open), true, 'the education evidence link opens college projects');
  await page.locator('.school-projects summary').click();
  await page.locator('#background').screenshot({ path: join(artifacts, 'experience.png') });
  await navigateTab('/credentials.html');
  assert.equal(await page.locator('.document-card').count(), 11);
  await page.goBack({ waitUntil: 'load' });
  await verifyDocument(page, documents[1]);
  await page.goForward({ waitUntil: 'load' });
  await verifyDocument(page, documents[2]);
  const reloaded = await page.reload({ waitUntil: 'load' });
  assert.equal(reloaded.status(), 200);
  await verifyDocument(page, documents[2]);

  await navigateTab('/projects.html');
  assert.equal(await page.locator('.project-card').count(), 8);
  for(const [id,file,width,height] of [
    ['mma','mma-cipher-screenshot',2540,1265],
    ['jinx','jinxkiss-screenshot',2555,1212],
    ['hours','hours',1536,1024],
    ['rail','rail',1536,1024],
    ['starlight','starlight-fishing-screenshot',2558,1195],
    ['seas','seven-seas-screenshot',1920,1080],
    ['cops','bad-cops',1536,1024],
    ['jurassic','jurassic-domination',1536,1024],
  ]) {
    const art=page.locator(`[data-project="${id}"] img`).first();
    await art.scrollIntoViewIfNeeded();
    await art.evaluate(node=>node.decode());
    assert.equal(await art.getAttribute('src'),`/assets/artwork/${file}.webp`);
    const response=await page.request.get(base+`/assets/artwork/${file}.webp`);
    assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/image\/webp/);
    assert.ok(await art.evaluate((node,{width,height})=>node.naturalWidth===width&&node.naturalHeight===height,{width,height}),'original-resolution project image');
    if(file.endsWith('-screenshot')) assert.equal(await art.evaluate(node=>getComputedStyle(node).objectFit),'contain','supplied screenshot is shown without cropping');
  }
  for (const [id, title] of [['mma', 'MMA Cipher'], ['jinx', 'JinxKiss'], ['hours', 'Small Hours'], ['rail', 'DREADRAIL'], ['starlight', 'Starlight Fishing'], ['seas', 'Seven Seas'], ['cops', 'Bad Cops'], ['jurassic', 'Jurassic Domination']]) {
    await page.locator(`[data-project="${id}"]`).first().click();
    assert.equal(await page.locator('#project-dialog-title').textContent(), title);
    if (id === 'starlight') assert.equal(await page.locator('#project-dialog .button-primary').getAttribute('href'), 'https://starlight-fishing.web.app');
    if (id === 'seas') assert.equal(await page.locator('#project-dialog .button-primary').getAttribute('href'), 'https://github.com/evanbartkowski/Seven-Seas-Game');
    await page.keyboard.press('Escape');
  }
  await page.locator('#work').screenshot({ path: join(artifacts, 'projects.png') });
  await navigateTab('/about.html');
  assert.match(await page.locator('#about').textContent(), /CyberMaxx/);
  assert.equal(await page.locator('.about-fact').count(), 3, 'About retains the job and both degree summaries');
  assert.equal(await page.locator('.about-fact img,.about-fact svg,.about-fact-art,.about-fact-arrow').count(), 0, 'About background summaries use centered text without artwork');
  for (const card of await page.locator('.about-fact').all()) assert.equal(await card.evaluate(node => getComputedStyle(node).textAlign), 'center');
  await page.locator('#contact').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.footer-socials [data-profile="email"]').getAttribute('href'), 'mailto:evan.bartkowski@icloud.com');
  assert.equal(await page.locator('#copy-email,.footer-copyright,.footer-identity > span').count(), 0, 'footer keeps only requested identity and social links');
  assert.ok(await page.locator('#contact').evaluate(node => node.getBoundingClientRect().height) < 220, 'compact social footer');

  // A direct request must serve each document, rather than relying on a
  // previous home-page visit or a hash-only router.
  const titles = new Set();
  for (const document of documents) {
    const response = await page.goto(base + document.path, { waitUntil: 'load' });
    assert.equal(response.status(), 200, `direct load ${document.path}`);
    await verifyDocument(page, document);
    titles.add(await page.title());
  }
  assert.equal(titles.size, documents.length, 'each page has its own document title');
  // Freeze time and pointer input so different pixels prove different scenes,
  // rather than comparing two frames of the same animated starfield.
  const sceneProbe = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await track(sceneProbe, 'scene: ');
  const observedScenes = new Set();
  const scenePixels = new Set();
  for (const [path, expectedScene] of Object.entries(sceneNames)) {
    const response = await sceneProbe.goto(base + path, { waitUntil: 'load' });
    assert.equal(response.status(), 200, `scene document ${path}`);
    await sceneProbe.waitForFunction(() => document.querySelector('.ambient-field')?.dataset.celestialScene && document.querySelector('.ambient-field canvas')?.width > 0);
    const snapshot = await sceneProbe.locator('.ambient-field').evaluate(node => {
      const canvas = node.querySelector('canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 28) for (let color = 0; color < 3; color++) hash = Math.imul(hash ^ pixels[index + color], 16777619);
      return { name: node.dataset.celestialScene, layers: JSON.parse(node.dataset.celestialLayers), fingerprint: (hash >>> 0).toString(16) };
    });
    assert.equal(snapshot.name, expectedScene, `the intended scene loads on ${path}`);
    assert.ok(snapshot.layers.length >= 4, 'scene contains several distinct celestial layers');
    observedScenes.add(snapshot.name);scenePixels.add(snapshot.fingerprint);
  }
  assert.equal(observedScenes.size, 6, 'all six pages have different celestial scenes');
  assert.equal(scenePixels.size, 6, 'all six static scene canvases render different images');
  await sceneProbe.close();
  const blogLink = page.locator('.site-header a[href="/blog.html"]').first();
  await Promise.all([page.waitForURL('**/blog.html'), blogLink.click()]);
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  assert.equal(new URL(page.url()).pathname, '/blog.html');
  assert.equal(await page.locator('#blog-main,#blog-posts').count(), 2);
  assert.equal(await page.locator('a[href="/blog.html"][aria-current="page"]').count() >= 1, true);

  await page.goto(base, { waitUntil: 'load' });
  await page.locator('#reactor canvas').waitFor();
  await page.evaluate(() => document.querySelector('#reactor canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await page.locator('#reactor>svg').waitFor();
  assert.match(await page.locator('#reactor>svg').getAttribute('aria-label'), /Dyson/);
  await page.keyboard.press('Control+k');
  assert.equal(await page.locator('#terminal-dialog').evaluate(node => node.open), true);
  await page.keyboard.press('Escape');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await track(mobile, 'mobile: ');
  await mobile.goto(base, { waitUntil: 'load' });
  await mobile.locator('.ambient-field canvas').waitFor();
  const still = await mobile.locator('.ambient-field canvas').evaluate(node => node.toDataURL());
  await mobile.waitForTimeout(200);
  assert.equal(await mobile.locator('.ambient-field canvas').evaluate(node => node.toDataURL()), still, 'reduced-motion background stays still');
  await mobile.screenshot({ path: join(artifacts, 'mobile.png') });
  await mobile.locator('.menu-toggle').click();
  await mobile.locator('#mobile-nav a[href="/projects.html"]').click();
  await mobile.waitForURL('**/projects.html');
  await mobile.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  assert.equal(await mobile.locator('#mobile-nav').isVisible(), false);
  for (const width of [320, 390, 768, 1024, 1920]) {
    await mobile.setViewportSize({ width, height: 900 });
    await mobile.waitForTimeout(80);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    assert.equal(await mobile.locator('.site-header').evaluate(node => Math.round(node.getBoundingClientRect().width)), width);
    assert.ok(await mobile.locator('.header-actions').evaluate(node => node.getBoundingClientRect().right) <= width - 10, `header controls fit ${width}px`);
    if (await mobile.locator('.menu-toggle').isVisible()) {
      await mobile.locator('.menu-toggle').click();
      assert.equal(await mobile.locator('#mobile-nav a[href="/blog.html"]').isVisible(), true, `Blog is reachable in the menu at ${width}px`);
      assert.deepEqual(await mobile.locator('#mobile-nav a').evaluateAll(nodes => nodes.map(node => new URL(node.href).pathname).filter(path => path !== '/')), navigationPaths, 'Blog stays last after Projects in the mobile menu');
      await mobile.locator('.menu-toggle').click();
    } else assert.equal(await mobile.locator('.desktop-nav a[href="/blog.html"]').isVisible(), true, `Blog is visible in the desktop navigation at ${width}px`);
  }
  await mobile.setViewportSize({ width: 390, height: 844 });
  for (const document of documents.slice(1)) {
    await mobile.goto(base + document.path, { waitUntil: 'load' });
    await verifyDocument(mobile, document);
  }
  const fallback = await browser.newPage();
  await track(fallback, 'fallback: ');
  await fallback.route('**/vendor/**', route => route.abort());
  await fallback.goto(base, { waitUntil: 'load' });
  await fallback.locator('#reactor>svg').waitFor();
  assert.match(await fallback.locator('#reactor>svg').getAttribute('aria-label'), /Dyson/);
  await fallback.keyboard.press('Control+k');
  assert.equal(await fallback.locator('#terminal-dialog').evaluate(node => node.open), true);
  assert.deepEqual(errors, [], 'browser JavaScript errors');
  assert.deepEqual(failures, [], 'broken assets');
  console.log('PASS: Separate-page navigation with Blog last, direct URLs, reload/back/forward, active tabs, full-name branding, Barlow typography, unique content, shared controls, original resume, project dossiers, experience disclosures, mobile 320–1920px, six distinct celestial scenes, motion, three Dyson satellites and surface wisps, fallbacks, and zero browser errors.');
} finally { await browser.close(); }
