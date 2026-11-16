import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { profile, projects } from '../content.js';
import { exportBlog } from './export-blog.mjs';
import { pages, renderHead, siteOrigin } from './site-seo.mjs';

const root = resolve(import.meta.dirname, '..');
const base = (process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const config = JSON.parse(await readFile(join(root, 'search.config.json'), 'utf8'));
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({...(existsSync(executablePath) ? {executablePath} : {channel: 'chrome'}), headless: true, args: ['--enable-unsafe-swiftshader']});
const errors = [];
let fixtureRoot;

async function request(path) {
  const response = await fetch(new URL(path, `${base}/`), {signal: AbortSignal.timeout(20000)});
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, `Public resource must return 200: ${path}`);
  return {body, type: response.headers.get('content-type') || ''};
}

async function inspectHead(page) {
  return page.evaluate(() => {
    const metas = {};
    for (const node of document.head.querySelectorAll('meta[name], meta[property]')) {
      const key = node.getAttribute('name') || node.getAttribute('property');
      (metas[key] ||= []).push(node.content);
    }
    return {
      title: document.title,
      titleCount: document.head.querySelectorAll('title').length,
      metas,
      canonicals: [...document.querySelectorAll('head link[rel="canonical"]')].map(node => node.getAttribute('href')),
      schemas: [...document.querySelectorAll('head script[type="application/ld+json"]')].map(node => JSON.parse(node.textContent)),
      icons: [...document.querySelectorAll('head link[rel="icon"], head link[rel="apple-touch-icon"]')].map(node => ({rel:node.rel, href:node.getAttribute('href'), sizes:node.getAttribute('sizes')})),
    };
  });
}

function checkHead(head, expected) {
  assert.equal(head.titleCount, 1, `One title on ${expected.path}`);
  assert.equal(head.title, expected.title);
  const canonical = new URL(expected.path, siteOrigin).href;
  assert.deepEqual(head.canonicals, [canonical], `Canonical on ${expected.path}`);
  for (const [name, values] of Object.entries(head.metas)) assert.equal(values.length, 1, `Duplicate ${name} on ${expected.path}`);
  const meta = name => head.metas[name]?.[0];
  assert.equal(meta('description'), expected.description);
  assert.match(meta('robots') || '', /\bindex,\s*follow\b/);
  assert.equal(meta('og:title'), expected.title);
  assert.equal(meta('twitter:title'), expected.title);
  assert.equal(meta('og:description'), expected.description);
  assert.equal(meta('twitter:description'), expected.description);
  assert.equal(meta('og:url'), canonical);
  assert.equal(meta('og:site_name'), profile.name);
  assert.equal(meta('og:type'), expected.article ? 'article' : 'website');
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('og:image'), `${siteOrigin}/assets/social-preview.png`);
  assert.equal(meta('twitter:image'), meta('og:image'));
  assert.equal(meta('og:image:width'), '1200');
  assert.equal(meta('og:image:height'), '630');
  assert.ok(meta('og:image:alt')?.includes(profile.name));
  assert.ok(meta('twitter:image:alt')?.includes(profile.name));
  assert.equal(head.schemas.length, 1);
  const schema = head.schemas[0];
  assert.equal(schema['@context'], 'https://schema.org');
  const graph = schema['@graph'];
  assert.ok(Array.isArray(graph));
  const person = graph.find(item => item['@type'] === 'Person');
  assert.equal(person?.name, profile.name);
  assert.equal(person?.jobTitle, profile.role);
  assert.equal(person?.worksFor?.name, profile.company);
  assert.equal(person?.alumniOf?.name, 'University of Maryland, Baltimore County');
  assert.ok(!JSON.stringify(person.alumniOf).includes('Georgia'), 'In-progress Georgia Tech study must not be claimed as completed alumni study');
  assert.ok(person.sameAs.includes(profile.github));
  assert.ok(person.sameAs.includes(profile.linkedin));
  const website = graph.find(item => item['@type'] === 'WebSite');
  assert.equal(website?.name, profile.name);
  assert.equal(website?.url, `${siteOrigin}/`);
  const logo = graph.find(item => item['@type'] === 'ImageObject' && item.width === 512 && item.height === 512);
  assert.equal(logo?.contentUrl, `${siteOrigin}/assets/brand/logo-512.png`);
  assert.equal(website?.image?.['@id'], logo?.['@id']);
  const webpage = graph.find(item => item.url === canonical && /Page$/.test(item['@type']));
  assert.equal(webpage?.name, expected.title);
  assert.equal(webpage?.isPartOf?.['@id'], website['@id']);
  assert.ok(head.icons.some(item => item.href === '/favicon.svg' && item.sizes === 'any'));
  assert.ok(head.icons.some(item => item.href === '/assets/brand/favicon-96.png' && item.sizes === '96x96'));
  assert.ok(head.icons.some(item => item.rel === 'apple-touch-icon' && item.sizes === '180x180'));
  if (expected.article) {
    const article = graph.find(item => item['@type'] === 'BlogPosting');
    assert.equal(article?.headline, expected.article.title);
    assert.equal(article?.url, canonical);
    assert.equal(article?.author?.['@id'], person['@id']);
    assert.ok(Number.isFinite(Date.parse(article.datePublished)));
    assert.ok(Number.isFinite(Date.parse(article.dateModified)));
  }
}

