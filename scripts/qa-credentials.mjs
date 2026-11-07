import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { credentialDocuments } from '../credential-data.js';

await mkdir('.artifacts',{recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1243/chrome-win64/chrome.exe'),headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
const page = await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173';
const credentialsURL=base+'/credentials.html';
await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Disabled during credential QA.'}}));
if(process.env.CREDENTIALS_QA_SOURCE==='1') {
  const source=await readFile('credentials.css','utf8');
  await page.route('**/credentials.css*',route=>route.fulfill({contentType:'text/css',body:source}));
}
await page.addInitScript(()=>{
  localStorage.setItem('evan-portfolio-settings-v1',JSON.stringify({version:1,palette:'silver',color:'#b8c4cd',musicEnabled:false,muted:true,volume:.1}));
});
const choosePalette=async palette=>{
  await page.locator('.settings-launch').click();
  await page.locator(`input[name="settings-palette"][value="${palette}"]`).check();
  await page.locator('.settings-close').click();
};
const documentColors=()=>page.evaluate(()=>{
  const properties=(selector,names)=>{const css=getComputedStyle(document.querySelector(selector));return Object.fromEntries(names.map(name=>[name,css[name]]));};
  return {
    card:properties('.document-card',['backgroundColor','backgroundImage','borderTopColor']),
    preview:properties('.document-preview',['backgroundColor','backgroundImage','borderTopColor']),
    title:properties('.document-caption h3',['color']),
    dialog:properties('#certificate-dialog',['backgroundColor','backgroundImage','borderTopColor']),
    paper:properties('.certificate-image-wrap',['backgroundColor','backgroundImage','borderTopColor']),
    certificate:properties('.certificate-image-wrap img',['filter']),
  };
});
try {
  await page.goto(credentialsURL,{waitUntil:'load'});
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  assert.equal(new URL(page.url()).pathname,'/credentials.html');
  assert.equal(await page.locator('main #background,main #work,main #about,main #home').count(),0,'credential archive has its own page');
  assert.equal(await page.locator('.document-card').count(),11);
  for(const record of credentialDocuments){
    const pdf=await page.request.get(base+record.pdf);
    assert.equal(pdf.status(),200,record.pdf);
    assert.match(pdf.headers()['content-type'],/application\/(?:pdf|octet-stream)/);
    assert.deepEqual(await pdf.body(),await readFile('.'+record.pdf),'PDF must be the original asset');
    const image=await page.request.get(base+record.preview);
    assert.equal(image.status(),200,record.preview);
    const png=await image.body();
    assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(png.readUInt32BE(16),1100);
  }
  await page.locator('#credentials').scrollIntoViewIfNeeded();
  await page.locator('[data-document-direction="next"]').click();
  await page.waitForFunction(()=>document.querySelector('.document-track').scrollLeft>100);
  await expect(page.locator('[data-document-direction="previous"]')).toBeEnabled();
  await page.locator('[data-document-filter="certification"]').click();
  assert.equal(await page.locator('.document-card:not([hidden])').count(),5);
  await expect(page.locator('[data-document-direction="previous"]')).toBeDisabled();
  await page.locator('.document-track [data-document="security-plus"]').first().click();
  await page.locator('#certificate-dialog[open]').waitFor();
  assert.equal(await page.locator('#certificate-dialog-title').textContent(),'CompTIA Security+');
  assert.match(await page.locator('.certificate-modal-note').textContent(),/March 22, 2028/);
  const downloadEvent=page.waitForEvent('download');
  await page.locator('#certificate-dialog a[download]').first().click();
  const download=await downloadEvent;
  assert.equal(download.suggestedFilename(),'Evan-Bartkowski-CompTIA-Security-Plus.pdf');
  assert.deepEqual(await readFile(await download.path()),await readFile('assets/credentials/comptia-security-plus.pdf'));
  await page.screenshot({path:'.artifacts/certificate-viewer.png'});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#certificate-dialog').evaluate(d=>d.open),false);
  let fixedPalette;
  for(const palette of ['silver','default','amber','lavender','mint']) {
    await choosePalette(palette);
    await page.locator('.document-track [data-document="security-plus"]').first().click();
    await expect(page.locator('#certificate-dialog')).toHaveAttribute('open','');
    const current=await documentColors();
    if(!fixedPalette)fixedPalette=current;
    else assert.deepEqual(current,fixedPalette,`${palette}: certificate card, paper, text and modal colors remain independent of the site theme`);
    assert.equal(current.certificate.filter,'none','original certificate colors are never filtered');
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-document-filter="learning"]').click();
  assert.equal(await page.locator('.document-card:not([hidden])').count(),4);
  await page.locator('.document-track [data-document="security-training"]').first().click();
  assert.match(await page.locator('.certificate-modal-note').textContent(),/40-hour/);
  await page.keyboard.press('Control+k');
  assert.equal(await page.locator('#certificate-dialog').evaluate(d=>d.open),false);
  await page.locator('#terminal-input').fill('credentials');
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).pathname,'/credentials.html');
  assert.equal(new URL(page.url()).hash,'#credentials');
  await page.locator('[data-document-filter="honor"]').click();
  assert.equal(await page.locator('.document-card:not([hidden])').count(),2);
  await page.locator('.document-track [data-document="deans-list"]').first().click();
  assert.match(await page.locator('.certificate-modal-note').textContent(),/Fall 2024/);
  await page.locator('#certificate-dialog .dialog-close').click();
  await page.locator('.document-track [data-document="nscs"]').first().click();
  assert.match(await page.locator('.certificate-modal-note').textContent(),/February 9, 2022/);
  assert.equal(await page.locator('#certificate-dialog a[download]').count(),2,'NSCS original JPG and PDF');
  await page.locator('#certificate-dialog .dialog-close').click();
  // The issued-certification summary belongs to the experience document, while
  // its proof viewer remains available through the shared page controls.
  await page.goto(base+'/experience.html',{waitUntil:'load'});
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  let fixedSummary;
  for(const palette of ['silver','default','amber','lavender']) {
    await choosePalette(palette);
    const summary=await page.locator('.credential-panel').evaluate(panel=>{
      const css=getComputedStyle(panel),badge=getComputedStyle(panel.querySelector('.badge-shield'));
      return {background:css.backgroundImage,border:css.borderTopColor,color:css.color,badgeFill:badge.fill,badgeStroke:badge.stroke};
    });
    if(!fixedSummary)fixedSummary=summary;
    else assert.deepEqual(summary,fixedSummary,`${palette}: experience certification panel keeps its own palette`);
  }
  await page.locator('.credential-proof[data-document="security-plus"]').click();
  assert.equal(await page.locator('#certificate-dialog-title').textContent(),'CompTIA Security+');
  await page.keyboard.press('Escape');
  await page.goto(credentialsURL,{waitUntil:'load'});
  await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle');
  await page.locator('[data-document-filter="all"]').click();
  await page.locator('.document-track').focus();
  await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('.document-track').scrollLeft>500);
  await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('.document-track').scrollLeft<2);
  await page.evaluate(()=>document.activeElement?.blur());
  await page.locator('#credentials').screenshot({path:'.artifacts/credential-archive-desktop.png'});
  for(const width of [320,390,768,1024,1920]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))) console.log(await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.document-track')&&!e.closest('.signal-strip')).map(e=>({cls:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,60)})).slice(0,12)})));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}px`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#credentials').screenshot({path:'.artifacts/credential-archive-mobile.png'});
  await page.locator('.document-track [data-document="security-plus"]').first().click();
  const box=await page.locator('#certificate-dialog').boundingBox();
  assert.ok(box.x>=0 && box.x+box.width<=390,'mobile modal fits viewport');
  await page.screenshot({path:'.artifacts/certificate-viewer-mobile.png'});
  await page.keyboard.press('Escape');
  const nojs=await browser.newPage({javaScriptEnabled:false});
  await nojs.goto(credentialsURL);
  assert.equal(await nojs.locator('#credentials noscript a').count(),11);
  assert.deepEqual(errors,[]);
  console.log('PASS: Seven original PDFs/previews; fixed certificate colors across five themes; category filters; carousel buttons/keyboard; certificate modal/download; source proof link; terminal shortcut; NSCS deduplication; no-JS links; responsive 320–1920px.');
} finally {await browser.close();}
