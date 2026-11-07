import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

const base = process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({...(existsSync(executablePath) ? {executablePath} : {channel:'chrome'}), headless:true});
const errors = [], results = [];
try {
  const context = await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Disabled during palette QA.'}}));
  await context.addInitScript(()=>localStorage.setItem('evan-portfolio-settings-v1',JSON.stringify({version:1,palette:'silver',color:'#b8c4cd',musicEnabled:false,muted:true,volume:.1})));
  const page = await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(()=>document.documentElement.dataset.navigationState==='idle');
  let previous;
  for(const palette of ['silver','default','amber','lavender','mint']) {
    await page.locator('.settings-launch').click();
    await page.locator(`input[name="settings-palette"][value="${palette}"]`).check();
    await page.locator('.settings-close').click();
    const tones = await page.evaluate(()=>{
      const selectors=['#hero-title','.hero-description','.hero-welcome'];
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const entries=selectors.map(selector=>{
        const value=getComputedStyle(document.querySelector(selector)).color;
        ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);
        const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3);
        const linear=rgb.map(value=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
        return {selector,rgb,contrast:(.2126*linear[0]+.7152*linear[1]+.0722*linear[2]+.05)/.05};
      });
      return {theme:document.documentElement.dataset.textTheme,entries};
    });
    assert.equal(tones.theme,palette);
    assert.ok(new Set(tones.entries.map(entry=>entry.rgb.join(','))).size>=3,'headings, copy and accents have related but distinct shades');
    for(const entry of tones.entries)assert.ok(entry.contrast>=4.5,`${palette} ${entry.selector} stays readable over black`);
    if(previous)assert.notDeepEqual(tones.entries.map(entry=>entry.rgb),previous,'supporting shades follow the selected palette');
    previous=tones.entries.map(entry=>entry.rgb);
    results.push({palette,distinctRoles:tones.entries.length,minimumContrast:Math.min(...tones.entries.map(entry=>entry.contrast))});
  }
  await context.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,results,pageErrors:errors}));
} finally {await browser.close();}
