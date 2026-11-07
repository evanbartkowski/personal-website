import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const base = process.env.PORTFOLIO_QA_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({...(existsSync(executablePath) ? {executablePath} : {channel: 'chrome'}), headless: true});
const errors = [];
const results = [];
const meanPixelDifference=(first,later)=>first.rgb.reduce((sum,value,index)=>sum+Math.abs(value-later.rgb[index]),0)/first.rgb.length;

async function instrumentMotion(page) {
  await page.route('**/api/**', route => route.fulfill({json:{available:false,recorded:false,trackingDisabled:true}}));
  // Observe real composited draws, rather than trusting diagnostic counters.
  await page.addInitScript(() => {
    const drawImage=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
      const name=image?.dataset?.celestialTexture;
      if(name&&this.canvas.parentElement?.classList.contains('ambient-field')){
        const matrix=this.getTransform();
        (window.__celestialPaints ||= {})[name]={x:args[0],center:{x:matrix.e,y:matrix.f},matrix:[matrix.a,matrix.b,matrix.c,matrix.d],alpha:this.globalAlpha};
        (window.__celestialImageRefs ||= {})[name]=image;
        (window.__celestialPaintCounts ||= {})[name]=(window.__celestialPaintCounts[name]||0)+1;
        if(name==='moon-surface')window.__moonPaintImage=image;
        if(name==='distant-spacecraft'){
          const draws=(window.__spacecraftDraws ||= []);
          draws.push({time:window.__skyNow||performance.now(),x:matrix.e,y:matrix.f,alpha:this.globalAlpha});
          if(draws.length>12000)draws.splice(0,draws.length-12000);
        }
      }
      return drawImage.call(this,image,...args);
    };
    window.__captureMoonPixels=()=>{
      const image=window.__moonPaintImage;
      if(!image)throw Error('No composited moon artwork');
      const sample=window.__moonPixelSample ||= Object.assign(document.createElement('canvas'),{width:128,height:128});
      const context=sample.getContext('2d',{willReadFrequently:true});
      context.clearRect(0,0,128,128);context.drawImage(image,0,0,128,128);
      const pixels=context.getImageData(0,0,128,128).data,rgb=[],colors=new Set();
      // Sample the physical lunar disc, excluding the transparent glow around it.
      const radius=128*(Number(image.dataset.radius)||image.width*47/220)/image.width;
      for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(Math.hypot(x-63.5,y-63.5)<radius*.97){
        const at=(y*128+x)*4;
        rgb.push(pixels[at],pixels[at+1],pixels[at+2]);
        colors.add(`${pixels[at]>>3},${pixels[at+1]>>3},${pixels[at+2]>>3}`);
      }
      return {phase:Number(image.dataset.phase),rgb,colors:colors.size};
    };
    const stroke=CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke=function(...args){
      if(this.canvas.parentElement?.classList.contains('ambient-field')&&String(this.strokeStyle).startsWith('rgba(155, 191, 226,')){window.__constellationPaints=(window.__constellationPaints||0)+1;}
      return stroke.apply(this,args);
    };
    const fillRect=CanvasRenderingContext2D.prototype.fillRect,arc=CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.fillRect=function(...args){
      if(this.canvas.parentElement?.classList.contains('ambient-field')&&args[0]===0&&args[1]===0)window.__paintedStars=[];
      return fillRect.apply(this,args);
    };
    CanvasRenderingContext2D.prototype.arc=function(...args){
      if(this.canvas.parentElement?.classList.contains('ambient-field')&&args[2]>=.3&&args[2]<=1.1)(window.__paintedStars||=[]).push({x:args[0],y:args[1],radius:args[2]});
      return arc.apply(this,args);
    };
    // Take control of this scene's real rAF callback only when requested. The
    // production clock, events and draw code remain unchanged, and other page
    // animations retain their browser frame clock.
    const nativeFrame=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>{
      if(callback.name!=='tick'||!String(callback).includes('pointerDistance'))return nativeFrame(callback);
      if(window.__manualSky){window.__queuedSkyFrame=callback;return -1;}
      return nativeFrame(now=>{
        window.__skyNow=now;
        if(window.__manualSky)window.__queuedSkyFrame=callback;
        else callback(now);
      });
    };
    window.__advanceSky=seconds=>{
      for(let frame=0;frame<Math.ceil(seconds*20);frame++){
        const callback=window.__queuedSkyFrame;
        if(!callback)throw Error('No paused sky frame');
        window.__queuedSkyFrame=null;window.__skyNow+=50;callback(window.__skyNow);
      }
    };
  });
}

