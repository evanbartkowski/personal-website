// All portfolio APIs are mocked. The isolated game fixture also verifies that
// command input causes no network requests or dynamically executed code.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium,expect} from '@playwright/test';

const base=(process.env.PORTFOLIO_QA_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const executablePath=process.env.CHROME_PATH||join(process.env.LOCALAPPDATA||'','ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executablePath)?{executablePath}:{channel:'chrome'}),headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[],layouts=[];
const prepare=async page=>{
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Disabled during challenge QA.'}}));
};
const enter=async(page,command)=>{
  await page.locator('#cyber-challenge-input').fill(command);
  await page.locator('#cyber-challenge-input').press('Enter');
};
const stage=(page,value)=>expect(page.locator('#cyber-challenge-dialog')).toHaveAttribute('data-stage',value);
const solveToShell=async page=>{
  await enter(page,"query ' OR '1'='1' --");await stage(page,'authenticate');
  await expect(page.locator('#cyber-challenge-output')).toContainText('21232f297a57a5a743894a0e4a801fc3');
  await enter(page,'crack 21232f297a57a5a743894a0e4a801fc3');
  await expect(page.locator('#cyber-challenge-output')).toContainText('WORDLIST MATCH');
  await enter(page,'login admin wrong');await stage(page,'authenticate');
  await enter(page,'login admin admin');await stage(page,'recon');
  await enter(page,'ssh admin@internal-node');await stage(page,'recon');
  await enter(page,'nmap internal-node');await stage(page,'connect');
  await expect(page.locator('#cyber-challenge-output')).toContainText('22/tcp');
  await enter(page,'ssh admin@internal-node');await stage(page,'shell');
};

try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await prepare(page);await page.goto(base);
  await page.waitForFunction(()=>document.documentElement.dataset.navigationState==='idle');
  await page.locator('.terminal-tools-menu > summary').click();
  await expect(page.locator('.terminal-tools-menu .cyber-challenge-launch')).toBeVisible();
  await page.locator('.terminal-tools-menu .terminal-shell-launch').click();
  await expect(page.locator('#terminal-dialog')).toBeVisible();
  await expect(page.locator('[data-terminal-game="flappy"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.terminal-tools-menu > summary').focus();await page.keyboard.press('Enter');
  await page.locator('.terminal-tools-menu .cyber-challenge-launch').click();
  await expect(page.locator('#cyber-challenge-dialog')).toBeVisible();
  await expect(page.locator('#cyber-challenge-input')).toBeFocused();
  await expect(page.locator('#terminal-dialog')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.terminal-tools-menu > summary')).toBeFocused();
  await page.locator('.home-hack-disclosure > summary').click();
  await page.locator('.home-hack-content .cyber-challenge-launch').click();
  await stage(page,'query');
  await enter(page,'overload');await stage(page,'query');
  await page.locator('.ctf-hint').click();
  await expect(page.locator('#cyber-challenge-output')).toContainText('always true');
  await enter(page,'<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('#cyber-challenge-output img').count(),0,'commands remain plain text');
  await solveToShell(page);
  await page.keyboard.press('Escape');
  await page.locator('.home-hack-content .cyber-challenge-launch').click();
  await stage(page,'shell');
  await enter(page,':(){ :|:& };:');await stage(page,'reboot');
  await expect(page.locator('#cyber-challenge-input')).toBeDisabled();
  await stage(page,'complete');
  await expect(page.locator('#cyber-challenge-output')).toContainText('NODE RESTORED');
  await page.locator('.ctf-restart').click();await stage(page,'query');
  await enter(page,'hint');await page.locator('#cyber-challenge-input').press('ArrowUp');
  await expect(page.locator('#cyber-challenge-input')).toHaveValue('hint');
  await page.keyboard.press('Escape');

  for(const width of [320,390,760,1024,1440]){
    await page.setViewportSize({width,height:width<500?700:1000});
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.locator('.terminal-tools-menu > summary').click();
    const menu=await page.locator('.terminal-tools-options').boundingBox();
    assert.ok(menu.x>=0&&menu.x+menu.width<=width+1,'header menu fits viewport');
    await page.locator('.terminal-tools-menu .cyber-challenge-launch').click();
    const layout=await page.locator('#cyber-challenge-dialog').evaluate(node=>{
      const r=node.getBoundingClientRect(),input=node.querySelector('input').getBoundingClientRect(),output=node.querySelector('.ctf-output').getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,x:r.x,y:r.y,w:r.width,h:r.height,inputBottom:input.bottom,outputHeight:output.height,overflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:node.scrollWidth>node.clientWidth};
    });
    assert.ok(layout.x>=0&&layout.y>=0&&layout.x+layout.w<=width+1&&layout.y+layout.h<=layout.height+1,'sandbox remains inside viewport');
    assert.ok(layout.inputBottom<=layout.y+layout.h&&layout.outputHeight>80,'composer and readable transcript stay usable');
    assert.equal(layout.overflow||layout.dialogOverflow,false,'page and modal have no horizontal overflow');layouts.push(layout);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.terminal-tools-menu > summary').click();await page.locator('.terminal-tools-menu .cyber-challenge-launch').click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('portfolio:navigate',{detail:{url:'/about.html'},cancelable:true})));
  await page.waitForFunction(()=>location.pathname==='/about.html'&&document.documentElement.dataset.navigationState==='idle');
  assert.equal(await page.locator('#cyber-challenge-dialog').count(),0,'navigation disposes the game and its modal');
  await page.close();

  const isolated=await browser.newPage({viewport:{width:900,height:900},reducedMotion:'no-preference'});
  await prepare(isolated);
  await isolated.route('**/__ctf-fixture__',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><link rel="stylesheet" href="/cyber-challenge.css"></head><body style="--green:#849bab;--cream:#b8c4cd;--muted:#71838f;--line:#29404d;--mono:monospace;--sans:sans-serif;--display:sans-serif"><button id="launch">Launch</button><script type="module">import {mountCyberChallenge} from '/cyber-challenge.js';window.game=mountCyberChallenge();document.querySelector('#launch').onclick=()=>game.open();window.fixtureReady=true;</script></body></html>`}));
  await isolated.goto(`${base}/__ctf-fixture__`);await isolated.waitForFunction(()=>window.fixtureReady);
  await isolated.evaluate(()=>{
    window.executed=false;
    for(const name of ['fetch','Worker','WebSocket','EventSource'])window[name]=()=>{throw Error(`Game attempted ${name}`);};
  });
  const gameRequests=[];isolated.on('request',request=>gameRequests.push(request.url()));
  await isolated.locator('#launch').click();
  await enter(isolated,'window.executed=true; fetch("https://example.com")');
  assert.equal(await isolated.evaluate(()=>window.executed),false);
  await solveToShell(isolated);await enter(isolated,'overload');await stage(isolated,'reboot');
  await isolated.keyboard.press('Escape');await isolated.waitForTimeout(3200);
  await stage(isolated,'reboot');
  await isolated.locator('#launch').click();await stage(isolated,'complete');
  assert.deepEqual(gameRequests,[],'all puzzle stages and the reboot cause zero network requests');
  await isolated.evaluate(()=>window.game.dispose());assert.equal(await isolated.locator('#cyber-challenge-dialog').count(),0);
  assert.deepEqual(errors,[],'no browser errors');
  console.log(JSON.stringify({result:'Cybersecurity challenge checks passed',base,layouts,checks:['both launch locations','legacy terminal retained','stage gating and wrong credentials','local hash match','simulated SSH and reboot','plain text commands','close/reopen progress','reduced motion','keyboard focus/history','responsive modal','navigation disposal','zero game network or dynamic code execution']},null,2));
}finally{await browser.close();}
