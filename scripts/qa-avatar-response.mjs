// Observe the real face canvas during a held, entirely mocked conversation.
// No request from this suite can consume AI quota or write visitor/game data.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium, expect} from '@playwright/test';

const base=(process.env.PORTFOLIO_QA_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const executablePath=process.env.CHROME_PATH||join(process.env.LOCALAPPDATA||'','ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executablePath)?{executablePath}:{channel:'chrome'}),headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[],pending=[],requests=[];
const reply='I build security systems at CyberMaxx and write software and games on the side. I like working through how the pieces fit together, from the backend to the interface. My projects are a good place to see that range; pick one and I can walk you through it.';

async function instrument(page){
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    requests.push({path,method:route.request().method()});
    if(path==='/api/chat/status')return route.fulfill({json:{available:true}});
    if(path!=='/api/chat')return route.fulfill({status:503,json:{error:'Disabled during avatar QA.',recorded:false}});
    await new Promise(resolve=>pending.push(resolve));
    try{await route.fulfill({json:{reply}});}catch(error){if(!/closed|disposed|aborted|intercepted|InterceptionId/i.test(error.message))throw error;}
  });
  await page.addInitScript(()=>{
    const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,ellipse=proto.ellipse,stroke=proto.stroke,gradient=proto.createRadialGradient;
    const active=context=>context.canvas.classList.contains('portrait-canvas');
    proto.clearRect=function(...args){
      if(active(this)){
        const canvas=this.canvas,prior=canvas.__avatarFrame,next={state:canvas.parentElement.dataset.aiState,ellipses:0,strokes:0,eyes:[]};
        canvas.__avatarPaints=(canvas.__avatarPaints||0)+1;canvas.__avatarFrame=next;
        if(prior?.state==='responding'&&next.state==='idle'){
          canvas.__avatarTransitions||=[];canvas.__avatarTransitions.push({before:prior.eyes,after:next.eyes});
        }
      }
      return clear.apply(this,args);
    };
    proto.ellipse=function(...args){if(active(this)&&this.canvas.__avatarFrame)this.canvas.__avatarFrame.ellipses++;return ellipse.apply(this,args);};
    proto.stroke=function(...args){if(active(this)&&this.canvas.__avatarFrame)this.canvas.__avatarFrame.strokes++;return stroke.apply(this,args);};
    proto.createRadialGradient=function(...args){
      const result=gradient.apply(this,args);
      if(active(this)&&this.canvas.__avatarFrame){
        const eye={color:null},add=result.addColorStop;this.canvas.__avatarFrame.eyes.push(eye);
        result.addColorStop=function(offset,color){if(offset===0)eye.color=color;return add.call(this,offset,color);};
      }return result;
    };
  });
}
const frame=page=>page.locator('.portrait-canvas').evaluate(canvas=>({paints:canvas.__avatarPaints,transitions:canvas.__avatarTransitions||[],...canvas.__avatarFrame}));
const eyeRGB=value=>value.eyes.slice(0,2).map(eye=>eye.color.match(/[\d.]+/g).slice(0,3).map(Number));
const separation=(first,second)=>first.reduce((sum,eye,index)=>sum+Math.hypot(...eye.map((channel,i)=>channel-second[index][i])),0)/first.length;
const state=(page,value)=>expect(page.locator('#portrait')).toHaveAttribute('data-ai-state',value);
const wait=async(page,ms)=>page.waitForTimeout(ms);
async function send(page){await page.locator('#portrait-chat-input').fill('What do you work on?');await page.locator('#portrait-chat-input').press('Enter');await expect.poll(()=>pending.length).toBe(1);await state(page,'thinking');}

