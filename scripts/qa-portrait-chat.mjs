// All API paths are intercepted: this suite never consumes AI quota, records
// visitors, or writes to the public arcade leaderboard.
import assert from 'node:assert/strict';
import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {chromium, expect} from '@playwright/test';

const base = (process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({...(existsSync(executablePath) ? {executablePath} : {channel: 'chrome'}), headless: true, args: ['--enable-unsafe-swiftshader']});
const errors = [], layoutResults = [];
mkdirSync('.artifacts', {recursive: true});

async function prepare(page) {
  const mock = {available: true, statusCalls: 0, payloads: [], states: [], queue: [], pending: [], reply: 'I build security systems and thoughtful software. <img src=x onerror=alert(1)> This is an AI portfolio response about Evan’s public work.'};
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__portraitChatAborts = 0;
    window.__portraitAIStates = [];
    document.addEventListener('portrait:aistatechange', event => window.__portraitAIStates.push(event.target?.dataset?.aiState), true);
    const fetch = window.fetch;
    window.fetch = function(input, options = {}) {
      if (String(input).includes('/api/chat') && options.method === 'POST') options.signal?.addEventListener('abort', () => window.__portraitChatAborts++, {once: true});
      return fetch.apply(this, arguments);
    };
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/status') {mock.statusCalls++; return route.fulfill({json: {available: mock.available}});}
    if (path !== '/api/chat') return route.fulfill({status: 503, json: {error: 'Disabled during portrait chat QA.', trackingDisabled: true, recorded: false}});
    const payload = route.request().postDataJSON();
    mock.payloads.push(payload);
    mock.states.push(await page.locator('#portrait').getAttribute('data-ai-state'));
    assert.ok(payload.messages.length <= 11, 'request has at most five complete history pairs plus the current question');
    assert.ok(payload.messages.every(message => typeof message.content === 'string' && message.content.length <= 2000));
    assert.ok(payload.messages.reduce((total, message) => total + message.content.length, 0) <= 11000);
    assert.ok(new TextEncoder().encode(JSON.stringify(payload)).byteLength <= 23000);
    payload.messages.forEach((message, index) => assert.equal(message.role, index % 2 ? 'assistant' : 'user'));
    const response = mock.queue.shift() || {reply: mock.reply};
    if (response.hold) await new Promise(resolve => mock.pending.push(resolve));
    try {await route.fulfill({status: response.status || 200, json: response.json || {reply: response.reply || mock.reply}});} catch (error) {
      if (!/closed|disposed|intercepted|Invalid InterceptionId|aborted/i.test(error.message)) throw error;
    }
  });
  return mock;
}
async function ready(page, path = '/') {
  await page.goto(base + path);
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  if (path === '/') await expect(page.locator('#portrait')).toHaveAttribute('data-state', 'ready');
  await page.evaluate(() => document.fonts.ready);
}
const state = (page, value) => expect(page.locator('#portrait')).toHaveAttribute('data-ai-state', value);
const responseTexts = page => page.locator('.portrait-message-assistant .message-text');
async function send(page, question) {
  await page.locator('#portrait-chat-input').fill(question);
  await page.locator('#portrait-chat-input').press('Enter');
}
async function fullReply(page, count, text) {
  await expect(responseTexts(page)).toHaveCount(count);
  await expect(responseTexts(page).last()).toHaveText(text, {timeout: 8000});
  await state(page, 'idle');
}
async function settledFrame(page) {
  await page.evaluate(async () => {await document.fonts.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
}
async function pageLayout(page) {
  return page.evaluate(() => {
    const box = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,bottom:r.bottom+scrollY};};
    return {scrollHeight:document.documentElement.scrollHeight,hero:box('.hero-layout'),career:box('.career-strip'),terminal:box('main .terminal-launch'),footer:box('.site-footer')};
  });
}
function assertStableLayout(before, after, label) {
  assert.ok(Math.abs(after.scrollHeight-before.scrollHeight)<=1,`${label}: chat cannot expand the document (${before.scrollHeight} to ${after.scrollHeight})`);
  for(const selector of ['hero','career','terminal','footer'])for(const field of ['x','y','width','height']){
    assert.ok(Math.abs(after[selector][field]-before[selector][field])<=1,`${label}: ${selector}.${field} remains fixed (${before[selector][field]} to ${after[selector][field]})`);
  }
}
async function overlayBounds(page) {
  return page.evaluate(() => {
    const host=document.querySelector('#portrait-conversation'),face=document.querySelector('#portrait-launch'),log=document.querySelector('#portrait-chat-messages');
    const h=host.getBoundingClientRect(),f=face.getBoundingClientRect();
    const controls=['#portrait-chat-input','#portrait-chat-send','#portrait-chat-close'].map(selector=>{
      const node=document.querySelector(selector),r=node.getBoundingClientRect(),x=Math.min(innerWidth-1,Math.max(0,r.x+r.width/2)),y=Math.min(innerHeight-1,Math.max(0,r.y+r.height/2));
      return {selector,width:r.width,height:r.height,inside:r.left>=h.left-1&&r.right<=h.right+1&&r.top>=h.top-1&&r.bottom<=h.bottom+1,hit:node.contains(document.elementFromPoint(x,y))};
    });
    return {x:h.x+scrollX,y:h.y+scrollY,width:h.width,height:h.height,overlapsFace:h.left<f.right&&h.right>f.left&&h.top<f.bottom&&h.bottom>f.top,overflow:document.documentElement.scrollWidth>innerWidth,internalOverflow:host.scrollWidth>host.clientWidth+1,logHeight:log.clientHeight,logScrollHeight:log.scrollHeight,controls};
  });
}
const canvasLight = page => page.locator('.portrait-canvas').evaluate(canvas => {
  const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
  const context=copy.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0);
  const data=context.getImageData(0,0,copy.width,copy.height).data;
  let alpha=0,light=0,red=0,green=0,blue=0;
  for(let i=0;i<data.length;i+=4){const a=data[i+3]/255;alpha+=a;red+=data[i]*a;green+=data[i+1]*a;blue+=data[i+2]*a;light+=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)*a;}
  return {alpha,light,color:[red/alpha,green/alpha,blue/alpha]};
});

