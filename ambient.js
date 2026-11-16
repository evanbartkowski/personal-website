import {createLunarSurface, MOON_PHASE_PERIOD} from './lunar-surface.js';

// A living, document-relative sky, independent of WebGL. Cached textures follow
// display cadence during interaction; reduced-motion visitors get a still sky.
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function spacecraftPassage(time, {delay, duration, gap}) {
  const age = Math.max(0, time) - delay;
  if (age < 0) return {state: 'waiting', flying: false, progress: 0};
  const elapsed = age % (duration + gap), flying = elapsed < duration;
  return {state: flying ? 'flight' : 'quiet', flying, progress: clamp(elapsed / duration, 0, 1)};
}
function seeded(initial) {
  let seed = initial;
  return () => {seed = seed * 16807 % 2147483647;return (seed - 1) / 2147483646;};
}
function sprite(size, paint) {
  const image = document.createElement('canvas');
  image.width = image.height = size * 2;
  const context = image.getContext('2d');
  if (!context) return null;
  context.translate(size, size);
  paint(context, size);
  return image;
}
function circle(context, x, y, radius, fill) {
  context.beginPath();context.arc(x,y,radius,0,TAU);context.fillStyle = fill;context.fill();
}
function sunSprite() {
  return sprite(210, ctx => {
    const halo = ctx.createRadialGradient(0,0,52,0,0,185);
    halo.addColorStop(0,'rgba(255,206,95,.28)');halo.addColorStop(.16,'rgba(241,164,54,.12)');halo.addColorStop(.5,'rgba(214,132,34,.025)');halo.addColorStop(1,'rgba(214,132,34,0)');
    circle(ctx,0,0,200,halo);
    ctx.lineWidth = .6;
    for (const [angle,size] of [[.18,.65],[2.16,.9],[4.84,.5]]) {
      ctx.save();ctx.rotate(angle);ctx.beginPath();ctx.moveTo(61,-8);ctx.bezierCurveTo(66+26*size,-23*size,75+20*size,14*size,63,12);ctx.strokeStyle = 'rgba(248,191,83,.13)';ctx.stroke();ctx.restore();
    }
    const surface = ctx.createRadialGradient(-25,-22,4,0,0,69);
    surface.addColorStop(0,'#fff4c0');surface.addColorStop(.3,'#fce195');surface.addColorStop(.65,'#eeb84b');surface.addColorStop(.9,'#bc7729');surface.addColorStop(1,'#814316');
    circle(ctx,0,0,66,surface);
    ctx.save();ctx.beginPath();ctx.arc(0,0,65,0,TAU);ctx.clip();
    const random = seeded(914);
    for (let i=0;i<900;i++) {
      const x = random()*132-66,y = random()*132-66;
      circle(ctx,x,y,.3+random()*1.3,`rgba(${random()>.6?'255,241,182':'110,58,11'},${.04+random()*.12})`);
    }
    ctx.restore();ctx.beginPath();ctx.arc(0,0,66,0,TAU);ctx.strokeStyle = 'rgba(255,211,122,.6)';ctx.lineWidth = .8;ctx.stroke();
  });
}
function galaxySprite(seed,layer='stars') {
  const image=sprite(185,ctx=>{
    const random=seeded(seed+946);
    // Gas, dust, young clusters and the old stellar core have independent
    // cached surfaces, so their slow relative drift does not redraw geometry.
    function armPath(arm,offset=0,start=10) {
      ctx.beginPath();
      for(let radius=start;radius<=139;radius+=1.6){
        const angle=arm*TAU/3+radius*.034+offset,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
        radius===start?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
    }
    ctx.lineCap='round';
    if(layer==='gas'){
      const halo=ctx.createRadialGradient(0,0,12,0,0,155);
      halo.addColorStop(0,'rgba(121,126,201,.1)');halo.addColorStop(.42,'rgba(85,101,171,.035)');halo.addColorStop(1,'rgba(62,82,147,0)');circle(ctx,0,0,155,halo);
      for(let arm=0;arm<3;arm++)for(const [width,alpha]of [[22,.024],[12,.045],[5,.075]]){
        armPath(arm);ctx.lineWidth=width;ctx.strokeStyle=`rgba(${arm===1?'147,108,200':'102,153,223'},${alpha})`;ctx.stroke();
      }
      for(let arm=0;arm<3;arm++)for(let index=0;index<13;index++){
        const radius=22+random()*113,angle=arm*TAU/3+radius*.034+(random()-.5)*.14;
        const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius,size=4+random()*8;
        const cloud=ctx.createRadialGradient(x,y,0,x,y,size);
        cloud.addColorStop(0,`rgba(${index%3?'108,163,226':'188,111,211'},.1)`);cloud.addColorStop(1,'rgba(86,121,190,0)');circle(ctx,x,y,size,cloud);
      }
      return;
    }
    if(layer==='dust'){
      for(let arm=0;arm<3;arm++)for(const [width,alpha]of [[4,.19],[1.5,.43]]){
        armPath(arm,.045,25);ctx.lineWidth=width;ctx.strokeStyle=`rgba(1,3,9,${alpha})`;ctx.stroke();
      }
      return;
    }
    if(layer==='core'){
      const core=ctx.createRadialGradient(-1,-1,0,0,0,36);
      core.addColorStop(0,'rgba(255,242,214,.72)');core.addColorStop(.1,'rgba(242,221,190,.4)');core.addColorStop(.35,'rgba(220,193,174,.12)');core.addColorStop(1,'rgba(151,149,199,0)');circle(ctx,0,0,36,core);
      return;
    }
    if(layer==='clusters'){
      for(let arm=0;arm<3;arm++)for(let index=0;index<17;index++){
        const radius=30+random()*101,angle=arm*TAU/3+radius*.034+(random()-.5)*.2;
        const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius,size=2.5+random()*4;
        const cluster=ctx.createRadialGradient(x,y,0,x,y,size);
        cluster.addColorStop(0,`rgba(${index%4?'156,201,255':'240,156,220'},.22)`);cluster.addColorStop(.25,'rgba(140,176,241,.09)');cluster.addColorStop(1,'rgba(112,155,230,0)');circle(ctx,x,y,size,cluster);
        circle(ctx,x,y,.3+random()*.4,'rgba(217,230,255,.58)');
      }
      return;
    }
    for(let arm=0;arm<3;arm++)for(let index=0;index<430;index++){
      const radius=8+Math.pow(random(),.75)*127,angle=arm*TAU/3+radius*.034+(random()-.5)*.32;
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
      circle(ctx,x,y,.25+random()*.95,`rgba(${radius<35?'245,219,174':index%7?'150,184,240':'213,138,220'},${(.15+random()*.34)*(1-radius/175)})`);
    }
  });
  if(image)image.dataset.celestialTexture=layer==='stars'?'spiral-galaxy':`galaxy-${layer}`;
  return image;
}

function stellarHaloSprite(texture='stellar-bloom') {
  const image=sprite(100,ctx=>{
    const light=ctx.createRadialGradient(0,0,0,0,0,96);
    light.addColorStop(0,'rgba(198,211,255,.16)');light.addColorStop(.13,'rgba(167,155,240,.1)');light.addColorStop(.5,'rgba(112,94,191,.025)');light.addColorStop(1,'rgba(112,94,191,0)');circle(ctx,0,0,96,light);
  });
  if(image)image.dataset.celestialTexture=texture;
  return image;
}

function astronautSprite() {
  return sprite(38,ctx=>{
    const suit=ctx.createLinearGradient(-8,-13,8,15);suit.addColorStop(0,'#8295a0');suit.addColorStop(.36,'#47535d');suit.addColorStop(1,'#0d141c');
    ctx.fillStyle=suit;ctx.fillRect(-6,-2,12,13);ctx.fillRect(-9,1,3,9);
    circle(ctx,0,-8,7,suit);ctx.save();ctx.beginPath();ctx.ellipse(1,-8,4.8,3.7,-.15,0,TAU);ctx.fillStyle='#14242c';ctx.fill();ctx.restore();
    ctx.strokeStyle='#455561';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-4,10);ctx.lineTo(-7,19);ctx.moveTo(4,10);ctx.lineTo(8,17);ctx.moveTo(-6,1);ctx.lineTo(-13,7);ctx.moveTo(6,1);ctx.lineTo(13,-4);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-9,3);ctx.bezierCurveTo(-29,4,-25,21,-35,15);ctx.strokeStyle='rgba(118,140,157,.36)';ctx.lineWidth=.55;ctx.stroke();circle(ctx,-2,-9,1,'rgba(192,216,226,.38)');
  });
}
function planetSprite(seed=1643,layer='complete') {
  return sprite(170, ctx => {
    const random=seeded(seed);
    if(layer!=='foreground'){
      const atmosphere=ctx.createRadialGradient(0,0,52,0,0,72);
      atmosphere.addColorStop(0,'rgba(152,193,223,.1)');atmosphere.addColorStop(.3,'rgba(122,174,213,.035)');atmosphere.addColorStop(1,'rgba(122,174,213,0)');circle(ctx,0,0,72,atmosphere);
    }
    // Individual ice/debris lanes and a visible dark division make the ring
    // system read as a physical disc rather than a single decorative oval.
    function rings(front) {
      ctx.save();ctx.rotate(-.4);
      for(let radius=74;radius<=126;radius+=1.25){
        if(radius>99&&radius<105)continue;
        const alpha=.12+random()*.16;
        ctx.strokeStyle=`rgba(${radius<92?'178,185,190':'204,188,154'},${front?alpha:alpha*.56})`;
        ctx.lineWidth=radius>111?.7:1;
        ctx.beginPath();ctx.ellipse(0,0,radius,radius*.25,0,front?0:Math.PI,front?Math.PI:TAU);ctx.stroke();
      }
      ctx.restore();
    }
    // Restore only the foreground lanes over animated clouds. The globe's
    // terminator remains fixed while atmospheric detail travels beneath it.
    if(layer==='foreground'){rings(true);return;}
    rings(false);
    const surface=ctx.createRadialGradient(-25,-26,0,13,14,82);
    surface.addColorStop(0,'#8195a2');surface.addColorStop(.25,'#536f81');surface.addColorStop(.55,'#293f51');surface.addColorStop(.8,'#132333');surface.addColorStop(1,'#03070b');circle(ctx,0,0,59,surface);
    ctx.save();ctx.beginPath();ctx.arc(0,0,59,0,TAU);ctx.clip();ctx.rotate(-.18);
    for(let row=-61;row<64;row+=1.8){
      const phase=random()*TAU;
      ctx.beginPath();
      for(let x=-72;x<=72;x+=4){const y=row+Math.sin(x*.045+phase)*1.5+Math.cos(x*.11+phase)*.5;if(x===-72)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
      ctx.strokeStyle=`rgba(${random()>.64?'183,159,115':random()>.5?'151,187,209':'8,19,31'},${.08+random()*.16})`;ctx.lineWidth=.8+random()*1.8;ctx.stroke();
    }
    for(let i=0;i<420;i++)circle(ctx,random()*118-59,random()*118-59,.25+random()*.5,`rgba(197,213,223,${random()*.06})`);
    ctx.save();ctx.translate(20,13);ctx.rotate(-.12);
    const storm=ctx.createRadialGradient(0,0,1,0,0,9);storm.addColorStop(0,'rgba(178,151,103,.36)');storm.addColorStop(.5,'rgba(108,121,133,.16)');storm.addColorStop(1,'rgba(108,121,133,0)');ctx.scale(1,.42);circle(ctx,0,0,10,storm);ctx.restore();
    if(layer!=='surface'){const night=ctx.createLinearGradient(-42,-20,52,12);night.addColorStop(0,'rgba(0,0,0,0)');night.addColorStop(.48,'rgba(0,0,0,.08)');night.addColorStop(.76,'rgba(0,0,0,.72)');night.addColorStop(1,'rgba(0,0,0,.96)');ctx.fillStyle=night;ctx.fillRect(-65,-65,130,130);}
    ctx.restore();
    ctx.beginPath();ctx.arc(0,0,59,Math.PI*.8,Math.PI*1.79);ctx.lineWidth=.8;ctx.strokeStyle='rgba(171,205,228,.4)';ctx.stroke();
    if(layer!=='surface')rings(true);
    for(const [x,y,r]of [[-102,-55,2.2],[85,42,1.5]]){circle(ctx,x,y,r,'#75818a');circle(ctx,x-.5,y-.6,r*.35,'rgba(225,228,219,.6)');}
  });
}
function planetCloudSprite(seed) {
  const image=sprite(72,ctx=>{
    const random=seeded(seed+984);
    for(let row=-57;row<=57;row+=4.5){
      const phase=random()*TAU;
      ctx.beginPath();
      for(let x=-95;x<=95;x+=3){
        const y=row+Math.sin(x/144*TAU*2+phase)*2.2+Math.sin(x/144*TAU*3-phase)*.65;
        x===-95?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.strokeStyle=`rgba(${random()>.5?'183,204,216':'167,160,141'},${.05+random()*.1})`;
      ctx.lineWidth=1.5+random()*2.2;ctx.stroke();
    }
    for(const [x,y,r] of [[18,12,8],[-38,-25,5],[55,39,7]]){
      ctx.save();ctx.translate(x,y);ctx.scale(1,.39);
      for(let arc=0;arc<3;arc++){
        ctx.beginPath();ctx.ellipse(0,0,r+arc*2,r*.5+arc*.8,.12,arc*.8,Math.PI*1.7+arc*.8);
        ctx.strokeStyle=`rgba(207,189,155,${.17-arc*.04})`;ctx.lineWidth=.85;ctx.stroke();
      }
      ctx.restore();
    }
  });
  if(image)image.dataset.celestialTexture='planet-clouds';
  return image;
}
function planetShadowSprite() {
  return sprite(72,ctx=>{
    ctx.beginPath();ctx.arc(0,0,59,0,TAU);ctx.clip();
    const night=ctx.createLinearGradient(-42,-20,52,12);
    night.addColorStop(0,'rgba(0,0,0,0)');night.addColorStop(.48,'rgba(0,0,0,.08)');night.addColorStop(.76,'rgba(0,0,0,.72)');night.addColorStop(1,'rgba(0,0,0,.96)');
    ctx.fillStyle=night;ctx.fillRect(-65,-65,130,130);
  });
}
function accretionFlowSprite(seed,inner=28,outer=105,texture='accretion-flow') {
  const image=sprite(128,ctx=>{
    const random=seeded(seed);
    for(let index=0;index<40;index++){
      const radius=inner+random()*(outer-inner),angle=random()*TAU;
      ctx.beginPath();ctx.arc(0,0,radius,angle,angle+.09+random()*.25);
      ctx.strokeStyle=`rgba(${index%4?'222,191,141':'194,217,230'},${.1+random()*.22})`;
      ctx.lineWidth=.5+random()*.9;ctx.stroke();
    }
  });
  if(image)image.dataset.celestialTexture=texture;
  return image;
}
function quasarSprite() {
  return sprite(150, ctx => {
    const halo=ctx.createRadialGradient(0,0,3,0,0,65);halo.addColorStop(0,'rgba(223,207,170,.07)');halo.addColorStop(1,'rgba(223,207,170,0)');circle(ctx,0,0,65,halo);
    ctx.save();ctx.rotate(-.42);
    const jet=ctx.createLinearGradient(0,-104,0,95);jet.addColorStop(0,'rgba(212,222,211,0)');jet.addColorStop(.39,'rgba(212,222,211,.09)');jet.addColorStop(.5,'rgba(212,222,211,.19)');jet.addColorStop(.61,'rgba(212,222,211,.07)');jet.addColorStop(1,'rgba(212,222,211,0)');
    ctx.strokeStyle=jet;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-104);ctx.lineTo(0,95);ctx.stroke();
    for(let radius=19;radius<63;radius+=1.8){const alpha=(1-(radius-19)/44)*.2;ctx.beginPath();ctx.ellipse(0,0,radius,radius*.21,0,0,TAU);ctx.strokeStyle=`rgba(222,185,119,${alpha})`;ctx.lineWidth=1.2;ctx.stroke();}
    circle(ctx,0,0,12,'#000');ctx.beginPath();ctx.arc(0,0,13,Math.PI*.9,Math.PI*2.05);ctx.strokeStyle='rgba(228,216,181,.5)';ctx.lineWidth=1.2;ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,2,26,5,0,0,Math.PI);ctx.strokeStyle='rgba(235,206,149,.42)';ctx.lineWidth=1.4;ctx.stroke();
    ctx.restore();
  });
}