async function cadence(page) {
  return page.evaluate(async () => {
    const field = document.querySelector('.ambient-field');
    const frames = [];
    for (let index = 0; index < 38; index++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      scrollTo({top: index * 20, behavior: 'instant'});
      frames.push({time: performance.now(), painted: Number(field.dataset.renderedFrames), camera: Number(field.dataset.scrollPosition)});
    }
    const active = frames.slice(4);
    return {
      availableFrames: active.length - 1,
      paintedFrames: active.slice(1).filter((frame, index) => frame.painted > active[index].painted).length,
      movingFrames: active.slice(1).filter((frame, index) => frame.camera > active[index].camera).length,
      meanDisplayInterval: (active.at(-1).time - active[0].time) / (active.length - 1),
    };
  });
}

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({viewport: {width, height: 900}, reducedMotion: 'no-preference'});
    await instrumentMotion(page);
    page.on('pageerror', error => errors.push(error.message));
    // Optional source-only check before a coordinated build; ordinary runs
    // always test the module served by the target site.
    if (process.env.AMBIENT_QA_SOURCE === '1') {
      const source = await readFile('ambient.js', 'utf8');
      await page.route('**/ambient.js*', route => route.fulfill({contentType: 'text/javascript', body: source}));
      if(existsSync('lunar-surface.js')){
        const lunarSource=await readFile('lunar-surface.js','utf8');
        await page.route('**/lunar-surface.js*',route=>route.fulfill({contentType:'text/javascript',body:lunarSource}));
      }
    }
    await page.goto(base + '/experience.html');
    await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle' && document.querySelector('.ambient-field')?.dataset.scrollPosition);
    const sample = await cadence(page);
    assert.ok(sample.paintedFrames >= sample.availableFrames * .85, 'scroll paints on available display frames instead of a 25fps timer');
    assert.ok(sample.movingFrames >= sample.availableFrames * .85, 'the background camera advances through the scroll');
    await page.waitForFunction(() => Math.abs(Number(document.querySelector('.ambient-field').dataset.scrollPosition) - scrollY) < 1);
    // Inspect the lower stellar-forge objects with enough document space even
    // when editorial sections are collapsed or the credential carousel is short.
    await page.goto(base+'/credentials.html');
    await page.waitForFunction(() => document.documentElement.dataset.navigationState === 'idle' && document.querySelector('.ambient-field')?.dataset.page === 'credentials');
    await page.waitForFunction(()=>window.__celestialPaints?.['stellar-remnant']&&window.__celestialPaints?.['spiral-galaxy']&&window.__celestialPaints?.['nebula-filaments']);
    const stellarFirst=await page.evaluate(()=>structuredClone(window.__celestialPaints));
    await page.waitForTimeout(450);
    const stellarLater=await page.evaluate(()=>structuredClone(window.__celestialPaints));
    const stellarRotation=Math.max(...stellarLater['stellar-remnant'].matrix.map((value,index)=>Math.abs(value-stellarFirst['stellar-remnant'].matrix[index])));
    assert.ok(stellarRotation>.008,'the Certifications stellar remnant visibly rotates');
    assert.ok(Math.abs(stellarLater['stellar-remnant'].alpha-stellarFirst['stellar-remnant'].alpha)>.002,'the Certifications remnant pulses gradually');
    const galaxyRotation=Math.max(...stellarLater['spiral-galaxy'].matrix.map((value,index)=>Math.abs(value-stellarFirst['spiral-galaxy'].matrix[index])));
    assert.ok(galaxyRotation>.001,'cached spiral arms and their star clusters rotate in the far background');
    // Observe the same cached layers after thirty seconds of the real scene
    // clock. Relative transforms prove that the galaxy changes internally,
    // rather than only spinning one flat sprite.
    const galaxyTags=['spiral-galaxy','galaxy-gas','galaxy-dust','galaxy-clusters','galaxy-core'];
    await page.waitForFunction(tags=>tags.every(name=>window.__celestialPaints?.[name]),galaxyTags);
    await page.evaluate(tags=>{window.__manualSky=true;window.__galaxyRefs=Object.fromEntries(tags.map(name=>[name,window.__celestialImageRefs[name]]));},galaxyTags);
    await page.waitForFunction(()=>window.__queuedSkyFrame);
    const galaxyFirst=await page.evaluate(()=>structuredClone(window.__celestialPaints));
    const galaxyLater=await page.evaluate(()=>{window.__advanceSky(30);return structuredClone(window.__celestialPaints);});
    const relativeMatrix=(base,layer)=>{
      const [a,b,c,d]=base,[e,f,g,h]=layer,determinant=a*d-b*c;
      return [(d*e-c*f)/determinant,(-b*e+a*f)/determinant,(d*g-c*h)/determinant,(-b*g+a*h)/determinant];
    };
    const internalGalaxy={};
    for(const name of ['galaxy-gas','galaxy-dust','galaxy-clusters']){
      const before=relativeMatrix(galaxyFirst['spiral-galaxy'].matrix,galaxyFirst[name].matrix);
      const after=relativeMatrix(galaxyLater['spiral-galaxy'].matrix,galaxyLater[name].matrix);
      internalGalaxy[name]=Math.max(...after.map((value,index)=>Math.abs(value-before[index])));
      assert.ok(internalGalaxy[name]>.025,`${name} evolves independently of the galaxy's stellar arms`);
    }
    internalGalaxy.clusterFade=Math.abs(galaxyLater['galaxy-clusters'].alpha-galaxyFirst['galaxy-clusters'].alpha);
    internalGalaxy.coreBreath=Math.abs(galaxyLater['galaxy-core'].alpha-galaxyFirst['galaxy-core'].alpha);
    assert.ok(internalGalaxy.clusterFade>.001,'distant star clusters slowly vary in brightness');
    assert.ok(internalGalaxy.coreBreath>.001,'the galactic core breathes gently over time');
    assert.ok(await page.evaluate(tags=>tags.every(name=>window.__galaxyRefs[name]===window.__celestialImageRefs[name]),galaxyTags),'galactic evolution reuses cached artwork instead of rebuilding textures every frame');
    await page.evaluate(()=>{
      window.__manualSky=false;window.__queuedSkyFrame=null;
      // Resume through the real lifecycle so its frame timestamp resets from
      // virtual test time to the browser clock without a negative time delta.
      Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
    });
    const nebulaDrift=Math.max(...stellarLater['nebula-filaments'].matrix.map((value,index)=>Math.abs(value-stellarFirst['nebula-filaments'].matrix[index])));
    const nebulaFade=Math.abs(stellarLater['nebula-filaments'].alpha-stellarFirst['nebula-filaments'].alpha);
    assert.ok(nebulaDrift>.0003,'cached gas filaments slowly swirl and expand independently of the main cloud');
    assert.ok(nebulaFade>.0002,'nebula emission slowly fades through its opacity envelope');
    await page.evaluate(() => {document.body.style.minHeight='2200px';scrollTo({top:650,behavior:'instant'});});
    await page.waitForFunction(() => Math.abs(Number(document.querySelector('.ambient-field').dataset.scrollPosition)-scrollY)<1);
    await page.waitForFunction(() => ['planet-clouds','planet-ring-flow','accretion-flow'].every(name=>window.__celestialPaints?.[name]));
    const first=await page.evaluate(()=>structuredClone(window.__celestialPaints));
    await page.waitForTimeout(450);
    const later=await page.evaluate(()=>structuredClone(window.__celestialPaints));
    const cloudTravel=Math.abs(later['planet-clouds'].x-first['planet-clouds'].x);
    assert.ok(cloudTravel>.4,'planet clouds move across a fixed globe and night side');
    const rotationDelta=name=>Math.max(...later[name].matrix.map((value,index)=>Math.abs(value-first[name].matrix[index])));
    const planetRingRotation=rotationDelta('planet-ring-flow'),accretionRotation=rotationDelta('accretion-flow');
    assert.ok(planetRingRotation>.003,'planet ring highlights orbit around the projected ring plane');
    assert.ok(accretionRotation>.003,'quasar accretion highlights rotate independently of parallax');
    results.push({width, ...sample,cloudTravel,planetRingRotation,accretionRotation,stellarRotation,galaxyRotation,internalGalaxy,nebulaDrift,nebulaFade});

    await page.evaluate(() => {Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange'));});
    const hiddenCount = await page.locator('.ambient-field').getAttribute('data-rendered-frames');
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.ambient-field').getAttribute('data-rendered-frames'), hiddenCount, 'hidden pages stop drawing');
    await page.evaluate(() => {delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(count => Number(document.querySelector('.ambient-field').dataset.renderedFrames) > Number(count), hiddenCount);

    await page.evaluate(() => {window.__oldAmbient = document.querySelector('.ambient-field');window.__moonPaintImage=null;});
    const navigation = width < 761 ? '#mobile-nav a[href="/about.html"]' : '.desktop-nav a[href="/about.html"]';
    if (width < 761) await page.locator('.menu-toggle').click();
    await page.locator(navigation).click();
    await page.waitForFunction(() => location.pathname === '/about.html' && document.documentElement.dataset.navigationState === 'idle' && document.querySelector('.ambient-field')?.dataset.page === 'about');
    assert.equal(await page.locator('.ambient-field').count(), 1);
    assert.equal(await page.locator('.pointer-aura').count(), 1);
    assert.equal(await page.evaluate(() => window.__oldAmbient.isConnected), false);
    const disposedCount = await page.evaluate(() => window.__oldAmbient.dataset.renderedFrames);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.__oldAmbient.dataset.renderedFrames), disposedCount, 'disposed scenes stop drawing');
    await page.waitForFunction(()=>window.__moonPaintImage);
    const untouchedStars=await page.evaluate(()=>structuredClone(window.__paintedStars));
    await page.mouse.move(width*.5,450);
    await page.waitForFunction(()=>Number(document.querySelector('.ambient-field').dataset.cursorBentStars)>0);
    const gravitationalShift=await page.evaluate(before=>{
      const after=window.__paintedStars;
      return Math.max(...before.map((point,index)=>{
        const moved=after[index];return moved&&moved.radius===point.radius?Math.hypot(moved.x-point.x,moved.y-point.y):0;
      }));
    },untouchedStars);
    assert.ok(gravitationalShift>.5,'real star centers bend toward the centered cursor without camera parallax');
    results.at(-1).gravitationalShift=gravitationalShift;
    // Find a small geometric constellation in the sparse mobile sky too.
    for(const [x,y]of [[.5,.5],[.25,.3],[.75,.6],[.2,.7]]){
      await page.mouse.move(width*x,900*y);await page.waitForTimeout(160);
      if(await page.evaluate(()=>window.__constellationPaints>0))break;
    }
    assert.ok(await page.evaluate(()=>window.__constellationPaints>0),'nearby stars connect through actual canvas strokes on hover');
    await page.mouse.move(-10,-10);
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await page.waitForFunction(()=>document.querySelector('.ambient-field').dataset.cursorBentStars==='0');

    // Advance the actual scene clock: a subtle lunar cycle must stay calm over
    // a second, yet visibly change over minutes. Also observe complete ship
    // passage after its long entry delay, followed by a quiet sky.
    assert.equal(await page.evaluate(()=>window.__celestialPaintCounts?.['distant-spacecraft']||0),0,'entering pages does not immediately launch a spacecraft');
    await page.evaluate(()=>{window.__manualSky=true;window.__spacecraftDraws=[];window.__shipClockStart=window.__skyNow;window.__rareBefore={...window.__celestialPaintCounts};window.__observedRare=new Set();});
    await page.waitForFunction(()=>window.__queuedSkyFrame);
    const moonFirst=await page.evaluate(()=>window.__captureMoonPixels());
    const moonSecond=await page.evaluate(()=>{window.__advanceSky(1);return window.__captureMoonPixels();});
    let moonMiddle,moonLater;
    for(let step=0;step<48;step++){
      const capture=await page.evaluate(captureMoon=>{
        window.__advanceSky(5);
        for(const effect of document.querySelector('.ambient-field').dataset.rarePhenomena.split(',').filter(Boolean))window.__observedRare.add(effect);
        return captureMoon?window.__captureMoonPixels():null;
      },step===23||step===47);
      if(step===23)moonMiddle=capture;
      if(step===47)moonLater=capture;
    }
    const moonShortChange=meanPixelDifference(moonFirst,moonSecond),moonMinuteChange=meanPixelDifference(moonFirst,moonMiddle),moonLaterChange=meanPixelDifference(moonMiddle,moonLater);
    assert.ok(moonShortChange<1.5,`the actual lunar artwork remains visually calm over one second (${moonShortChange.toFixed(3)} mean RGB change)`);
    assert.ok(moonMinuteChange>3&&moonLaterChange>3,`the softly lit lunar disc evolves through distinct phases over minutes (${moonMinuteChange.toFixed(3)}, ${moonLaterChange.toFixed(3)} mean RGB change)`);
    assert.ok(Math.max(moonFirst.colors,moonMiddle.colors,moonLater.colors)>30,'the moon has textured tonal detail rather than a flat cutout');
    results.at(-1).moon={oneSecondPixelChange:moonShortChange,twoMinutePixelChange:moonMinuteChange,laterPixelChange:moonLaterChange,texturedColors:Math.max(moonFirst.colors,moonMiddle.colors,moonLater.colors)};
    const observed=await page.evaluate(()=>{
      const field=document.querySelector('.ambient-field'),draws=window.__spacecraftDraws,before=window.__rareBefore,after=window.__celestialPaintCounts;
      let passages=draws.length?1:0,longestGap=0,backwardFrames=0;
      for(let index=1;index<draws.length;index++){
        const gap=draws[index].time-draws[index-1].time;
        longestGap=Math.max(longestGap,gap);
        if(gap>5000)passages++;
        else if(draws[index].x<draws[index-1].x-.05)backwardFrames++;
      }
      const canvas=field.querySelector('canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let brightPixels=0;for(let index=0;index<pixels.length;index+=4)if(Math.max(pixels[index],pixels[index+1],pixels[index+2])>30)brightPixels++;
      return {
        ship:{draws:draws.length,passages,firstAppearanceSeconds:(draws[0]?.time-window.__shipClockStart)/1000,quietTailSeconds:(window.__skyNow-draws.at(-1)?.time)/1000,state:JSON.parse(field.dataset.spacecraftPassages)[0].state,span:Math.max(...draws.map(draw=>draw.x))-Math.min(...draws.map(draw=>draw.x)),backwardFrames,minAlpha:Math.min(...draws.map(draw=>draw.alpha)),maxAlpha:Math.max(...draws.map(draw=>draw.alpha))},
        rare:{events:[...window.__observedRare],cometPaints:(after['comet-nucleus']||0)-(before['comet-nucleus']||0),astronautPaints:(after['drifting-astronaut']||0)-(before['drifting-astronaut']||0),novaPaints:(after['distant-supernova']||0)-(before['distant-supernova']||0),darkFraction:1-brightPixels/(pixels.length/4)}
      };
    });
    assert.ok(observed.ship.span>width*.85,'the spacecraft travels across the viewport instead of oscillating in place');
    assert.equal(observed.ship.backwardFrames,0,'each About spacecraft passage keeps one direction');
    assert.equal(observed.ship.passages,1,'only one rare spacecraft passes during four minutes on the About page');
    assert.ok(observed.ship.firstAppearanceSeconds>120,'the sky stays free of spacecraft for more than two minutes on entry');
    assert.ok(observed.ship.quietTailSeconds>60&&observed.ship.state==='quiet','the spacecraft completely disappears and stays absent for the remaining minute');
    assert.ok(observed.ship.minAlpha<observed.ship.maxAlpha*.4,'the spacecraft fades naturally at entry and exit');
    results.at(-1).ship=observed.ship;
    if(width===1440){
      assert.ok(observed.rare.cometPaints>0&&observed.rare.astronautPaints>0&&observed.rare.novaPaints>0,'the scheduled comet, astronaut and distant supernova all paint during their rare visits');
      assert.ok(observed.rare.darkFraction>.9,'rare effects leave more than ninety percent of the sky dark');
      results.at(-1).rare=observed.rare;
    }
    await page.goto(base+'/projects.html');
    await page.waitForFunction(()=>document.documentElement.dataset.navigationState==='idle'&&document.querySelector('.ambient-field')?.dataset.page==='projects');
    await page.evaluate(()=>{document.body.style.minHeight='2400px';window.dispatchEvent(new Event('blur'));});
    const projectSeparation=[];
    for(const top of [0,450,1100]){
      await page.evaluate(top=>scrollTo({top,behavior:'instant'}),top);
      await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.ambient-field').dataset.scrollPosition)-scrollY)<1);
      const positions=await page.evaluate(()=>JSON.parse(document.querySelector('.ambient-field').dataset.celestialCoordinates));
      const planet=positions.planet,galaxy=positions['distant-galaxy'];
      const scale=width<761?.63:Math.max(.85,Math.min(width/1450,1.18));
      const distance=Math.hypot(galaxy.x-planet.x,galaxy.y-planet.y);
      // Bound the full artwork, including its atmosphere and diffuse halo.
      const minimumSeparation=(130*.82+185*.7)*scale;
      assert.ok(distance>minimumSeparation+30,'the Projects planet and distant galaxy remain separated while scrolling');
      assert.ok(planet.x<width*.3&&galaxy.x>width*.8,'the Projects planet occupies the opposite side of the sky from the galaxy');
      projectSeparation.push({scroll:top,distance:Math.round(distance),clearance:Math.round(distance-minimumSeparation)});
    }
    results.at(-1).projectSeparation=projectSeparation;
    await page.close();

    const reduced = await browser.newPage({viewport: {width, height: 900}, reducedMotion: 'reduce'});
    await instrumentMotion(reduced);
    reduced.on('pageerror', error => errors.push(error.message));
    if (process.env.AMBIENT_QA_SOURCE === '1') {
      const source = await readFile('ambient.js', 'utf8');
      await reduced.route('**/ambient.js*', route => route.fulfill({contentType: 'text/javascript', body: source}));
      if(existsSync('lunar-surface.js')){
        const lunarSource=await readFile('lunar-surface.js','utf8');
        await reduced.route('**/lunar-surface.js*',route=>route.fulfill({contentType:'text/javascript',body:lunarSource}));
      }
    }
    await reduced.goto(base + '/experience.html');
    await reduced.waitForFunction(() => document.querySelector('.ambient-field')?.dataset.motionState === 'reduced');
    await reduced.evaluate(() => {document.body.style.minHeight='2200px';});
    const still = await reduced.locator('.ambient-field canvas').evaluate(canvas => canvas.toDataURL());
    await reduced.evaluate(() => scrollTo({top: 1200, behavior: 'instant'}));
    await reduced.waitForTimeout(120);
    assert.ok(await reduced.evaluate(() => scrollY)>0,'reduced-motion check scrolls the document');
    assert.equal(await reduced.locator('.ambient-field canvas').evaluate(canvas => canvas.toDataURL()), still, 'reduced motion keeps the sky still during scroll');
    assert.equal(await reduced.evaluate(()=>window.__celestialPaintCounts?.['distant-spacecraft']||0),0,'reduced motion does not launch spacecraft');
    await reduced.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({result: 'passed', sourceOverride: process.env.AMBIENT_QA_SOURCE === '1', scroll: results, liveObjects:'painted cloud travel, orbital highlights, independently evolving cached galactic layers, stellar rotation and pulse, subtle textured lunar phases, delayed complete spacecraft passages and long quiet skies, separated Projects celestial bodies, hover constellations and scheduled rare visitors', safeguards: 'hidden pause, reduced-motion stillness, route cleanup, single ambient scene, contained slow supernova bloom', pageErrors: errors}));
} finally {
  await browser.close();
}