try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'no-preference'});
  await instrument(page);await page.goto(base);await expect(page.locator('#portrait')).toHaveAttribute('data-state','ready');
  await page.locator('#portrait-launch').click();await expect(page.locator('#portrait-chat-status')).toContainText(/ready/i);await wait(page,250);
  const idle=await frame(page),idleEyes=eyeRGB(idle);
  assert.equal(idle.ellipses,0,'idle artwork leaves the active neural field absent');
  await send(page);await wait(page,650);const thinking=await frame(page);
  assert.ok(thinking.ellipses>idle.ellipses,'a real pending chat paints curved neural artwork behind the head');
  assert.ok(thinking.strokes>idle.strokes,'thinking adds connected signal paths to the real canvas');
  pending.shift()();await state(page,'responding');await wait(page,450);const firstReply=await frame(page);
  assert.ok(firstReply.ellipses>idle.ellipses,'the background field stays alive through typed output');
  await wait(page,850);const secondReply=await frame(page);
  const responseShift=separation(eyeRGB(firstReply),eyeRGB(secondReply));
  assert.ok(responseShift>25,'the actual optical glow colors cycle while a response is being revealed');
  await state(page,'idle');const transition=(await frame(page)).transitions[0];
  assert.ok(transition,'a painted responding-to-idle transition is observed');
  const transitionShift=separation(eyeRGB({eyes:transition.before}),eyeRGB({eyes:transition.after}));
  await expect.poll(async()=>(await frame(page)).ellipses,{timeout:6000}).toBe(0);
  const restored=await frame(page),restoredShift=separation(eyeRGB(restored),idleEyes);
  assert.ok(transitionShift<6,'the first idle frame retains the response tint without an immediate snap');
  assert.ok(restoredShift<4,'the eye glow settles back to its idle theme after the transition');
  assert.equal(restored.ellipses,0,'the transient background field fades away after the reply');

  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state','paused');
  await send(page);const reduced=await frame(page);await wait(page,200);const reducedLater=await frame(page);
  assert.ok(reduced.ellipses>0,'reduced motion shows still thinking artwork');
  assert.equal(reducedLater.paints,reduced.paints,'the still state does not start a background animation loop');
  assert.deepEqual(eyeRGB(reducedLater),eyeRGB(reduced),'reduced motion keeps the eye accent fixed');
  pending.shift()();await state(page,'idle');await expect(page.locator('.portrait-message-assistant').last()).toContainText(reply);

  await page.emulateMedia({reducedMotion:'no-preference'});await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state','running');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state','paused');const hidden=await frame(page);await wait(page,180);
  assert.equal((await frame(page)).paints,hidden.paints,'hidden documents suspend the face and neural artwork together');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('#portrait')).toHaveAttribute('data-motion-state','running');
  await page.locator('#portrait-chat-close').click();
  await page.evaluate(()=>{window.__avatarOldHost=document.querySelector('#portrait');window.__avatarOldCanvas=document.querySelector('.portrait-canvas');});
  await page.locator('.desktop-nav a[href="/about.html"]').click();await page.waitForFunction(()=>location.pathname==='/about.html'&&document.documentElement.dataset.navigationState==='idle');
  assert.equal(await page.evaluate(()=>window.__avatarOldHost.dataset.motionState),'disposed');
  const disposed=await page.evaluate(()=>window.__avatarOldCanvas.__avatarPaints);await wait(page,180);
  assert.equal(await page.evaluate(()=>window.__avatarOldCanvas.__avatarPaints),disposed,'navigation disposes the old canvas animation');
  assert.deepEqual(errors,[],'the full conversation and page transition have no browser errors');
  console.log(JSON.stringify({result:'Avatar response effects passed',base,mockedReplies:requests.filter(r=>r.path==='/api/chat').length,responseEyeShift:+responseShift.toFixed(2),restoredEyeShift:+restoredShift.toFixed(2),checks:['actual thinking paths','response spectrum','smooth idle restoration','reduced-motion still artwork','hidden pause','navigation disposal'],allAPIsMocked:true},null,2));
}finally{pending.splice(0).forEach(resolve=>resolve());await browser.close();}