try {
  assert.equal(config.origin, siteOrigin);
  assert.equal(new Set(pages.map(page => page.title)).size, pages.length);
  assert.equal(new Set(pages.map(page => page.description)).size, pages.length);
  const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 1280, height: 850}});
  const page = await context.newPage();
  for (const expected of pages) {
    const response = await page.goto(`${base}${expected.path}`, {waitUntil: 'load'});
    assert.equal(response.status(), 200);
    checkHead(await inspectHead(page), expected);
    assert.equal(await page.locator('main h1').count(), 1);
    for (const destination of pages) assert.ok(await page.locator(`header a[href="${destination.path}"]`).count(), `Static navigation to ${destination.path} on ${expected.path}`);
    assert.equal(await page.locator('footer a:not([href]), footer a[href=""]').count(), 0, `Crawlable footer links on ${expected.path}`);
    if (expected.path !== '/blog.html') {
      assert.equal(await page.locator('footer [data-profile="email"]').getAttribute('href'), `mailto:${profile.email}`);
      assert.equal(await page.locator('footer [data-profile="github"]').getAttribute('href'), profile.github);
      assert.equal(await page.locator('footer [data-profile="linkedin"]').getAttribute('href'), profile.linkedin);
    }
    if (expected.path === '/experience.html') {
      const body = await page.locator('main').textContent();
      assert.match(body, /Georgia Institute\s*of Technology/);
      assert.match(body, /in progress/i);
      assert.match(body, /2028/);
      assert.match(body, /University of Maryland/);
    }
    if (expected.path === '/projects.html') {
      assert.equal(await page.locator('.project-card').count(), 8);
      for (const project of projects) {
        const card = page.locator('.project-card').filter({hasText: project.title});
        assert.equal(await card.count(), 1);
        assert.ok(await card.isVisible());
        assert.equal(await card.locator('.project-content>p').textContent(), project.description);
        if (project.url) assert.equal(await card.locator('a').getAttribute('href'), project.url);
      }
      await page.setViewportSize({width: 320, height: 800});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.setViewportSize({width: 1280, height: 850});
    }
  }

  for (const [path, width, height] of [['/assets/brand/logo-512.png',512,512], ['/assets/brand/favicon-96.png',96,96], ['/assets/brand/apple-touch-icon.png',180,180], ['/assets/social-preview.png',1200,630]]) {
    const {body, type} = await request(path);
    assert.match(type, /^image\/png(?:;|$)/);
    assert.equal(body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(body.readUInt32BE(16), width, `PNG width: ${path}`);
    assert.equal(body.readUInt32BE(20), height, `PNG height: ${path}`);
  }
  const favicon = await request('/favicon.svg');
  assert.match(favicon.type, /^image\/svg\+xml/);
  assert.match(favicon.body.toString(), /<svg\b/);

  const sitemapResource = await request('/sitemap.xml');
  assert.match(sitemapResource.type, /(?:application|text)\/xml/);
  const sitemap = await page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return {errors: doc.querySelectorAll('parsererror').length, namespace:doc.documentElement.namespaceURI, urls:[...doc.getElementsByTagName('loc')].map(node=>node.textContent)};
  }, sitemapResource.body.toString());
  assert.equal(sitemap.errors, 0, 'Valid sitemap XML');
  assert.equal(sitemap.namespace, 'http://www.sitemaps.org/schemas/sitemap/0.9');
  const publicData = (await request('/blog-data.js')).body.toString();
  const dataMatch = publicData.match(/^export const publishedPosts = ([\s\S]*);\s*$/);
  assert.ok(dataMatch, 'Published blog export must be a JSON-backed module');
  const publishedPosts = JSON.parse(dataMatch[1]);
  assert.ok(publishedPosts.every(post => post.status === 'published'));
  const expectedURLs = [...pages.map(item => new URL(item.path, siteOrigin).href), ...publishedPosts.map(post => `${siteOrigin}/blog/posts/${post.slug}.html`)];
  assert.deepEqual([...sitemap.urls].sort(), expectedURLs.sort());
  assert.equal(new Set(sitemap.urls).size, sitemap.urls.length);
  for (const url of sitemap.urls) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, siteOrigin);
    assert.ok(!parsed.search && !parsed.hash);
    assert.ok(!/^\/api\//.test(parsed.pathname) && !/^\/(?:blog\/editor|admin)(?:\/|$)/.test(parsed.pathname));
  }
  for (const post of publishedPosts) {
    const path = `/blog/posts/${post.slug}.html`;
    assert.equal((await page.goto(`${base}${path}`, {waitUntil:'load'})).status(), 200);
    const head = await inspectHead(page);
    checkHead(head, {title:`${post.title} — ${profile.name}`,description:head.metas.description[0],path,article:post});
    assert.equal(await page.locator('h1').textContent(), post.title);
    assert.ok(await page.locator('.prose').isVisible());
  }

  const robotsResource = await request('/robots.txt');
  assert.match(robotsResource.type, /^text\/plain/);
  const robots = robotsResource.body.toString();
  assert.match(robots, /^User-agent:\s*\*\s*$/im);
  assert.match(robots, /^Allow:\s*\/\s*$/im);
  assert.match(robots, /^Disallow:\s*\/api\/\s*$/im);
  assert.match(robots, /^Disallow:\s*\/blog\/editor\s*$/im);
  assert.ok(robots.includes(`Sitemap: ${siteOrigin}/sitemap.xml`));
  const blocked = [...robots.matchAll(/^Disallow:\s*(\S*)/gim)].map(match=>match[1]).filter(Boolean);
  for (const asset of ['/favicon.svg','/assets/brand/favicon-96.png','/assets/brand/logo-512.png','/assets/social-preview.png','/style.css','/app.js']) assert.ok(blocked.every(rule=>!asset.startsWith(rule)), `Crawlable asset: ${asset}`);
  assert.match(config.indexNowKey, /^[a-f0-9]{32}$/);
  const ownership = await request(`/${config.indexNowKey}.txt`);
  assert.match(ownership.type, /^text\/plain/);
  assert.equal(ownership.body.toString().trim(), config.indexNowKey, 'Public ownership key must match search configuration');

  const interactive = await browser.newContext({viewport: {width:1280,height:850},reducedMotion:'reduce'});
  const nav = await interactive.newPage();
  nav.on('pageerror', error => errors.push(error.message));
  await nav.goto(`${base}/`, {waitUntil:'load'});
  await nav.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  const documentMarker = await nav.evaluate(() => window.__seoDocumentMarker = crypto.randomUUID());
  for (const expected of [...pages.slice(1),pages[0]]) {
    await nav.locator(`header a[href="${expected.path}"]`).first().click();
    await nav.waitForFunction(path => location.pathname === path && document.documentElement.dataset.navigationState === 'idle', expected.path);
    assert.equal(await nav.evaluate(() => window.__seoDocumentMarker), documentMarker, 'SEO navigation must retain its document');
    checkHead(await inspectHead(nav), expected);
  }
  assert.deepEqual(errors, [], 'No page errors during metadata navigation');
  await interactive.close();

  fixtureRoot = await mkdtemp(join(root, '.artifacts/seo-blog-fixture-'));
  const output = join(fixtureRoot, 'dist');
  const fixture = {status:'published',slug:'seo-fixture',title:'Systems <script>unsafe()</script>',category:'Engineering',excerpt:'Public fixture for safe rendering.',body:'# Safe systems\n\n<img src=x onerror=unsafe()>\n\n**Evidence** with [source](https://example.com/).\n\n- First point\n- Second point\n\n```js\nconsole.log("<script>");\n```',publishedAt:'2026-11-03T14:00:00.000Z',createdAt:'2026-11-03T14:00:00.000Z',updatedAt:'2026-11-04T14:00:00.000Z'};
  const draft = {...fixture,status:'draft',slug:'private-draft',title:'PRIVATE_DRAFT_MUST_NOT_EXPORT',body:'PRIVATE_DRAFT_MUST_NOT_EXPORT'};
  const callbackCalls = [];
  const exported = await exportBlog({root:fixtureRoot,output,posts:[fixture,draft],renderHead:details=>{callbackCalls.push(details);return renderHead(details,config);}});
  assert.deepEqual(exported.articlePaths, ['/blog/posts/seo-fixture.html']);
  assert.equal(callbackCalls.length, 1);
  assert.equal(callbackCalls[0].article, fixture);
  assert.ok(!exported.postsMarkup.includes('PRIVATE_DRAFT_MUST_NOT_EXPORT'));
  const article = await readFile(join(output,'blog/posts/seo-fixture.html'),'utf8');
  assert.ok(!article.includes('PRIVATE_DRAFT_MUST_NOT_EXPORT'));
  assert.ok(!article.includes('<img src=x'));
  assert.ok(article.includes('&lt;img src=x onerror=unsafe()&gt;'));
  await assert.rejects(exportBlog({root:fixtureRoot,output,posts:[{...fixture,slug:'../unsafe'}],renderHead}), /unsafe/);
  await assert.rejects(exportBlog({root:fixtureRoot,output,posts:[fixture,fixture],renderHead}), /unique/);
  await page.route('**/__seo-fixture-index.html', route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><html lang="en"><head><title>Public notes</title></head><body>${exported.postsMarkup}</body></html>`}));
  await page.route('**/blog/posts/seo-fixture.html', route=>route.fulfill({status:200,contentType:'text/html',body:article}));
  await page.goto(`${base}/__seo-fixture-index.html`,{waitUntil:'load'});
  assert.equal(await page.locator('.blog-card').count(), 1);
  assert.equal(await page.locator('.blog-card h2 a').getAttribute('href'), exported.articlePaths[0]);
  await page.locator('.blog-card h2 a').click();
  await page.waitForURL('**/blog/posts/seo-fixture.html');
  checkHead(await inspectHead(page), callbackCalls[0]);
  assert.equal(await page.locator('h1').textContent(), fixture.title);
  assert.equal(await page.locator('.prose strong').textContent(), 'Evidence');
  assert.equal(await page.locator('.prose li').count(), 2);
  assert.equal(await page.locator('.prose pre').count(), 1);
  assert.equal(await page.locator('.prose img, .prose script, .prose svg').count(), 0, 'Authored Markdown never creates executable markup');
  assert.equal(await page.locator('body script').count(), 0, 'Static articles require no executable body scripts');
  assert.equal(await page.locator('.prose a').getAttribute('href'), 'https://example.com/');
  await page.setViewportSize({width:320,height:800});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await context.close();
  console.log(JSON.stringify({result:'SEO checks passed',base,pages:pages.length,articles:publishedPosts.length,checks:['unique metadata','canonical and social tags','structured identity and logo','PNG dimensions','no-JS navigation/projects','sitemap and robots','public ownership key','soft-navigation metadata','published-only safe article export']},null,2));
} finally {
  await browser.close();
  if (fixtureRoot) await rm(fixtureRoot,{recursive:true,force:true});
}