try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1050}, reducedMotion: 'no-preference'});
  const mock = await prepare(page); await ready(page);
  assert.equal(mock.statusCalls, 0, 'chat availability is checked only after opening the face or AI action');
  assert.equal(mock.payloads.length, 0);
  await expect(page.locator('#portrait-conversation')).toBeHidden();
  await expect(page.locator('#portrait-launch')).toHaveAttribute('aria-expanded', 'false');
  const initialLayout=await pageLayout(page);
  await page.locator('#portrait-launch').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#portrait-conversation')).toBeVisible();
  assertStableLayout(initialLayout,await pageLayout(page),'animated chat opening');
  await expect(page.locator('#portrait-launch')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#portrait-chat-status')).toContainText(/ready/i);
  assert.match(await page.locator('#portrait-conversation').innerText(), /AI/i, 'the portrait identifies its responses as AI');
  await expect(page.locator('#chat-dialog')).not.toBeVisible();
  await expect(page.locator('#portrait-chat-input')).toHaveAttribute('maxlength', '2000');
  await page.locator('#portrait-chat-input').fill('   '); await page.locator('#portrait-chat-input').press('Enter');
  assert.equal(mock.payloads.length, 0, 'whitespace cannot generate a request');
  await page.locator('#portrait-chat-input').fill('A multiline question'); await page.locator('#portrait-chat-input').press('Shift+Enter');
  assert.match(await page.locator('#portrait-chat-input').inputValue(), /\n/, 'Shift+Enter preserves multiline editing');
  mock.queue.push({hold: true});
  await send(page, 'What do you build?'); await state(page, 'thinking');
  await expect(page.locator('.portrait-chat-pending')).toBeVisible();
  await expect(page.locator('#portrait-chat-send')).toBeDisabled();
  await expect(page.locator('#portrait-chat-input')).toBeDisabled();
  await expect.poll(() => mock.pending.length).toBe(1);
  assert.equal(await responseTexts(page).count(), 0, 'pending network replies do not display invented assistant text');
  mock.pending.shift()();
  await state(page, 'responding');
  await expect(responseTexts(page)).toHaveCount(1);
  await expect.poll(() => responseTexts(page).last().textContent()).not.toBe('');
  const typed = await responseTexts(page).last().textContent();
  assert.ok(typed.length < mock.reply.length, 'the reply appears character by character over the portrait');
  assertStableLayout(initialLayout,await pageLayout(page),'partial typewriter reply');
  await fullReply(page, 1, mock.reply);
  assertStableLayout(initialLayout,await pageLayout(page),'completed typewriter reply');
  assert.equal(await page.locator('.portrait-message-assistant img').count(), 0, 'model HTML is rendered as safe text');
  await expect(page.locator('.portrait-chat-pending')).toHaveCount(0);
  await page.locator('#portrait-chat-close').click(); await expect(page.locator('#portrait-conversation')).toBeHidden();
  await page.locator('.chat-launch').first().click(); await expect(page.locator('#portrait-conversation')).toBeVisible();
  assert.equal(await responseTexts(page).count(), 1, 'closing and reopening preserves completed conversation');
  assert.equal(mock.payloads.length, 1, 'opening the AI never sends an automatic question');
  await expect(page.locator('#chat-dialog')).not.toBeVisible();

  // Reduced motion retains state feedback without progressive text animation.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state', 'paused');
  mock.reply = 'I study defensive engineering. ' + 'Security '.repeat(330);
  await send(page, 'Tell me about your experience.'); await fullReply(page, 2, mock.reply);
  assert.equal(mock.payloads[1].messages.length, 3, 'follow-up includes the complete previous turn');
  for (let turn = 3; turn <= 8; turn++) {
    await send(page, `Question ${turn}: ` + '🌊'.repeat(450));
    await fullReply(page, turn, mock.reply);
  }
  assert.ok(mock.payloads.at(-1).messages.length < 16, 'long conversations discard oldest complete turns within the byte budget');
  mock.queue.push({status: 502, json: {error: 'Test response unavailable'}});
  await send(page, 'Please retry this specific question.'); await state(page, 'error');
  await expect(page.locator('.portrait-chat-retry')).toBeVisible();
  const usersBeforeRetry = await page.locator('.portrait-message-user').count();
  await page.locator('.portrait-chat-retry').click(); await fullReply(page, 9, mock.reply);
  assert.equal(await page.locator('.portrait-message-user').count(), usersBeforeRetry, 'retry does not duplicate a user question');
  assert.equal(mock.payloads.at(-1).messages.at(-1).content, 'Please retry this specific question.');
  for (const response of [{status: 429, json: {error: 'Busy'}}, {status: 503, json: {code: 'billing_required', error: 'Test provider is unavailable.'}}, {json: {reply: '   '}}]) {
    mock.queue.push(response); await send(page, 'Exercise a recoverable error.');
    await state(page, 'error'); await expect(page.locator('.portrait-chat-retry').last()).toBeVisible();
    await expect(page.locator('#portrait-chat-send')).toBeEnabled();
  }

  // A pending response is aborted on close and cannot update the reopened UI.
  const completedBeforeClose = await responseTexts(page).count();
  mock.queue.push({hold: true, reply: 'This late result must never appear.'});
  await send(page, 'Close while thinking.'); await state(page, 'thinking');
  await expect.poll(() => mock.pending.length).toBe(1);
  const abortsBeforeClose = await page.evaluate(() => window.__portraitChatAborts);
  await page.locator('#portrait-chat-close').click(); await state(page, 'idle');
  assert.ok(await page.evaluate(() => window.__portraitChatAborts) > abortsBeforeClose, 'closing aborts the actual in-flight fetch');
  mock.pending.shift()(); await page.waitForTimeout(100);
  await page.locator('#portrait-launch').click();
  assert.equal(await responseTexts(page).count(), completedBeforeClose, 'late closed response does not append an assistant message');

  // The static reduced-motion portrait visibly acknowledges a pending question.
  await page.setViewportSize({width:1440,height:1600});
  await page.locator('#portrait').scrollIntoViewIfNeeded();
  await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  const idlePortrait = await page.locator('.portrait-canvas').evaluate(canvas => canvas.toDataURL());
  mock.queue.push({hold: true}); await send(page, 'Show a quiet thinking state.'); await state(page, 'thinking');
  await expect.poll(() => mock.pending.length).toBe(1);
  await expect.poll(() => page.locator('.portrait-canvas').evaluate(canvas => canvas.toDataURL())).not.toBe(idlePortrait);
  mock.pending.shift()(); await fullReply(page, completedBeforeClose + 1, mock.reply);
  assert.ok((await page.evaluate(() => window.__portraitAIStates)).includes('thinking'));
  await page.locator('#portrait-chat-close').click();
  await page.setViewportSize({width:1440,height:1050});

  // This control launches only the shell; chat remains attached to the robot.
  assert.equal(await page.locator('.lab-disclosure').count(), 0);
  const terminalControl = page.locator('main .terminal-launch');
  assert.equal((await terminalControl.innerText()).replace(/[>_↗\s]/g,''), 'Terminal');
  await terminalControl.click(); await expect(page.locator('#terminal-dialog[open]')).toBeVisible();
  await expect(page.locator('#portrait-conversation')).toBeHidden();
  await page.keyboard.press('Escape');

  await page.locator('#portrait-launch').click();
  mock.queue.push({hold: true, reply: 'This old page response must never appear.'});
  await send(page, 'Navigate while thinking.'); await state(page, 'thinking');
  await expect.poll(() => mock.pending.length).toBe(1);
  await page.evaluate(() => {window.__oldPortrait = document.querySelector('#portrait'); window.__oldConversation = document.querySelector('#portrait-conversation');});
  const abortsBeforeNavigation = await page.evaluate(() => window.__portraitChatAborts);
  await page.locator('.desktop-nav a[href="/about.html"]').click();
  await page.waitForFunction(() => location.pathname === '/about.html' && document.documentElement.dataset.navigationState === 'idle');
  assert.ok(await page.evaluate(() => window.__portraitChatAborts) > abortsBeforeNavigation, 'document navigation aborts portrait requests');
  assert.equal(await page.evaluate(() => window.__oldPortrait.dataset.motionState), 'disposed');
  const oldText = await page.evaluate(() => window.__oldConversation.textContent);
  mock.pending.shift()(); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__oldConversation.textContent), oldText, 'late results cannot mutate a detached conversation');
  await page.locator('.chat-launch').first().click(); await expect(page.locator('#chat-dialog[open]')).toBeVisible();
  await page.locator('#chat-dialog .dialog-close').click();
  await page.locator('.brand').click(); await expect(page.locator('#portrait')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#portrait-conversation')).toBeHidden();
  await expect(page.locator('#portrait-chat-messages .portrait-message-assistant')).toHaveCount(0);
  assert.equal(await page.locator('#portrait-launch').count(), 1, 'returning home mounts one fresh controller');
  await page.close();

  // A fresh browser with unavailable chat offers a status retry and no POSTs.
  const unavailable = await browser.newPage({viewport: {width: 390, height: 900}, reducedMotion: 'reduce'});
  const unavailableMock = await prepare(unavailable); unavailableMock.available = false;
  await ready(unavailable); await unavailable.locator('#portrait-launch').click();
  await expect(unavailable.locator('#portrait-chat-status')).toContainText(/unavailable|could not|connect/i);
  await expect(unavailable.locator('#portrait-chat-send')).toBeDisabled();
  assert.equal(unavailableMock.payloads.length, 0);
  unavailableMock.available = true; await unavailable.locator('#portrait-chat-reconnect').click();
  await expect(unavailable.locator('#portrait-chat-send')).toBeEnabled();
  unavailableMock.queue.push({reply: 'A reduced-motion reply appears in full.'});
  await send(unavailable, 'Hello'); await fullReply(unavailable, 1, 'A reduced-motion reply appears in full.');
  await unavailable.close();

  const typingClose = await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'no-preference'});
  const typingMock = await prepare(typingClose); await ready(typingClose);
  typingMock.reply = 'A completed response is preserved when you close the typing presentation. ' + 'Engineering '.repeat(65);
  await typingClose.locator('#portrait-launch').click(); await send(typingClose,'Close during the typed reply.');
  await state(typingClose,'responding');
  await typingClose.locator('#portrait-chat-close').click(); await state(typingClose,'idle');
  await typingClose.locator('#portrait-launch').click();
  await expect(responseTexts(typingClose).last()).toHaveText(typingMock.reply);
  await typingClose.emulateMedia({reducedMotion:'reduce'});
  await send(typingClose,'A follow-up after closing the reply.'); await fullReply(typingClose,2,typingMock.reply);
  assert.equal(typingMock.payloads[1].messages[1].content,typingMock.reply,'closing the typing presentation preserves full completed history');
  await typingClose.close();

  // The face itself dims and changes hue. Inspect the raw canvas, independently
  // of the translucent conversation surface that sits in front of it.
  const colorPage=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  await prepare(colorPage);await ready(colorPage);await settledFrame(colorPage);
  const closedLight=await canvasLight(colorPage);
  await colorPage.locator('#portrait-launch').click();await settledFrame(colorPage);
  await expect(colorPage.locator('#portrait')).toHaveAttribute('data-chat-open','true');
  const openLight=await canvasLight(colorPage);
  assert.ok(openLight.light<closedLight.light*.92,'opening the overlay visibly dims the actual face artwork');
  assert.ok(Math.hypot(...openLight.color.map((value,index)=>value-closedLight.color[index]))>8,'opening the overlay changes the painted face tint');
  await colorPage.keyboard.press('Escape');await settledFrame(colorPage);
  await expect(colorPage.locator('#portrait-conversation')).toBeHidden();
  await expect(colorPage.locator('#portrait')).toHaveAttribute('data-chat-open','false');
  await expect(colorPage.locator('#portrait-launch')).toBeFocused();
  const restoredLight=await canvasLight(colorPage);
  assert.ok(Math.abs(restoredLight.light-closedLight.light)<closedLight.light*.01,'closing restores the still portrait brightness');
  await colorPage.close();

  for (const width of [1440, 1280, 1024, 760, 390, 320]) {
    const layoutPage = await browser.newPage({viewport: {width, height: 1000}, reducedMotion: 'reduce'});
    const layoutMock=await prepare(layoutPage); await ready(layoutPage);await settledFrame(layoutPage);
    const layout = await layoutPage.evaluate(() => {
      const rect = selector => {const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};};
      return {width:innerWidth, overflow:document.documentElement.scrollWidth>innerWidth, copy:rect('.hero-copy'), face:rect('#portrait-launch'), dyson:rect('.reactor-panel'), title:rect('#hero-title'), textAlign:getComputedStyle(document.querySelector('.hero-copy')).textAlign};
    });
    assert.equal(layout.overflow, false, `${width}px has no page overflow`);
    assert.equal(layout.textAlign, 'center', 'the introduction is centered');
    if (width >= 1024) {
      assert.ok(Math.abs(layout.copy.cx-width/2)<2, `${width}px biography is centered in the viewport`);
      assert.ok(layout.face.cx<layout.copy.cx&&layout.dyson.cx>layout.copy.cx, 'the portrait and Dyson flank the biography');
      assert.ok(Math.abs((layout.copy.cx-layout.face.cx)-(layout.dyson.cx-layout.copy.cx))<5, 'left and right artwork have symmetric centers');
    }
    const beforeOpen=await pageLayout(layoutPage);
    await layoutPage.locator('#portrait-launch').click();await settledFrame(layoutPage);
    await expect(layoutPage.locator('#portrait-conversation')).toBeVisible();
    assertStableLayout(beforeOpen,await pageLayout(layoutPage),`${width}px open`);
    assert.equal(await layoutPage.evaluate(() => document.documentElement.scrollWidth<=innerWidth), true, `${width}px open chat fits the page`);
    assert.equal(await layoutPage.locator('#portrait-conversation').evaluate(node=>node.scrollWidth<=node.clientWidth+1), true, 'the conversation has no internal horizontal overflow');
    for (const selector of ['#portrait-chat-input','#portrait-chat-send','#portrait-chat-close']) await expect(layoutPage.locator(selector)).toBeVisible();
    const opened=await overlayBounds(layoutPage);
    assert.equal(opened.overlapsFace,true,`${width}px conversation overlays the portrait`);
    assert.equal(opened.internalOverflow,false);
    for(const control of opened.controls){assert.ok(control.inside,`${width}px ${control.selector} stays inside the overlay`);assert.ok(control.hit,`${width}px ${control.selector} receives pointer input`);}
    layoutMock.reply='A long, safely wrapped AI response. '+('Security engineering, Linux systems, and careful implementation. '.repeat(150));
    await send(layoutPage,'Give a long explanation to exercise transcript scrolling.');await fullReply(layoutPage,1,layoutMock.reply);await settledFrame(layoutPage);
    assertStableLayout(beforeOpen,await pageLayout(layoutPage),`${width}px long reply`);
    const answered=await overlayBounds(layoutPage);
    assert.ok(Math.abs(answered.height-opened.height)<=1&&Math.abs(answered.y-opened.y)<=1,`${width}px transcript growth leaves the overlay size and position unchanged`);
    assert.ok(answered.logHeight>20&&answered.logScrollHeight>answered.logHeight,`${width}px long replies scroll inside the bounded transcript`);
    assert.equal(answered.overflow,false);
    for(const control of answered.controls)assert.ok(control.inside&&control.hit,`${width}px ${control.selector} remains usable after a long reply`);
    if (width===1440||width===390) await layoutPage.screenshot({path:`.artifacts/portrait-chat-${width}.png`,fullPage:true});
    await layoutPage.keyboard.press('Escape');await settledFrame(layoutPage);
    await expect(layoutPage.locator('#portrait-conversation')).toBeHidden();await expect(layoutPage.locator('#portrait-launch')).toBeFocused();
    assertStableLayout(beforeOpen,await pageLayout(layoutPage),`${width}px closed`);
    const terminalGap=beforeOpen.footer.y-beforeOpen.terminal.bottom;
    assert.ok(terminalGap>=(width>760?60:45),`${width}px leaves open sky between Terminal and the footer (${terminalGap}px)`);
    layoutResults.push({...layout,overlay:{width:opened.width,height:opened.height},terminalGap});
    await layoutPage.close();
  }
  const footerResults=[];
  for(const viewport of [{width:1440,height:1400},{width:390,height:1200}])for(const path of ['/','/about.html','/experience.html','/credentials.html','/projects.html','/blog.html']){
    const footerPage=await browser.newPage({viewport,reducedMotion:'reduce'});await prepare(footerPage);await ready(footerPage,path);await settledFrame(footerPage);
    const metrics=await footerPage.evaluate(()=>{
      const footer=document.querySelector('.site-footer'),main=document.querySelector('main'),r=footer.getBoundingClientRect(),m=main.getBoundingClientRect();
      const content=[...main.children].filter(node=>getComputedStyle(node).display!=='none'&&getComputedStyle(node).position!=='absolute').map(node=>node.getBoundingClientRect().bottom+scrollY);
      return {viewport:innerHeight,scrollHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,footerTop:r.top+scrollY,footerBottom:r.bottom+scrollY,mainBottom:m.bottom+scrollY,contentBottom:Math.max(m.top+scrollY,...content),position:getComputedStyle(footer).position};
    });
    assert.equal(metrics.overflow,false,`${viewport.width}px ${path} has no horizontal overflow`);
    assert.ok(metrics.footerBottom>=viewport.height-1,`${path} footer reaches the viewport bottom on a short page`);
    assert.ok(Math.abs(metrics.footerBottom-metrics.scrollHeight)<=2,`${path} footer ends at the document bottom`);
    assert.ok(metrics.footerTop>=metrics.contentBottom-2,`${path} footer follows page content`);
    assert.notEqual(metrics.position,'fixed',`${path} footer remains in normal flow on long pages`);
    footerResults.push({path,width:viewport.width,...metrics});await footerPage.close();
  }
  assert.ok(mock.states.every(value=>value==='thinking'), 'each request is accompanied by the portrait thinking state');
  assert.deepEqual(errors, [], 'no browser errors');
  console.log(JSON.stringify({result:'Portrait conversation checks passed',base,mockedChatRequests:mock.payloads.length,layoutResults,footerResults,faceLight:{closed:closedLight,open:openLight},checks:['centered symmetric hero','keyboard and header face entrypoints','safe progressive response text','thinking artwork including reduced motion','bounded complete history','availability and retry','close and navigation aborts','terminal-only home control','responsive overlay without page expansion','actual face dim and tint','bounded long transcripts','normal flow sticky footer']},null,2));
} finally {await browser.close();}
