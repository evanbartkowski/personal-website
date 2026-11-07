import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

const base=process.env.PORTFOLIO_QA_URL||'http://127.0.0.1:4173';
const executablePath=process.env.CHROME_PATH||join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executablePath)?{executablePath}:{channel:'chrome'}),headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[],results=[];
try {
  for(const width of [1440,320]) {
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Disabled during chrome QA.'}}));
    if(process.env.CHROME_QA_SOURCE==='1')for(const file of ['navigation-layout.css','footer.css']) {
      const source=await readFile(file,'utf8');
      await context.route(`**/${file}*`,route=>route.fulfill({contentType:'text/css',body:source}));
    }
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    for(const path of ['/','/blog.html']) {
      await page.goto(base+path,{waitUntil:'load'});
      await page.waitForFunction(()=>document.documentElement.dataset.navigationState==='idle'&&document.querySelector('.ambient-field canvas')?.width>0);
      for(const selector of ['.site-header,.blog-header','.site-footer']) {
        const surface=page.locator(selector);
        await surface.scrollIntoViewIfNeeded();
        const state=await surface.evaluate(element=>{
          const css=getComputedStyle(element),rect=element.getBoundingClientRect();
          return {background:css.backgroundColor,image:css.backgroundImage,blur:css.backdropFilter,shadow:css.boxShadow,left:rect.left,right:rect.right};
        });
        assert.equal(state.background,'rgba(0, 0, 0, 0)',`${path} ${selector}: no opaque strip`);
        assert.equal(state.image,'none');assert.equal(state.blur,'none');assert.equal(state.shadow,'none');
        assert.ok(state.left>=-.5&&state.right<=width+.5);
        // Isolate the bar's compositing from its text/icons for one capture.
        // The actual starfield and bar stay unchanged; an opaque bar still
        // fails this comparison even though the background canvas exists.
        await surface.evaluate(element=>{
          element.__chromeChildren=[...element.children].map(child=>({child,value:child.style.visibility,priority:child.style.getPropertyPriority('visibility')}));
          for(const {child} of element.__chromeChildren)child.style.setProperty('visibility','hidden','important');
        });
        const candidates=await surface.evaluate(element=>{
          const canvas=document.querySelector('.ambient-field canvas'),rect=element.getBoundingClientRect();
          const bounds=canvas.getBoundingClientRect(),sx=canvas.width/bounds.width,sy=canvas.height/bounds.height;
          const ctx=canvas.getContext('2d'),data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          const result=[];
          for(let y=Math.max(4,Math.ceil(rect.top)+4);y<Math.min(innerHeight-4,rect.bottom-4);y++)for(let x=8;x<innerWidth-8;x++) {
            const px=Math.min(canvas.width-1,Math.floor((x-bounds.left)*sx)),py=Math.min(canvas.height-1,Math.floor((y-bounds.top)*sy));
            const offset=(py*canvas.width+px)*4,rgb=[data[offset],data[offset+1],data[offset+2]];
            if(Math.max(...rgb)<12)continue;
            if(result.some(point=>Math.hypot(point.x-x,point.y-y)<12))continue;
            result.push({x,y,rgb});if(result.length===12)return result;
          }
          return result;
        });
        assert.ok(candidates.length>0,`${width}px ${path} ${selector}: real background stars are present behind the surface`);
        const screenshot=await page.screenshot({animations:'disabled'});
        const painted=await page.evaluate(async({png,points})=>{
          const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
          const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
          const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
          return points.map(point=>{const rgba=ctx.getImageData(point.x,point.y,1,1).data;return Math.max(...point.rgb.map((value,index)=>Math.abs(value-rgba[index])));});
        },{png:screenshot.toString('base64'),points:candidates});
        await surface.evaluate(element=>{
          for(const {child,value,priority} of element.__chromeChildren){if(value)child.style.setProperty('visibility',value,priority);else child.style.removeProperty('visibility');}
          delete element.__chromeChildren;
        });
        assert.ok(painted.every(delta=>delta<=3),`${path} ${selector}: stars stay visible without a dark overlay (${painted.join(',')})`);
        results.push({width,path,surface:selector,visibleBackgroundSamples:candidates.length,maxPixelDifference:Math.max(...painted)});
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(width===320&&path==='/') {
        await page.locator('.menu-toggle').click();
        const color=await page.locator('#mobile-nav').evaluate(node=>getComputedStyle(node).backgroundColor);
        assert.notEqual(color,'rgba(0, 0, 0, 0)','opened mobile menu retains its readable surface');
      }
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,sourceOverride:process.env.CHROME_QA_SOURCE==='1',results,pageErrors:errors}));
} finally {await browser.close();}