function nebulaSprite(seed,layer=0) {
  const image=sprite(240,ctx=>{
    const random=seeded(seed+layer*1193),colors=['136,64,220','44,181,212','47,79,191'];
    for(let index=0;index<(layer===1?36:56);index++){
      const progress=index/55,angle=progress*4.5+layer*.9;
      const x=(progress-.5)*305+Math.sin(angle*2)*29,y=Math.sin(angle)*59+Math.cos(progress*10)*20;
      const radius=layer===1?17+random()*28:31+random()*61;
      const gradient=ctx.createRadialGradient(x,y,radius*.03,x,y,radius),color=colors[(Math.floor(progress*5)+layer)%colors.length];
      gradient.addColorStop(0,`rgba(${color},${layer===1?.045+random()*.065:.04+random()*.065})`);gradient.addColorStop(.42,`rgba(${color},${layer===1?.023:.018})`);gradient.addColorStop(1,`rgba(${color},0)`);circle(ctx,x,y,radius,gradient);
    }
    // Fine ionized filaments form tangled ridges instead of a smooth colored
    // rectangle. Everything is painted once into a transparent cached sprite.
    for(let strand=0;strand<16;strand++){
      ctx.beginPath();
      const start=-178+random()*24,phase=random()*TAU;
      for(let x=start;x<175;x+=4){
        const y=Math.sin(x*.018+layer*.9)*57+Math.sin(x*.055+phase)*7+strand*2.4-19;
        x===start?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.strokeStyle=`rgba(${colors[(strand+layer)%3]},${.035+random()*.045})`;ctx.lineWidth=.5+random()*1.25;ctx.stroke();
    }
    ctx.globalCompositeOperation='destination-out';
    for(let index=0;index<5;index++){
      ctx.beginPath();ctx.moveTo(-205,-45+index*21);ctx.bezierCurveTo(-60,91-index*23,40,-75+index*24,209,17+index*15);ctx.strokeStyle='rgba(0,0,0,.36)';ctx.lineWidth=3+index*3;ctx.stroke();
    }
  });
  if(image)image.dataset.celestialTexture=layer===1?'nebula-filaments':'nebula-cloud';
  return image;
}
function blackHoleSprite() {
  return sprite(165,ctx=>{
    const glow=ctx.createRadialGradient(0,0,11,0,0,119);glow.addColorStop(0,'rgba(240,191,112,.04)');glow.addColorStop(.28,'rgba(217,148,61,.025)');glow.addColorStop(1,'rgba(217,148,61,0)');circle(ctx,0,0,119,glow);
    ctx.save();ctx.rotate(-.29);
    const random=seeded(602);
    for(let radius=34;radius<108;radius+=1.3){
      ctx.beginPath();ctx.ellipse(0,0,radius,radius*.21,0,0,TAU);ctx.lineWidth=.6+random()*.7;ctx.strokeStyle=`rgba(226,${158+Math.round(random()*45)},${91+Math.round(random()*30)},${(1-(radius-34)/85)*(.11+random()*.14)})`;ctx.stroke();
    }
    circle(ctx,0,0,22,'#000');
    for(let index=0;index<3;index++){
      ctx.beginPath();ctx.ellipse(0,-1,23+index*1.4,28+index*.9,0,Math.PI*.9,TAU+.2);ctx.strokeStyle=`rgba(255,223,164,${.48-index*.14})`;ctx.lineWidth=index===0?1:.7;ctx.stroke();
    }
    const streak=ctx.createLinearGradient(-110,0,110,0);streak.addColorStop(0,'rgba(242,201,142,0)');streak.addColorStop(.38,'rgba(242,201,142,.21)');streak.addColorStop(.5,'rgba(255,239,196,.42)');streak.addColorStop(.7,'rgba(242,201,142,.15)');streak.addColorStop(1,'rgba(242,201,142,0)');ctx.beginPath();ctx.ellipse(0,8,105,14,0,0,Math.PI);ctx.strokeStyle=streak;ctx.lineWidth=1.3;ctx.stroke();
    ctx.restore();
  });
}
function supernovaSprite() {
  return sprite(165,ctx=>{
    const random=seeded(8116);
    for(let index=0;index<88;index++){
      const angle=index/88*TAU,radius=36+random()*32;
      ctx.beginPath();ctx.moveTo(Math.cos(angle)*radius*.7,Math.sin(angle)*radius*.65);ctx.quadraticCurveTo(Math.cos(angle+.1)*radius,Math.sin(angle+.1)*radius*.9,Math.cos(angle+.18)*(radius+10),Math.sin(angle+.18)*(radius+10)*.85);ctx.strokeStyle=`rgba(${index%3?'208,154,96':'153,168,205'},${.04+random()*.12})`;ctx.lineWidth=.35+random()*.7;ctx.stroke();
    }
    const halo=ctx.createRadialGradient(0,0,0,0,0,97);halo.addColorStop(0,'rgba(252,233,177,.2)');halo.addColorStop(.08,'rgba(244,205,133,.07)');halo.addColorStop(.4,'rgba(223,143,76,.015)');halo.addColorStop(1,'rgba(223,143,76,0)');circle(ctx,0,0,97,halo);
    diffraction(ctx,0,0,40,4,'255,239,197',.3);diffraction(ctx,0,0,15,8,'255,244,216',.4);circle(ctx,0,0,2.5,'#e6debd');circle(ctx,-.3,-.3,.9,'#fff6dd');
  });
}
function shipSprite() {
  return sprite(65,ctx=>{
    ctx.save();ctx.rotate(-.28);
    const wake=ctx.createLinearGradient(-38,0,-14,0);wake.addColorStop(0,'rgba(137,193,233,0)');wake.addColorStop(.8,'rgba(137,193,233,.14)');wake.addColorStop(1,'rgba(208,233,248,.5)');ctx.fillStyle=wake;
    for(const y of [-5,5]){ctx.beginPath();ctx.moveTo(-38,y);ctx.lineTo(-14,y-1.5);ctx.lineTo(-14,y+1.5);ctx.closePath();ctx.fill();}
    const hull=ctx.createLinearGradient(0,-12,0,13);hull.addColorStop(0,'#a2aab0');hull.addColorStop(.4,'#505c65');hull.addColorStop(.55,'#202b33');hull.addColorStop(1,'#0b1116');
    ctx.beginPath();for(const [index,[x,y]]of [[28,0],[2,-6],[-10,-18],[-16,-16],[-11,-4],[-23,-3],[-23,3],[-11,4],[-16,16],[-10,18],[2,6]].entries())index?ctx.lineTo(x,y):ctx.moveTo(x,y);ctx.closePath();ctx.fillStyle=hull;ctx.fill();ctx.strokeStyle='rgba(192,208,218,.3)';ctx.lineWidth=.6;ctx.stroke();
    ctx.beginPath();ctx.moveTo(21,0);ctx.lineTo(-10,0);ctx.moveTo(-5,-5);ctx.lineTo(-12,-14);ctx.moveTo(-5,5);ctx.lineTo(-12,14);ctx.strokeStyle='rgba(207,217,223,.25)';ctx.lineWidth=.55;ctx.stroke();circle(ctx,6,-1,.9,'#a2c3d9');circle(ctx,-9,-16,.55,'#e9cfa0');circle(ctx,-9,16,.55,'#e9cfa0');ctx.restore();
  });
}

const SCENES={
  home:{name:'orbital-frontier',seed:481,warm:.3,rocks:6,colors:['79,109,153','107,84,143','65,135,156'],bodies:[
    {name:'nebula',kind:'nebula',x:.07,y:.95,offset:10,depth:.46,size:.85,alpha:.52,radius:190,angle:-.3},
    {name:'distant-galaxy',kind:'galaxy',x:.95,y:1,offset:95,depth:.36,size:.65,alpha:.46,radius:160,angle:.7},
    {name:'planet',kind:'planet',x:.09,y:.81,mobileX:.84,mobileY:1.16,depth:.78,size:.87,alpha:.8,radius:130,angle:.06},
    {name:'outbound-ship',kind:'ship',x:.8,y:.2,depth:.56,size:.61,alpha:.55,radius:65,flight:{duration:38,gap:720,delay:150,direction:-1,rise:.14}},
    {name:'sun',kind:'sun',x:.035,y:1,offset:145,depth:.75,size:.81,alpha:.73,radius:170},
    {name:'moon',kind:'moon',x:.12,y:1,offset:360,depth:.57,size:.83,alpha:.7,radius:57,angle:-.25},
    {name:'quasar',kind:'quasar',x:.87,y:1,offset:610,depth:.76,size:.77,alpha:.82,radius:105}
  ]},
  about:{name:'lunar-archive',seed:1531,warm:.23,rocks:4,colors:['80,116,168','98,83,147','58,138,161'],bodies:[
    {name:'nebula',kind:'nebula',x:.04,y:.79,depth:.52,size:.9,alpha:.54,radius:190,angle:.45},
    {name:'distant-galaxy',kind:'galaxy',x:.035,y:1,offset:180,depth:.4,size:.7,alpha:.5,radius:160,angle:-.4},
    {name:'moon',kind:'moon',x:.92,y:.23,depth:.77,size:1.45,alpha:.78,radius:60,angle:.15},
    {name:'survey-ship',kind:'ship',x:.1,y:.53,depth:.58,size:.7,alpha:.58,radius:65,flight:{duration:36,gap:660,delay:135,direction:1,rise:-.14}},
    {name:'sun',kind:'sun',x:.89,y:1,offset:260,depth:.8,size:.64,alpha:.63,radius:170}
  ]},
  experience:{name:'gravity-well',seed:3791,warm:.39,rocks:5,colors:['149,105,69','90,93,139'],bodies:[
    {name:'nebula',kind:'nebula',x:.89,y:.82,depth:.45,size:1.02,alpha:.48,radius:190,angle:-.6},
    {name:'distant-galaxy',kind:'galaxy',x:.07,y:1,offset:315,depth:.38,size:.53,alpha:.42,radius:160,angle:.4},
    {name:'black-hole',kind:'blackHole',x:.94,y:.24,depth:.81,size:.87,alpha:.87,radius:122,angle:.08},
    {name:'courier',kind:'ship',x:.04,y:.7,depth:.59,size:.64,alpha:.55,radius:65,flight:{duration:32,gap:780,delay:170,direction:1,rise:.16}},
    {name:'sun',kind:'sun',x:.025,y:1,offset:155,depth:.72,size:.62,alpha:.66,radius:170},
    {name:'moon',kind:'moon',x:.92,y:1,offset:570,depth:.7,size:.82,alpha:.66,radius:60,angle:-.8}
  ]},
  credentials:{name:'stellar-forge',seed:6127,warm:.52,rocks:4,colors:['135,84,131','101,103,158'],bodies:[
    {name:'nebula',kind:'nebula',x:.04,y:.94,depth:.48,size:.88,alpha:.54,radius:190,angle:.4},
    {name:'distant-galaxy',kind:'galaxy',x:.07,y:.42,depth:.37,size:.48,alpha:.4,radius:160,angle:-.7},
    {name:'supernova',kind:'supernova',x:.94,y:.2,depth:.79,size:1.03,alpha:.82,radius:105,angle:.2},
    {name:'research-ship',kind:'ship',x:.12,y:.64,depth:.55,size:.59,alpha:.52,radius:65,flight:{duration:42,gap:840,delay:190,direction:1,rise:-.12}},
    {name:'planet',kind:'planet',x:.04,y:1,offset:105,depth:.65,size:.73,alpha:.7,radius:130,angle:.32},
    {name:'quasar',kind:'quasar',x:.88,y:1,offset:430,depth:.77,size:.67,alpha:.75,radius:105}
  ]},
  projects:{name:'expedition-belt',seed:8221,warm:.3,rocks:15,belt:true,colors:['80,115,157','129,76,137'],bodies:[
    {name:'nebula',kind:'nebula',x:.05,y:.82,depth:.43,size:1.12,alpha:.52,radius:190,angle:-.5},
    {name:'distant-galaxy',kind:'galaxy',x:.94,y:1,offset:25,depth:.35,size:.7,alpha:.45,radius:160,angle:-.4},
    {name:'explorer',kind:'ship',x:.91,y:.2,depth:.78,size:.84,alpha:.65,radius:65,flight:{duration:40,gap:690,delay:160,direction:-1,rise:.18}},
    {name:'planet',kind:'planet',x:.075,y:.4,mobileX:.16,mobileY:.38,offset:60,depth:.62,size:.82,alpha:.72,radius:130,angle:-.25},
    {name:'black-hole',kind:'blackHole',x:.035,y:1,offset:470,depth:.7,size:.73,alpha:.77,radius:122,angle:-.3},
    {name:'supernova',kind:'supernova',x:.91,y:2,offset:250,depth:.76,size:.84,alpha:.7,radius:105}
  ]},
  blog:{name:'violet-remnant',seed:9959,warm:.24,rocks:5,colors:['131,86,168','76,106,164'],bodies:[
    {name:'nebula',kind:'nebula',x:.96,y:.22,depth:.74,size:1.05,alpha:.6,radius:190,angle:-.65},
    {name:'distant-galaxy',kind:'galaxy',x:.065,y:.75,depth:.38,size:.74,alpha:.47,radius:160,angle:.3},
    {name:'supernova',kind:'supernova',x:.91,y:.22,depth:.75,size:.61,alpha:.67,radius:105,angle:.3},
    {name:'scribe-ship',kind:'ship',x:.065,y:.4,depth:.67,size:.61,alpha:.54,radius:65,flight:{duration:38,gap:900,delay:210,direction:1,rise:-.16}},
    {name:'quasar',kind:'quasar',x:.055,y:1,offset:95,depth:.7,size:.78,alpha:.81,radius:105},
    {name:'moon',kind:'moon',x:.92,y:1,offset:355,depth:.72,size:.85,alpha:.68,radius:60,angle:.2}
  ]}
};

function asteroidSprite(seed) {
  return sprite(24,ctx=>{
    const random=seeded(seed),vertices=Array.from({length:9},(_,index)=>{const angle=index*TAU/9,radius=7+random()*4;return{x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};});
    const material=ctx.createLinearGradient(-9,-9,10,10);material.addColorStop(0,'#716b55');material.addColorStop(.35,'#36372c');material.addColorStop(1,'#0b0d09');
    ctx.beginPath();vertices.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.closePath();ctx.fillStyle=material;ctx.fill();
    ctx.save();ctx.clip();
    for(let i=0;i<8;i++)circle(ctx,random()*18-9,random()*18-9,1+random()*1.8,'rgba(0,0,0,.21)');
    ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(2,-2);ctx.lineTo(-3,5);ctx.strokeStyle='rgba(145,137,110,.12)';ctx.lineWidth=.7;ctx.stroke();ctx.restore();
    ctx.beginPath();ctx.moveTo(vertices[4].x,vertices[4].y);for(let i=5;i<8;i++)ctx.lineTo(vertices[i].x,vertices[i].y);ctx.strokeStyle='rgba(199,185,143,.23)';ctx.lineWidth=.7;ctx.stroke();
  });
}
function diffraction(ctx,x,y,radius,rays,color,alpha) {
  ctx.save();ctx.translate(x,y);ctx.beginPath();
  for(let i=0;i<rays*2;i++) {
    const angle=-Math.PI/2+i*Math.PI/rays;
    const r=i%2?radius*.065:radius*(rays===8&&i%4===2?.58:1);
    const px=Math.cos(angle)*r,py=Math.sin(angle)*r;
    if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
  }
  ctx.closePath();ctx.fillStyle=`rgba(${color},${alpha})`;ctx.fill();ctx.restore();
}

export function mountAmbient({reducedMotion=matchMedia('(prefers-reduced-motion: reduce)')}={}) {
  if(document.querySelector('.ambient-field'))return;
  const pathPage=location.pathname.split('/').filter(Boolean)[0]?.replace(/\.html$/,'')||'home';
  const requestedPage=document.body.dataset.page||pathPage;
  const page=Object.hasOwn(SCENES,requestedPage)?requestedPage:'home';
  const scene=SCENES[page];
  const field=document.createElement('div');field.className='ambient-field';field.setAttribute('aria-hidden','true');
  field.dataset.celestialScene=scene.name;field.dataset.scene=scene.name;field.dataset.page=page;
  field.dataset.celestialLayers=JSON.stringify(scene.bodies.map(({name,kind,depth})=>({name,kind,depth})));
  field.innerHTML='<canvas></canvas>';document.body.prepend(field);
  const aura=document.createElement('div');aura.className='pointer-aura';aura.setAttribute('aria-hidden','true');document.body.append(aura);
  const canvas=field.querySelector('canvas'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
  if(!ctx){aura.remove();return()=>field.remove();}
  const lunar=scene.bodies.some(body=>body.kind==='moon')?createLunarSurface():null;
  field.dataset.moonPhasePeriod=String(MOON_PHASE_PERIOD);
  const images={sun:sunSprite(),moon:lunar?.image,planet:planetSprite(scene.seed,'surface'),planetForeground:planetSprite(scene.seed,'foreground'),planetClouds:planetCloudSprite(scene.seed),planetShadow:planetShadowSprite(),planetRingFlow:accretionFlowSprite(scene.seed+136,76,124,'planet-ring-flow'),accretionFlow:accretionFlowSprite(scene.seed+371),quasar:quasarSprite(),blackHole:blackHoleSprite(),nebula:nebulaSprite(scene.seed),nebulaFilaments:nebulaSprite(scene.seed,1),supernova:supernovaSprite(),galaxy:galaxySprite(scene.seed),bloom:stellarHaloSprite(),cometGlow:stellarHaloSprite('comet-nucleus'),novaGlow:stellarHaloSprite('distant-supernova'),ship:shipSprite(),astronaut:astronautSprite(),asteroids:[191,422,751,1033].map(asteroidSprite)};
  for(const layer of ['gas','dust','clusters','core'])images[`galaxy${layer[0].toUpperCase()}${layer.slice(1)}`]=galaxySprite(scene.seed,layer);
  for(const [kind,name]of Object.entries({moon:'moon-surface',nebula:'nebula-cloud',supernova:'stellar-remnant',astronaut:'drifting-astronaut',ship:'distant-spacecraft'}))if(images[kind])images[kind].dataset.celestialTexture=name;
  let width=0,height=0,stars=[],asteroids=[],frameId=0,lastTick=0,lastPaint=0,time=0,scroll=scrollY,scrollTarget=scrollY;
  let meteor=null,nextMeteor=12+scene.seed%13,comet=null,nextComet=38+scene.seed%19,traveler=null,nextTraveler=62+scene.seed%31,nova=null,nextNova=94+scene.seed%29,renderedFrames=0;
  const motionRandom=seeded(scene.seed+5701);
  let pointerPresent=false;
  let mouse={x:.5,y:.5},target={x:.5,y:.5};
  function resize() {
    width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const random=seeded(scene.seed);
    stars=Array.from({length:clamp(Math.round(width*height/11500),44,175)},(_,index)=>({x:random()*width,y:random()*height,z:.25+random()*.75,r:.3+random()*.8,phase:random()*TAU,speed:.35+random()*1.2,warm:random()<scene.warm,rays:index%43===0?8:index%29===0?4:0,pulsar:index%37===0}));
    asteroids=Array.from({length:width<761?Math.ceil(scene.rocks*.55):scene.rocks},(_,index)=>{
      const angle=index/scene.rocks*TAU,spread=random();
      return{x:scene.belt?width*.88+Math.cos(angle)*width*.13:random()*width,y:scene.belt?height*.22+Math.sin(angle)*height*.17:random()*height,speedX:scene.belt?.6+spread:1.2+random()*1.5,speedY:.35+random()*.7,phase:random()*TAU,rotation:(random()-.5)*.06,scale:.36+random()*.4,image:images.asteroids[index%4]};
    });
    if(!document.hidden)draw();
  }
  function drawImage(image,x,y,scale,alpha=1,angle=0) {
    if(!image)return;ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;ctx.drawImage(image,-image.width*scale/2,-image.height*scale/2,image.width*scale,image.height*scale);ctx.restore();
  }
  function drawPlanetWeather(body,activeTime) {
    const clouds=images.planetClouds;
    if(clouds){
      ctx.save();ctx.translate(body.x,body.y);ctx.rotate(body.angle);ctx.scale(body.scale,body.scale);ctx.globalAlpha=body.alpha;
      ctx.beginPath();ctx.arc(0,0,58.7,0,TAU);ctx.clip();
      ctx.save();ctx.rotate(-.18);
      const travel=activeTime*2.5%clouds.width;
      for(const wrap of [-1,0])ctx.drawImage(clouds,-72+travel+wrap*clouds.width,-72);
      ctx.restore();
      ctx.restore();
    }
    // A stationary, cached night side keeps the illumination anchored in space.
    drawImage(images.planetShadow,body.x,body.y,body.scale,body.alpha,body.angle);
    // The nearer ring lanes occlude the moving atmosphere.
    drawImage(images.planetForeground,body.x,body.y,body.scale,body.alpha,body.angle);
    drawOrbitalFlow(body,activeTime*.085,images.planetRingFlow,-.4,.25,1,.48,true);
  }
  function drawOrbitalFlow(body,phase,image,tilt,flatten,scale=1,alpha=1,frontOnly=false) {
    if(!image)return;
    ctx.save();ctx.translate(body.x,body.y);ctx.rotate(body.angle+tilt);
    if(frontOnly){ctx.beginPath();ctx.rect(-150*body.scale,0,300*body.scale,150*body.scale);ctx.clip();}
    ctx.scale(body.scale*scale,body.scale*scale*flatten);ctx.rotate(phase);ctx.globalAlpha=body.alpha*alpha;
    ctx.drawImage(image,-image.width/2,-image.height/2);ctx.restore();
  }
  function drawMoon(body,activeTime) {
    if(!lunar)return;
    const phase=(activeTime/MOON_PHASE_PERIOD*TAU+.5+(scene.seed%37)/37*1.8)%TAU;
    const surface=lunar.render(phase);
    // The faint unlit hemisphere occludes stars without a harsh moving mask.
    ctx.save();ctx.translate(body.x,body.y);ctx.scale(body.scale,body.scale);
    ctx.globalAlpha=1;circle(ctx,0,0,46.8,'#02050a');ctx.restore();
    drawImage(surface,body.x,body.y,body.scale*.5,body.alpha,body.angle);
    field.dataset.moonPhase=surface.dataset.phase;
    field.dataset.moonIllumination=surface.dataset.illumination;
  }
  function drawGravityWell(body,activeTime) {
    drawOrbitalFlow(body,-activeTime*.21,images.accretionFlow,-.29,.21,1,.65);
    ctx.save();ctx.translate(body.x,body.y);ctx.rotate(body.angle-.29);ctx.scale(body.scale,body.scale);
    // Photon-ring arcs and a second bent image above the horizon provide a
    // restrained lensing illusion, with matter spiraling into the inner disk.
    for(let ring=0;ring<3;ring++){
      ctx.beginPath();ctx.ellipse(0,-2,25+ring*4,29+ring*3,Math.sin(activeTime*.05)*.035,-Math.PI*.96,Math.PI*.03);
      ctx.strokeStyle=`rgba(239,211,170,${body.alpha*(.12-ring*.03)})`;ctx.lineWidth=.5;ctx.stroke();
    }
    for(let index=0;index<27;index++){
      const progress=(activeTime*.055+index/27)%1,radius=108-progress*82,angle=index*2.399+activeTime*(.18+progress*.4)+progress*4;
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius*.21;
      if(y<0&&Math.abs(x)<24)continue;
      circle(ctx,x,y,.35+progress*.35,`rgba(246,${184+Math.round(progress*40)},137,${body.alpha*(.12+progress*.16)*Math.sin(progress*Math.PI)})`);
    }
    ctx.restore();
  }
  function drawRareEvents(activeTime,mobile) {
    if(!meteor&&activeTime>=nextMeteor)meteor={start:activeTime,x:width*(.14+motionRandom()*.64),y:height*(.06+motionRandom()*.27),dx:180+width*.14,dy:110+height*.1,duration:1.15+motionRandom()*.65};
    if(meteor){
      const phase=(activeTime-meteor.start)/meteor.duration;
      if(phase>=1){meteor=null;nextMeteor=activeTime+22+motionRandom()*24;}
      else{
        const envelope=Math.sin(phase*Math.PI),x=meteor.x+meteor.dx*phase,y=meteor.y+meteor.dy*phase,length=Math.hypot(meteor.dx,meteor.dy),tail=90+phase*65,tx=x-meteor.dx/length*tail,ty=y-meteor.dy/length*tail;
        const trail=ctx.createLinearGradient(tx,ty,x,y);trail.addColorStop(0,'rgba(237,225,184,0)');trail.addColorStop(.72,`rgba(237,225,184,${envelope*.19})`);trail.addColorStop(1,`rgba(242,238,212,${envelope*.65})`);
        ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(x,y);ctx.strokeStyle=trail;ctx.lineWidth=.9;ctx.stroke();circle(ctx,x,y,1.1,`rgba(250,245,219,${envelope*.8})`);
      }
    }
    if(!comet&&activeTime>=nextComet)comet={start:activeTime,duration:8+motionRandom()*3,x:width*.94,y:height*(.1+motionRandom()*.4),dx:-width*.74,dy:height*.19};
    if(comet){
      const phase=(activeTime-comet.start)/comet.duration;
      if(phase>=1){comet=null;nextComet=activeTime+95+motionRandom()*80;}
      else{
        const envelope=Math.sin(phase*Math.PI),x=comet.x+comet.dx*phase,y=comet.y+comet.dy*phase;
        for(let index=0;index<29;index++){
          const trail=index/29,tx=x+trail*(mobile?115:185),ty=y-trail*38+Math.sin(index*.8+activeTime)*trail*2.5;
          circle(ctx,tx,ty,(1-trail)*1.15+.2,`rgba(156,210,247,${envelope*(1-trail)*.32})`);
        }
        drawImage(images.cometGlow,x,y,.12,envelope*.8);circle(ctx,x,y,1.2,`rgba(220,242,255,${envelope*.8})`);
      }
    }
    if(!traveler&&activeTime>=nextTraveler)traveler={start:activeTime,duration:27,x:motionRandom()>.5?width*.06:width*.93,y:height*.12};
    if(traveler){
      const phase=(activeTime-traveler.start)/traveler.duration;
      if(phase>=1){traveler=null;nextTraveler=activeTime+155+motionRandom()*85;}
      else drawImage(images.astronaut,traveler.x+Math.sin(phase*Math.PI)*24,traveler.y+phase*height*.58,mobile?.24:.34,Math.sin(phase*Math.PI)*.55,phase*1.6);
    }
    // This is a small, multi-second bloom in one distant gas pocket. It never
    // changes the global clear color or flashes across the screen.
    if(!nova&&activeTime>=nextNova)nova={start:activeTime,duration:13,x:width*(.08+motionRandom()*.84),y:height*(.1+motionRandom()*.55)};
    if(nova){
      const phase=(activeTime-nova.start)/nova.duration;
      if(phase>=1){nova=null;nextNova=activeTime+240+motionRandom()*150;}
      else{
        const envelope=Math.sin(phase*Math.PI)**2;
        drawImage(images.novaGlow,nova.x,nova.y,.32+phase*.52,envelope*.7);
        diffraction(ctx,nova.x,nova.y,3+envelope*7,8,'216,225,255',envelope*.24);
      }
    }
  }
  function draw() {
    ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
    const active=!reducedMotion.matches;
    const px=active?(mouse.x-.5)*18:0,py=active?(mouse.y-.5)*12:0;
    const activeTime=active?time:0;
    const documentScroll=active?scroll:0;
    const mobile=width<761,scale=mobile?.63:clamp(width/1450,.85,1.18);
    const drift=active?Math.sin(activeTime*.13)*2.5:0;
    // Body anchors live at document depths and never wrap vertically. Stars
    // and small debris can repeat; planets, clouds and stellar remnants leave.
    const bodies=scene.bodies.map(definition=>{
      const body={
        ...definition,
        x:width*(mobile?(definition.mobileX??definition.x):definition.x)+px*(definition.depth*.45)+(definition.kind==='planet'?Math.sin(activeTime*.07)*4:0),
        y:height*(mobile?(definition.mobileY??definition.y):definition.y)+(definition.offset||0)-documentScroll*definition.depth+py*.3+drift+(definition.kind==='planet'?Math.cos(activeTime*.05)*3:0),
        scale:scale*definition.size*(definition.kind==='nebula'?1+Math.sin(activeTime*.027)*.055:1),
        angle:(definition.angle||0)+(definition.kind==='quasar'?Math.sin(activeTime*.038)*.075:definition.kind==='blackHole'?Math.sin(activeTime*.025)*.045:definition.kind==='supernova'?activeTime*.085:definition.kind==='galaxy'?activeTime*.018:definition.kind==='nebula'?activeTime*.008:0)
      };
      if(definition.kind==='ship'){
        // Complete one-way passages, followed by a long empty sky. The scene
        // clock pauses with the document, so returning to a hidden tab never
        // jumps a ship to another part of its flight.
        const {direction,rise}=definition.flight;
        const passage=spacecraftPassage(activeTime,definition.flight),progress=passage.progress;
        const margin=65*body.scale+24,span=width+margin*2;
        const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};
        body.flying=active&&passage.flying;
        body.flightState=passage.state;
        body.flightProgress=progress;
        body.x=(direction>0?-margin:width+margin)+direction*span*progress+px*definition.depth*.45;
        body.y+=rise*height*(progress-.5);
        // The cached hull points 0.28 radians above its local +X axis.
        body.angle=Math.atan2(rise*height,direction*span)+.28;
        body.alpha*=body.flying?smooth(progress/.09)*smooth((1-progress)/.12):0;
      }
      return body;
    });
    const visible=[];
    for(const body of bodies){
      if(body.kind==='ship'&&(!body.flying||body.alpha<.001||body.x+body.radius*body.scale<0||body.x-body.radius*body.scale>width))continue;
      if(body.y+body.radius*body.scale>0&&body.y-body.radius*body.scale<height){
        visible.push(body.name);
        if(body.kind==='nebula'){
          const breath=.77+Math.sin(activeTime*.075+scene.seed)*.15;
          drawImage(images.nebula,body.x,body.y,body.scale,body.alpha*breath,body.angle);
          drawImage(images.nebula,body.x+Math.sin(activeTime*.039)*15,body.y+Math.cos(activeTime*.031)*10,body.scale*(.87+Math.sin(activeTime*.043)*.07),body.alpha*.48,-body.angle*.7);
          drawImage(images.nebulaFilaments,body.x+Math.cos(activeTime*.027)*11,body.y+Math.sin(activeTime*.034)*9,body.scale*(1.03+Math.cos(activeTime*.052)*.04),body.alpha*(.66+Math.sin(activeTime*.061)*.18),body.angle*.58-activeTime*.006);
        }
        if(body.kind==='galaxy'){
          ctx.save();ctx.translate(body.x,body.y);ctx.rotate(body.angle-activeTime*.018);ctx.scale(1,.56);
          // A fixed viewing plane with differential rotation inside the disc:
          // diffuse gas drifts past stars and dust while the nucleus breathes.
          drawImage(images.galaxyGas,0,0,body.scale*(1+Math.sin(activeTime*.026)*.025),body.alpha*(.94+Math.sin(activeTime*.033)*.06),activeTime*.010);
          drawImage(images.galaxy,0,0,body.scale,body.alpha,activeTime*.005);
          drawImage(images.galaxyDust,0,0,body.scale,body.alpha*.85,activeTime*.008);
          drawImage(images.galaxyClusters,0,0,body.scale*(1+Math.sin(activeTime*.031)*.012),body.alpha*(.84+Math.sin(activeTime*.043+1)*.14),activeTime*.014);
          drawImage(images.galaxyCore,0,0,body.scale*(1+Math.sin(activeTime*.055)*.035),body.alpha*(.94+Math.sin(activeTime*.055)*.06),0);
          ctx.restore();
        }
      }
    }
    const holes=bodies.filter(body=>body.kind==='blackHole'&&visible.includes(body.name));
    const nearby=[],pointerX=mouse.x*width,pointerY=mouse.y*height,influence=mobile?125:185;
    let bentStars=0;
    for(const star of stars) {
      let x=(star.x+px*star.z+width)%width,y=((star.y+py*star.z-documentScroll*.075*star.z)%height+height)%height;
      for(const hole of holes){
        const dx=x-hole.x,dy=y-hole.y,distance=Math.hypot(dx,dy),reach=145*hole.scale;
        if(distance>22*hole.scale&&distance<reach){const lens=(1-distance/reach)**2*9;x+=dx/distance*lens;y+=dy/distance*lens;}
      }
      if(active&&pointerPresent){
        const dx=pointerX-x,dy=pointerY-y,distance=Math.hypot(dx,dy);
        if(distance<influence&&distance>1){
          const gravity=(1-distance/influence)**2*(10+star.z*9);x+=dx/distance*gravity;y+=dy/distance*gravity;bentStars++;
          nearby.push({x,y,distance});
        }
      }
      const pulse=Math.pow((Math.sin(activeTime*star.speed+star.phase)+1)/2,1.7);
      const alpha=active?.035+star.z*.07+pulse*(.24+star.z*.36):.16+star.z*.25;
      const color=star.warm?'255,226,166':'232,237,247';
      if(star.rays)diffraction(ctx,x,y,3.5+star.z*3.5,star.rays,color,alpha*.58);
      if(star.z>.91){const halo=ctx.createRadialGradient(x,y,0,x,y,3.5);halo.addColorStop(0,`rgba(${color},${alpha*.25})`);halo.addColorStop(1,`rgba(${color},0)`);circle(ctx,x,y,3.5,halo);}
      circle(ctx,x,y,star.r,`rgba(${color},${alpha})`);
      if(star.pulsar){
        const beat=active?Math.sin(activeTime*1.4+star.phase)**6:.2;
        drawImage(images.bloom,x,y,.075+beat*.05,beat*.42);
        diffraction(ctx,x,y,2.5+beat*5,4,color,beat*.24);
      }
    }
    let links=0;
    if(nearby.length>1){
      // Bound the work and brightness: a small local navigation-like polygon,
      // rather than a web of lines over every star or the page's content.
      const points=nearby.sort((a,b)=>a.distance-b.distance).slice(0,6);
      points.sort((a,b)=>Math.atan2(a.y-pointerY,a.x-pointerX)-Math.atan2(b.y-pointerY,b.x-pointerX));
      for(let index=0;index<points.length;index++){
        const first=points[index],second=points[(index+1)%points.length],distance=Math.hypot(first.x-second.x,first.y-second.y);
        if(distance>165||index===1&&points.length===2)continue;
        ctx.beginPath();ctx.moveTo(first.x,first.y);ctx.lineTo(second.x,second.y);ctx.strokeStyle=`rgba(155,191,226,${(1-Math.max(first.distance,second.distance)/influence)*.15})`;ctx.lineWidth=.55;ctx.stroke();links++;
      }
    }
    for(const body of bodies){
      if(body.kind==='nebula'||body.kind==='galaxy'||!visible.includes(body.name))continue;
      const shimmer=body.kind==='quasar'?.94+Math.sin(activeTime*.76)*.06:body.kind==='supernova'?.82+Math.sin(activeTime*.88)*.18:1;
      if(body.kind==='moon')drawMoon(body,activeTime);
      else drawImage(images[body.kind],body.x,body.y,body.scale*(body.kind==='supernova'?1+Math.sin(activeTime*.88)*.035:1),body.alpha*shimmer,body.angle);
      if(body.kind==='planet')drawPlanetWeather(body,activeTime);
      if(body.kind==='quasar')drawOrbitalFlow(body,activeTime*.28,images.accretionFlow,-.42,.21,.58,.8);
      if(body.kind==='blackHole')drawGravityWell(body,activeTime);
      if(active&&body.kind==='sun'){
        const passage=(activeTime+scene.seed%37)%173;
        if(passage>78&&passage<97){
          const eclipse=(passage-78)/19;
          ctx.save();ctx.translate(body.x,body.y);ctx.scale(body.scale,body.scale);ctx.globalAlpha=body.alpha;
          circle(ctx,(eclipse-.5)*280,Math.sin(eclipse*Math.PI)*3,58,'#010205');ctx.restore();
        }
      }
    }
    const planet=bodies.find(body=>body.kind==='planet'),orbit=active?activeTime*.07:.9;
    if(planet&&visible.includes(planet.name)){
      circle(ctx,planet.x+Math.cos(orbit)*139*planet.scale,planet.y+Math.sin(orbit)*40*planet.scale,1.3*planet.scale,'rgba(203,212,222,.5)');
      circle(ctx,planet.x+Math.cos(orbit+3.4)*112*planet.scale,planet.y+Math.sin(orbit+3.4)*31*planet.scale,.8*planet.scale,'rgba(226,212,179,.4)');
    }
    for(const rock of asteroids){
      const x=((rock.x+activeTime*rock.speedX+px*.6+50)%(width+100)+width+100)%(width+100)-50;
      const y=((rock.y+activeTime*rock.speedY-documentScroll*.16+py*.6+50)%(height+100)+height+100)%(height+100)-50;
      drawImage(rock.image,x,y,rock.scale,mobile?.38:.48,rock.phase+activeTime*rock.rotation);
    }
    if(active)drawRareEvents(activeTime,mobile);
    const positions=JSON.stringify(Object.fromEntries(bodies.map(body=>[body.name,Math.round(body.y)])));
    if(field.dataset.celestialPositions!==positions)field.dataset.celestialPositions=positions;
    const coordinates=JSON.stringify(Object.fromEntries(bodies.map(body=>[body.name,{x:Math.round(body.x),y:Math.round(body.y)}])));
    if(field.dataset.celestialCoordinates!==coordinates)field.dataset.celestialCoordinates=coordinates;
    const visibleNames=visible.join(',');if(field.dataset.celestialBodiesVisible!==visibleNames)field.dataset.celestialBodiesVisible=visibleNames;
    field.dataset.spacecraftPassages=JSON.stringify(bodies.filter(body=>body.kind==='ship').map(body=>({name:body.name,state:!active?'still':body.flightState,progress:Number(body.flightProgress.toFixed(3))})));
    const meteorState=String(active&&!!meteor);if(field.dataset.meteorActive!==meteorState)field.dataset.meteorActive=meteorState;
    field.dataset.cursorLinks=String(links);field.dataset.cursorBentStars=String(bentStars);
    field.dataset.rarePhenomena=[comet&&'comet',traveler&&'astronaut',nova&&'supernova'].filter(Boolean).join(',');
    field.dataset.renderedFrames=String(++renderedFrames);
    field.dataset.scrollPosition=scroll.toFixed(2);
    field.dataset.scrollTarget=scrollTarget.toFixed(2);
  }
  function tick(now) {
    frameId=0;if(document.hidden||reducedMotion.matches)return;
    const elapsed=lastTick?Math.min((now-lastTick)/1000,.05):1/60;
    lastTick=now;time+=elapsed;
    // Ease only the background camera, never the page itself. A short,
    // time-based response removes wheel/touch event steps on any refresh rate.
    const scrollDistance=scrollTarget-scroll;
    const pointerDistance=Math.max(Math.abs(target.x-mouse.x),Math.abs(target.y-mouse.y));
    scroll+=scrollDistance*(1-Math.exp(-elapsed/.042));
    if(Math.abs(scrollTarget-scroll)<.04)scroll=scrollTarget;
    const pointerEase=1-Math.exp(-elapsed/.11);
    mouse.x+=(target.x-mouse.x)*pointerEase;mouse.y+=(target.y-mouse.y)*pointerEase;
    const interactive=Math.abs(scrollDistance)>.04||pointerDistance>.00015;
    // Scroll and pointer movement paint on every available display frame.
    // The restrained idle sky can paint at 30fps without quantizing parallax.
    if(interactive||!lastPaint||now-lastPaint>=1000/30-.5){
      lastPaint=now;field.dataset.renderCadence=interactive?'display':'idle';draw();
    }
    frameId=requestAnimationFrame(tick);
  }
  function resume() {cancelAnimationFrame(frameId);frameId=0;lastTick=lastPaint=0;scroll=scrollTarget=scrollY;field.classList.toggle('ambient-still',reducedMotion.matches);field.dataset.motionState=document.hidden?'hidden':reducedMotion.matches?'reduced':'running';aura.hidden=reducedMotion.matches;if(!reducedMotion.matches&&!document.hidden)frameId=requestAnimationFrame(tick);else if(!document.hidden){field.dataset.renderCadence='reduced';draw();}}
  function pointer(event) {if(event.pointerType==='touch'||reducedMotion.matches||!width||!height)return;if(!pointerPresent){pointerPresent=true;field.dataset.pointerActive='true';document.documentElement.dataset.cursorActive='true';}target={x:event.clientX/width,y:event.clientY/height};for(const node of [field,document.documentElement]){node.style.setProperty('--pointer-x',`${event.clientX}px`);node.style.setProperty('--pointer-y',`${event.clientY}px`);}}
  function hidePointer(event) {if(event?.type==='pointerout'&&event.relatedTarget)return;pointerPresent=false;delete field.dataset.pointerActive;delete document.documentElement.dataset.cursorActive;document.documentElement.style.setProperty('--pointer-x','-100px');document.documentElement.style.setProperty('--pointer-y','-100px');}
  function onScroll() {scrollTarget=scrollY;if(!reducedMotion.matches&&!document.hidden&&!frameId)frameId=requestAnimationFrame(tick);}
  // A new document or history entry restores its own position immediately;
  // it should not inherit the previous page's camera interpolation.
  function onPageChange() {scroll=scrollTarget=scrollY;lastPaint=0;if(!document.hidden)draw();}
  window.addEventListener('pointermove',pointer,{passive:true});window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pointerout',hidePointer,{passive:true});window.addEventListener('blur',hidePointer);
  document.addEventListener('visibilitychange',resume);document.addEventListener('portfolio:pagechange',onPageChange);reducedMotion.addEventListener('change',resume);
  resize();resume();
  return()=>{cancelAnimationFrame(frameId);window.removeEventListener('pointermove',pointer);window.removeEventListener('pointerout',hidePointer);window.removeEventListener('blur',hidePointer);window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',resume);document.removeEventListener('portfolio:pagechange',onPageChange);reducedMotion.removeEventListener('change',resume);field.remove();aura.remove();delete document.documentElement.dataset.cursorActive;};
}
