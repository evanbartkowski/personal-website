import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium,expect} from '@playwright/test';

const base=process.env.PORTFOLIO_QA_URL||'http://127.0.0.1:4173';
const cases=[
  {id:'mma',name:'mma-cipher',width:2540,height:1265,hash:'d5f2aa6b3310b1336e36449608d403d2ad43fbbc90111f0da839b711370491f9'},
  {id:'starlight',name:'starlight-fishing',width:2558,height:1195,hash:'a824e67812b58028f311f62ec682101c1657b9f91584b79e7877a5e7c67ec887'},
  {id:'seas',name:'seven-seas',width:1920,height:1080,hash:'ced4790ad57efa6a336e2057a0188ea8a35b67d2f6bd2ac01f8d89e28fe4829e'},
  {id:'jinx',name:'jinxkiss',width:2555,height:1212,hash:'dffa985ef857b0e1dea59cf7690b4768429250ba69f3e9ae825c6791ae3c9042'},
];
for(const item of cases){
  const original=await readFile(new URL(`../docs/artwork-originals/${item.name}-screenshot.png`,import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'),item.hash,`${item.name}: archive preserves the supplied PNG exactly`);
}
await mkdir('.artifacts',{recursive:true});
const executablePath=process.env.CHROME_PATH||join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executablePath)?{executablePath}:{channel:'chrome'}),headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[],results=[];
async function checkImage(image,item,container){
  await image.evaluate(element=>element.decode());
  const state=await image.evaluate(element=>{
    const css=getComputedStyle(element),box=element.getBoundingClientRect();
    return {path:new URL(element.currentSrc).pathname,width:element.naturalWidth,height:element.naturalHeight,fit:css.objectFit,filter:css.filter,transform:css.transform,opacity:css.opacity,renderWidth:box.width,renderHeight:box.height};
  });
  assert.equal(state.path,`/assets/artwork/${item.name}-screenshot.webp`);
  assert.equal(state.width,item.width);assert.equal(state.height,item.height);
  assert.equal(state.fit,'contain');assert.equal(state.filter,'none');assert.equal(state.transform,'none');assert.equal(state.opacity,'1');
  const frame=await container.boundingBox();
  assert.ok(state.renderWidth>0&&state.renderHeight>0);
  assert.ok(state.renderWidth<=frame.width+1,`${item.name}: image remains within its frame`);
}
try{
  for(const width of [1440,320]){
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Disabled during screenshot QA.'}}));
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/projects.html`,{waitUntil:'load'});
    await page.waitForFunction(()=>document.documentElement.dataset.navigationState==='idle');
    for(const item of cases){
      const button=page.locator(`.project-grid .project-art-button[data-project="${item.id}"]`);
      await expect(button).toHaveCount(1);await button.scrollIntoViewIfNeeded();
      await expect(button).toHaveClass(/project-screenshot/);
      await checkImage(button.locator('img'),item,button);
      await button.hover();await checkImage(button.locator('img'),item,button);
      await button.screenshot({path:`.artifacts/project-screenshot-${width}-${item.id}.png`});
      await button.click();
      const dialog=page.locator('#project-dialog');await expect(dialog).toHaveAttribute('open','');
      const modal=dialog.locator('.project-dialog-art');await checkImage(modal,item,dialog);
      assert.equal(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth),true,`${item.name}: modal has no horizontal overflow at ${width}px`);
      if(item.id==='mma'||item.id==='seas')await modal.screenshot({path:`.artifacts/project-modal-${width}-${item.id}.png`});
      await dialog.locator('.dialog-close').click();await expect(dialog).not.toHaveAttribute('open');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}px project page has no horizontal overflow`);
    results.push({width,cards:cases.length,modals:cases.length,imagesDecoded:true,completeImageContain:true,noColorFilters:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,originalPngHashes:'matched',results,pageErrors:errors},null,2));
}finally{await browser.close();}
