import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { handleBlogRequest } from '../server/blog.mjs';

let fixture;
let fixtureDirectory;
let base = process.env.BASE_URL || 'http://127.0.0.1:4173';
if (process.argv.includes('--source')) {
  fixtureDirectory = await mkdtemp(join(tmpdir(),'evan-blog-browser-'));
  const source = resolve(import.meta.dirname,'..');
  const allowed = new Set(['/blog.html','/blog.js','/blog.css','/blog-data.js','/style.css','/cyber.css','/favicon.svg']);
  fixture = http.createServer(async (req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    if (await handleBlogRequest(req,res,pathname,{storagePath:join(fixtureDirectory,'posts.json')})) return;
    if (!allowed.has(pathname) && !/^\/assets\/fonts\/[a-zA-Z0-9.-]+$/.test(pathname)) {res.writeHead(404).end();return;}
    const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
    try {res.writeHead(200,{'Content-Type':types[extname(pathname)] || 'application/octet-stream'}).end(await readFile(resolve(source,'.'+pathname)));}
    catch {res.writeHead(pathname === '/cyber.css' ? 200 : 404).end();}
  });
  await new Promise(resolve => fixture.listen(0,'127.0.0.1',resolve));
  base = `http://127.0.0.1:${fixture.address().port}`;
}
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1243/chrome-win64/chrome.exe'),headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors = [];
page.on('pageerror',error => errors.push(error.message));
const slug = `qa-blog-${Date.now()}`;
const title = `QA temporary note ${slug}`;
let testId;
await mkdir('.artifacts',{recursive:true});
try {
  await page.goto(base + '/blog.html#write',{waitUntil:'load'});
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  await page.locator('#blog-editor[open]').waitFor();
  await page.locator('#post-title').fill(title);
  await page.locator('#post-slug').fill(slug);
  await page.locator('#post-category').selectOption('Security');
  await page.locator('#post-excerpt').fill('A temporary automated browser validation note.');
  await page.locator('#post-body').fill('# Browser validation\n\n**Persistence** and `safe rendering`.\n\n<img src=x onerror=alert(1)>\n\n- One item\n- Another item\n\n```js\nconsole.log("safe");\n```');
  await page.locator('#save-draft').click();
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent.startsWith('Draft saved'));
  const admin = await (await page.request.get(base + '/api/blog/admin')).json();
  const saved = admin.posts.find(post => post.slug === slug);
  assert(saved,'draft must be persisted on the server');
  testId = saved.id;
  assert.equal((await (await page.request.get(base + '/api/blog/posts')).json()).posts.some(post => post.slug === slug),false);
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  await page.locator('#blog-editor[open]').waitFor();
  await page.locator('#saved-posts button').filter({hasText:title}).click();
  assert.equal(await page.locator('#post-title').inputValue(),title,'draft survives reload');
  await page.locator('#preview-post').click();
  assert.equal(await page.locator('#editor-preview img').count(),0,'Markdown preview must escape HTML');
  assert.match(await page.locator('#editor-preview').textContent(),/<img src=x/);
  await page.locator('#preview-post').click();
  await page.screenshot({path:'.artifacts/blog-editor.png'});
  await page.locator('#publish-post').click();
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent.startsWith('Published.'));
  await page.locator('#blog-editor .blog-close').click();
  await page.locator('.blog-card h2 button').filter({hasText:title}).click();
  await page.locator('#post-reader[open]').waitFor();
  assert.equal(await page.locator('#post-reader-title').textContent(),title);
  assert.equal(await page.locator('#post-reader-body img').count(),0);
  assert.equal(await page.locator('#post-reader-body strong').textContent(),'Persistence');
  assert.equal(await page.locator('#post-reader-body li').count(),2);
  assert.match(await page.locator('#post-reader-body pre').textContent(),/console\.log/);
  await page.screenshot({path:'.artifacts/blog-post.png'});
  await page.locator('#post-reader .blog-close').click();
  for (const width of [320,390,768,1440,1920]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`blog overflow at ${width}`);
    await page.locator('#open-editor').click();
    assert.equal(await page.locator('#blog-editor').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth),true,`editor overflow at ${width}`);
    await page.locator('#blog-editor .blog-close').click();
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'.artifacts/blog-desktop.png',fullPage:true});
  await page.locator('#open-editor').click();
  await page.locator('#saved-posts button').filter({hasText:title}).click();
  await page.locator('#save-draft').click();
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent.startsWith('Draft saved'));
  assert.equal((await (await page.request.get(base + '/api/blog/posts')).json()).posts.some(post => post.slug === slug),false,'unpublish removes public entry');
  await page.locator('#delete-post').click();
  await page.locator('#confirm-delete').click();
  await page.waitForFunction(() => document.querySelector('#editor-status').textContent === 'Post deleted.');
  testId = null;
  const publicPage = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await publicPage.route('**/api/blog/admin',route => route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Public view'})}));
  await publicPage.goto(base + '/blog.html',{waitUntil:'load'});
  await publicPage.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  assert.equal(await publicPage.locator('#open-editor').isVisible(),false,'public view should not offer editing');
  await publicPage.screenshot({path:'.artifacts/blog-mobile.png',fullPage:true});
  assert.deepEqual(errors,[],'blog browser errors');
  console.log('PASS: Blog compose, draft privacy, reload persistence, safe Markdown, publish/unpublish/delete, public view, 320–1920px layouts.');
} finally {
  if (testId) await page.request.delete(base + `/api/blog/admin/posts/${testId}`,{headers:{Origin:base}}).catch(() => {});
  await browser.close();
  if (fixture) {
    fixture.closeAllConnections();
    await new Promise(resolve => fixture.close(resolve));
    assert(fixtureDirectory.startsWith(join(tmpdir(),'evan-blog-browser-')),'cleanup must stay within the explicitly created test directory');
    await rm(fixtureDirectory,{recursive:true,force:true});
  }
}
