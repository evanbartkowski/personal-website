import {createPortraitGeometry} from './portrait-geometry.js';
export {createPortraitGeometry} from './portrait-geometry.js';

// Fine spatial filaments over a transparent canvas: only derived geometry is
// public. This renderer needs no WebGL, face service, camera, or model runtime.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const mix=(a,b,t)=>a.map((v,i)=>Math.round(lerp(v,b[i],t)));
const ink=(color,alpha)=>`rgba(${color},${clamp(alpha,0,1)})`;
const phosphor=hue=>{const a=.76*Math.min(.66,1-.66);return [0,8,4].map(n=>{const k=(n+hue*12)%12;return Math.round(255*(.66-a*Math.max(-1,Math.min(k-3,9-k,1))));});};

export function mountPortrait(host) {
  if(!host)return()=>{};
  const lifetime=new AbortController(),on=(target,type,callback)=>target.addEventListener(type,callback,{signal:lifetime.signal});
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),canvas=document.createElement('canvas');
  canvas.className='portrait-canvas';canvas.setAttribute('aria-hidden','true');
  const context=canvas.getContext('2d',{alpha:true});if(!context)return()=>{};
  host.append(canvas);host.dataset.renderer='perspective-3d';
  let geometry,projected=[],active=true,visible=true,rendererLost=false,frame=0,last=0,elapsed=0,width=0,height=0,ratio=1;
  let targetYaw=-.075,targetPitch=-.018,targetRoll=0,yaw=-.075,pitch=-.018,roll=0,yawVelocity=0,pitchVelocity=0,rollVelocity=0;
  let cursorX=0,cursorY=0,targetCursorX=0,targetCursorY=0,gazeX=0,gazeY=0,targetGazeX=0,targetGazeY=0;
  let thinkingBlend=0,responseBlend=0;
  let palette={line:[132,155,171],light:[184,206,219],cool:[136,184,208],energy:[119,175,199],iris:[181,200,244]};
  const activityState=()=>{const state=['thinking','responding','error'].includes(host.dataset.aiState)?host.dataset.aiState:'idle';host.dataset.activityState=state;return state;};
  function readPalette(){
    const style=getComputedStyle(host),swatch=document.createElement('span');swatch.style.color=style.getPropertyValue('--green').trim()||'#849bab';host.append(swatch);
    const raw=getComputedStyle(swatch).color.match(/[\d.]+/g)?.slice(0,3).map(Number)||[132,155,171];swatch.remove();
    palette={line:mix(raw,[138,181,208],.26),light:mix(raw,[215,233,247],.53),cool:mix(raw,[117,175,235],.51),energy:mix(raw,[131,197,242],.60),iris:mix(raw,[190,195,255],.80)};
  }
  let hostRect=null;
  function resize(){
    if(!active)return;hostRect=host.getBoundingClientRect();width=hostRect.width;height=hostRect.height;ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));render();
  }
  function paintNeuralField(scale,colors,strength,responding,staticMotion){
    if(strength<.005)return;
    const clock=staticMotion?1.4:elapsed,cx=width*.5-yaw*scale*.15,cy=height*.43+pitch*scale*.15;
    const radius=scale*1.26,flow=clock*(.18+responding*.10),nodes=[];
    context.save();context.globalCompositeOperation='lighter';context.lineWidth=.55*Math.min(1,width/230);
    // Curved signal sheets leave the center open, so the face remains the
    // primary silhouette. Every frame has a fixed, small geometry budget.
    for(let strand=0;strand<12;strand++){
      const phase=strand*Math.PI/6,side=strand%2?-1:1;
      context.strokeStyle=ink(strand%3===0?colors.iris:colors.energy,strength*(.10+.035*Math.sin(phase+flow)**2));
      context.beginPath();
      for(let step=0;step<=28;step++){
        const t=step/28,angle=phase+t*Math.PI*1.35+flow*.30;
        const r=radius*(.88+.22*Math.sin(t*Math.PI)+.055*Math.sin(t*10+flow*2+phase));
        const x=cx+Math.cos(angle)*r*(.82+.08*Math.sin(flow+phase));
        const y=cy+Math.sin(angle)*r*.94+side*Math.sin(t*8+flow*3+phase)*scale*.028;
        step?context.lineTo(x,y):context.moveTo(x,y);
      }context.stroke();
    }
    // A pair of tilted partial orbit traces and their linked signals suggest
    // a neural computation rather than a static decorative halo.
    for(let ring=0;ring<2;ring++){
      context.strokeStyle=ink(ring?colors.cool:colors.energy,strength*.17);context.beginPath();
      context.ellipse(cx,cy,radius*(1.01+ring*.09),radius*(.58+ring*.17),.54+ring*.71+Math.sin(flow*.4)*.08,flow+ring*2.3,flow+ring*2.3+Math.PI*1.20);context.stroke();
    }
    for(let i=0;i<40;i++){
      const orbit=i*2.399963,angle=orbit+flow*(i%2?.42:-.32),r=radius*(.76+(i%9)/30);
      const x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r*.94;
      nodes.push([x,y]);
      const light=.17+.15*Math.sin(clock*1.6+i*1.73)**2;
      context.fillStyle=ink(i%4===0?colors.iris:colors.energy,light*strength);
      const size=(i%6===0?1.5:.9)*Math.min(1,width/230);context.fillRect(x-size/2,y-size/2,size,size);
      if(i>0&&i%3!==0){
        const prior=nodes[i-1],distance=Math.hypot(x-prior[0],y-prior[1]);
        if(distance<radius*.82){context.strokeStyle=ink(colors.cool,strength*.10);context.beginPath();context.moveTo(...prior);context.lineTo(x,y);context.stroke();}
      }
      context.strokeStyle=ink(colors.energy,strength*.14);context.beginPath();context.moveTo(x,y);
      context.lineTo(x-Math.sin(angle)*scale*.035,y+Math.cos(angle)*scale*.035);context.stroke();
    }
    context.restore();
  }
  function render(){
    if(!geometry||!width||!height||!active)return;
    context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);
    const scale=Math.min(width/2.85,height/(geometry.height*1.04)),detailScale=Math.min(1,width/230);
    const aiState=activityState(),thinking=aiState==='thinking',responding=aiState==='responding',staticMotion=motion.matches,chatOpen=host.dataset.chatOpen==='true';
    if(staticMotion){thinkingBlend=thinking?1:0;responseBlend=responding?1:0;}
    const dim=chatOpen?.62:1,colors={};
    for(const [name,rgb]of Object.entries(palette))colors[name]=(chatOpen?mix(rgb,name==='iris'?[190,150,247]:name==='energy'?[128,161,249]:[133,147,222],name==='iris'?.48:.44):rgb).join(',');
    const spectrum=phosphor(staticMotion?.56:(elapsed*.105)%1);
    colors.iris=mix(colors.iris.split(',').map(Number),spectrum,responseBlend*.94).join(',');
    colors.optic=mix(colors.energy.split(',').map(Number),phosphor(staticMotion?.60:(elapsed*.105+.085)%1),responseBlend*.91).join(',');
    const eyePulse=staticMotion?(thinking?1.22:responding?1.12:1):.98+.025*Math.sin(elapsed*1.15)+thinkingBlend*(.13+.08*Math.sin(elapsed*4.2))+responseBlend*(.12+.07*Math.sin(elapsed*5.8));
    const speech=responding?(staticMotion?.82:.44+.32*Math.sin(elapsed*13)**2+.24*Math.sin(elapsed*5.3)**2):0;
    const sweep=staticMotion?(thinking?.46:-10):(elapsed*(thinking?.32:.055)%1.50)-.25;
    const turn=staticMotion?-.075:yaw+Math.sin(elapsed*.53)*.009;
    const tilt=staticMotion?-.018:pitch+Math.sin(elapsed*.71)*.005;
    const bank=staticMotion?0:roll+Math.sin(elapsed*.39)*.005;
    const sy=Math.sin(turn),cy=Math.cos(turn),sx=Math.sin(tilt),cx=Math.cos(tilt),sr=Math.sin(bank),cr=Math.cos(bank);
    const breathing=staticMotion?0:Math.sin(elapsed*1.03)*.010;
    for(let index=0;index<geometry.points.length;index++){
      const source=geometry.points[index],{kind,zone,energy}=source,[rawX,rawY,rawZ]=source.p;
      let x=rawX,y=rawY-geometry.centerY,z=rawZ;
      if(!staticMotion){
        // Cursor gravity gently bends the nearby lattice, independently of the
        // head's inertial rotation. Tiny phase offsets avoid a rigid mask feel.
        const distance=(rawX-cursorX)**2+(rawY-cursorY)**2,influence=Math.exp(-distance*2.2),wave=Math.sin(elapsed*1.65+rawY*3.8+rawX*2.1);
        x+=(cursorX-rawX)*influence*.020;
        y+=(cursorY-rawY)*influence*.012+breathing*(kind==='shoulder'?.65:1);
        z+=influence*(.012+wave*.009)+Math.sin(elapsed*.8+rawY*2.8)*.004;
        if(kind==='fragment'){x+=Math.sin(elapsed*.6+index)*.017;y+=Math.cos(elapsed*.47+index*.3)*.024;}
        if(kind==='iris'){x+=gazeX*.021;y-=gazeY*.011;}
        if(responding&&zone==='mouth'){y-=(1-Math.abs(rawX)/.45)*speech*.009;z+=speech*.007;}
      }
      const rx=x*cy+z*sy,rz=z*cy-x*sy,ry=y*cx-rz*sx,depth=rz*cx+y*sx;
      const bx=rx*cr-ry*sr,by=rx*sr+ry*cr,perspective=5.5/(5.5-depth);
      // Back-of-head triangles stay legible at a turn and disappear softly
      // through the facial surface when seen from the front.
      const depthFade=clamp(.48+(depth+.55)*.58,.12,1);
      const baseFade=kind==='shoulder'?clamp((rawY-geometry.minY)/.72,0,1)*.38:kind==='fragment'?.28:kind==='skull'?.47:kind==='iris'||kind==='optic'?1:.88;
      const p=projected[index];p.x=width/2+bx*scale*perspective;p.y=height/2-by*scale*perspective;p.z=depth;p.fade=baseFade*depthFade;p.energy=energy;p.kind=kind;p.zone=zone;p.rawY=rawY;p.hidden=source.hidden;
    }
    paintNeuralField(scale,colors,clamp(thinkingBlend+responseBlend*.85,0,1)*(chatOpen?.86:1),responseBlend,staticMotion);
    // The first two circles are always the projected optical centers (468 and
    // 473). Soft radial light stays inside the filaments, never a solid eye.
    for(const center of [468,473]){
      const p=projected[center],radius=scale*.10,glow=context.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
      glow.addColorStop(0,ink(colors.iris,.13*eyePulse*dim));glow.addColorStop(.30,ink(colors.optic,.055*eyePulse*dim));glow.addColorStop(1,ink(colors.iris,0));
      context.fillStyle=glow;context.beginPath();context.arc(p.x,p.y,radius,0,Math.PI*2);context.fill();
    }
    // Thousands of short filaments share a few color/opacity buckets. Batching
    // avoids thousands of expensive canvas stroke calls for each frame.
    const edgeBatches=new Map();
    for(const edge of geometry.edges){
      const a=projected[edge.a],b=projected[edge.b],iris=edge.kind==='iris',optic=edge.kind==='optic',feature=edge.kind==='feature'||edge.kind==='silhouette'||optic||edge.kind==='mouth';
      const scan=thinking?Math.max(0,1-Math.abs((a.y+b.y)/2/height-sweep)/.075):0;
      const neural=thinking&&(a.zone==='circuit'||b.zone==='circuit');
      let alpha=iris?.65*eyePulse:optic?.57*eyePulse:edge.kind==='mouth'?.34:edge.kind==='feature'?.45:edge.kind==='silhouette'?.24:edge.kind==='fragment'?.24:edge.kind==='shoulder'?.18:.255;
      if(thinking)alpha+=scan*(feature?.32:.21)+(neural?(staticMotion?.12:.06+.08*Math.sin(elapsed*3.7+a.rawY*5)**2):0);
      if(responding&&(edge.zone==='mouth'||a.zone==='mouth'&&b.zone==='mouth'))alpha+=speech*.30;
      alpha*=Math.min(a.fade,b.fade)*dim;
      const color=iris?'iris':optic?'optic':responding&&edge.zone==='mouth'?'energy':neural||scan>.25?'energy':feature?'light':'line';
      const opacity=clamp(Math.round(alpha*28),1,27),key=`${color}:${opacity}:${iris?2:feature?1:0}`;
      let batch=edgeBatches.get(key);if(!batch){batch={color,opacity:opacity/28,lineWidth:(iris?.71:feature?.64:.44)*detailScale,segments:[]};edgeBatches.set(key,batch);}
      batch.segments.push(a,b);
    }
    for(const batch of edgeBatches.values()){
      context.strokeStyle=ink(colors[batch.color],batch.opacity);context.lineWidth=batch.lineWidth;context.beginPath();
      for(let i=0;i<batch.segments.length;i+=2){const a=batch.segments[i],b=batch.segments[i+1];context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);}context.stroke();
    }
    const dotBatches=new Map();
    for(let index=0;index<projected.length;index++){
      const p=projected[index],iris=p.kind==='iris',scan=thinking?Math.max(0,1-Math.abs(p.y/height-sweep)/.055):0;
      if(p.hidden||p.kind==='mouth'||p.kind==='optic'||iris&&p.energy<.75)continue;
      let alpha=(.16+p.energy*.30+scan*.38)*p.fade*dim;
      if(iris)alpha=.78*eyePulse*dim;
      if(responding&&p.zone==='mouth')alpha+=speech*.20*dim;
      const color=iris?'iris':scan>.25?'energy':index%9===0?'cool':'light',opacity=clamp(Math.round(alpha*20),1,19),key=`${color}:${opacity}:${iris?1:0}`;
      let batch=dotBatches.get(key);if(!batch){batch={color,opacity:opacity/20,radius:(iris?.49:.32+p.energy*.12)*detailScale,points:[]};dotBatches.set(key,batch);}batch.points.push(p);
    }
    for(const batch of dotBatches.values()){
      context.fillStyle=ink(colors[batch.color],batch.opacity);context.beginPath();
      for(const p of batch.points){context.moveTo(p.x+batch.radius,p.y);context.arc(p.x,p.y,batch.radius,0,Math.PI*2);}context.fill();
    }
  }
  function tick(now){
    frame=0;if(!active||!visible||document.hidden||motion.matches||!geometry)return;
    const dt=last?Math.min((now-last)/1000,.040):0;last=now;elapsed+=dt;
    const aiState=activityState(),attack=1-Math.exp(-dt*5.8),decay=1-Math.exp(-dt*3.5);
    thinkingBlend=lerp(thinkingBlend,aiState==='thinking'?1:0,aiState==='thinking'?attack:decay);
    responseBlend=lerp(responseBlend,aiState==='responding'?1:0,aiState==='responding'?attack:decay);
    // Critically damped springs give acceleration, a tiny follow-through and a
    // soft return. Gaze settles faster than the anatomical head movement.
    yawVelocity+=((targetYaw-yaw)*43-yawVelocity*10.8)*dt;yaw+=yawVelocity*dt;
    pitchVelocity+=((targetPitch-pitch)*42-pitchVelocity*11.2)*dt;pitch+=pitchVelocity*dt;
    rollVelocity+=((targetRoll-roll)*30-rollVelocity*8.9)*dt;roll+=rollVelocity*dt;
    const smoothing=1-Math.exp(-dt*4.7),eyeSmoothing=1-Math.exp(-dt*8);
    cursorX=lerp(cursorX,targetCursorX,smoothing);cursorY=lerp(cursorY,targetCursorY,smoothing);
    gazeX=lerp(gazeX,targetGazeX,eyeSmoothing);gazeY=lerp(gazeY,targetGazeY,eyeSmoothing);
    render();frame=requestAnimationFrame(tick);
  }
  function sync(){
    cancelAnimationFrame(frame);frame=0;last=0;const paused=!geometry||!visible||document.hidden||motion.matches;
    host.dataset.motionState=paused?'paused':'running';if(geometry&&!document.hidden&&visible)render();if(geometry&&!paused)frame=requestAnimationFrame(tick);
  }
  on(canvas,'contextlost',event=>{event.preventDefault();rendererLost=true;geometry=undefined;host.dataset.state='fallback';sync();canvas.remove();});
  on(window,'scroll',()=>{hostRect=null;},{passive:true});
  on(window,'pointermove',event=>{
    if(event.pointerType==='touch'||motion.matches||!visible)return;
    const nx=event.clientX/innerWidth-.5,ny=event.clientY/innerHeight-.5;
    if(!hostRect)hostRect=host.getBoundingClientRect();
    targetYaw=clamp(nx*.60,-.30,.30);targetPitch=clamp(ny*.24,-.12,.12);targetRoll=-nx*.034;
    targetGazeX=clamp(nx*2,-1,1);targetGazeY=clamp(ny*2,-1,1);
    targetCursorX=clamp((event.clientX-(hostRect.left+hostRect.width/2))/Math.max(1,hostRect.width)*2.85,-2,2);
    targetCursorY=clamp(-(event.clientY-(hostRect.top+hostRect.height/2))/Math.max(1,hostRect.height)*(geometry?.height??3.34)+(geometry?.centerY??-.20),-2,2);
  });
  on(document,'pointerleave',()=>{targetYaw=-.075;targetPitch=-.018;targetRoll=0;targetCursorX=targetCursorY=targetGazeX=targetGazeY=0;});
  on(document,'visibilitychange',sync);on(motion,'change',sync);
  on(document,'portfolio:settingschange',()=>{readPalette();if(visible&&!document.hidden)render();});
  on(host,'portrait:aistatechange',()=>{activityState();if(visible&&!document.hidden)render();});
  on(host,'portrait:chatvisibilitychange',()=>{if(visible&&!document.hidden)render();});
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{rootMargin:'30px'}):null;observer?.observe(host);
  const sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;sizeObserver?.observe(host);on(window,'resize',resize);
  readPalette();resize();
  const url=new URL('./assets/portrait/evan-face.json',import.meta.url),version=new URL(import.meta.url).searchParams.get('v');if(version)url.searchParams.set('v',version);
  fetch(url,{signal:lifetime.signal}).then(async response=>{
    if(!response.ok)throw Error('Portrait unavailable');const data=await response.json();if(!active||rendererLost)return;
    if(!Array.isArray(data.positions)||data.positions.length<478||data.positions.length>1000||!data.positions.every(p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<10))||!Array.isArray(data.edges)||data.edges.length>3000||!data.edges.every(e=>e.length===2&&e.every(i=>Number.isInteger(i)&&i>=0&&i<data.positions.length)))throw Error('Invalid portrait');
    geometry=createPortraitGeometry(data);projected=geometry.points.map(()=>({}));host.dataset.pointCount=String(geometry.points.length);host.dataset.edgeCount=String(geometry.edges.length);host.dataset.state='ready';resize();sync();
  }).catch(()=>{if(active){host.dataset.state='fallback';canvas.remove();sync();}});
  return()=>{active=false;lifetime.abort();cancelAnimationFrame(frame);observer?.disconnect();sizeObserver?.disconnect();canvas.remove();host.dataset.motionState='disposed';delete host.dataset.state;delete host.dataset.activityState;delete host.dataset.pointCount;delete host.dataset.edgeCount;geometry=undefined;projected=[];};
}
