// A quiet, high-resolution moon. Texture and sphere normals are made once;
// only adjacent lighting frames are cached and blended as the phase changes.
export const MOON_PHASE_PERIOD = 900;
const SIZE = 256, CENTER = SIZE / 2, RADIUS = 94, STEPS = 96;
const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));

export function createLunarSurface(seed = 2231) {
  let value = seed;
  const random = () => {value = value * 16807 % 2147483647;return (value - 1) / 2147483646;};
  const canvas = () => {const image=document.createElement('canvas');image.width=image.height=SIZE;return image;};
  const texture=canvas(), paint=texture.getContext('2d',{willReadFrequently:true});
  const image=canvas(), output=image.getContext('2d');
  const halo=canvas(), glow=halo.getContext('2d');
  if(!paint||!output||!glow)return null;
  image.dataset.celestialTexture='moon-surface';
  image.dataset.radius=String(RADIUS);
  image.dataset.phasePeriod=String(MOON_PHASE_PERIOD);
  paint.translate(CENTER,CENTER);
  paint.beginPath();paint.arc(0,0,RADIUS,0,TAU);paint.clip();
  const material=paint.createRadialGradient(-12,-17,5,0,0,RADIUS*1.15);
  material.addColorStop(0,'#b7bec8');material.addColorStop(.58,'#a4aebc');material.addColorStop(1,'#7a8799');
  paint.fillStyle=material;paint.fillRect(-RADIUS,-RADIUS,RADIUS*2,RADIUS*2);

  // Low-contrast basalt seas interrupt the highlands with broad organic shapes.
  for(const [x,y,rx,ry,angle] of [[-31,-23,31,24,.2],[-4,-45,27,21,-.3],[32,-19,23,30,.4],[-10,20,26,20,-.2],[-48,15,19,28,.35],[37,32,18,19,-.2]]){
    paint.save();paint.translate(x,y);paint.rotate(angle);paint.scale(rx,ry);
    paint.beginPath();
    for(let step=0;step<=36;step++){
      const a=step/36*TAU,shape=1+Math.sin(a*3+angle)*.09+Math.cos(a*5+x)*.05;
      const px=Math.cos(a)*shape,py=Math.sin(a)*shape;
      step?paint.lineTo(px,py):paint.moveTo(px,py);
    }
    paint.closePath();const sea=paint.createRadialGradient(-.1,-.15,.1,0,0,1.15);
    sea.addColorStop(0,'rgba(51,66,85,.38)');sea.addColorStop(.65,'rgba(62,76,94,.24)');sea.addColorStop(1,'rgba(76,87,103,0)');
    paint.fillStyle=sea;paint.fill();paint.restore();
  }
  function crater(x,y,r,contrast=1){
    paint.save();paint.translate(x,y);paint.rotate(Math.atan2(y,x));
    paint.scale(.7+.3*Math.sqrt(Math.max(0,1-(x*x+y*y)/(RADIUS*RADIUS))),1);
    const bowl=paint.createRadialGradient(r*.15,r*.19,r*.1,0,0,r);
    bowl.addColorStop(0,`rgba(43,55,72,${.26*contrast})`);bowl.addColorStop(.7,`rgba(58,70,88,${.16*contrast})`);bowl.addColorStop(1,'rgba(110,121,137,0)');
    paint.beginPath();paint.arc(0,0,r,0,TAU);paint.fillStyle=bowl;paint.fill();
    paint.beginPath();paint.arc(-.35,-.4,r*.86,Math.PI*.82,Math.PI*1.85);paint.strokeStyle=`rgba(232,235,241,${.2*contrast})`;paint.lineWidth=Math.max(.5,r*.08);paint.stroke();
    paint.beginPath();paint.arc(.35,.4,r*.9,-.1,Math.PI*.8);paint.strokeStyle=`rgba(51,65,83,${.13*contrast})`;paint.lineWidth=.6;paint.stroke();paint.restore();
  }
  for(let index=0;index<115;index++){
    const a=random()*TAU,distance=Math.sqrt(random())*RADIUS*.97;
    crater(Math.cos(a)*distance,Math.sin(a)*distance,1.1+random()**2*7.5,.55+random()*.5);
  }
  // A pair of brighter impact sites and fine ejecta rays add recognizable detail.
  for(const [x,y,r] of [[22,48,8.5],[-29,4,6]]){
    for(let ray=0;ray<13;ray++){
      const angle=random()*TAU,length=r*(2.8+random()*3.4);
      paint.beginPath();paint.moveTo(x+Math.cos(angle)*r,y+Math.sin(angle)*r);
      paint.lineTo(x+Math.cos(angle)*length,y+Math.sin(angle)*length);
      paint.strokeStyle='rgba(226,231,238,.075)';paint.lineWidth=.4+random()*.8;paint.stroke();
    }
    crater(x,y,r,1.05);
  }
  for(let grain=0;grain<2300;grain++){
    const x=random()*RADIUS*2-RADIUS,y=random()*RADIUS*2-RADIUS;
    paint.fillStyle=random()>.5?'rgba(235,239,244,.045)':'rgba(44,57,75,.045)';
    paint.fillRect(x,y,.4+random()*.7,.4+random()*.7);
  }

  const base=paint.getImageData(0,0,SIZE,SIZE), pixels=[];
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const nx=(x+.5-CENTER)/RADIUS,ny=(y+.5-CENTER)/RADIUS,distance=nx*nx+ny*ny;
    if(base.data[(y*SIZE+x)*4+3]){
      // Shade antialiased rim pixels too; leaving them fully lit would make
      // an artificial dotted outline around the otherwise quiet night side.
      const edge=distance>1?1/Math.sqrt(distance):1;
      pixels.push({index:(y*SIZE+x)*4,nx:nx*edge,ny:ny*edge,nz:Math.sqrt(Math.max(0,1-distance))});
    }
  }
  const brightness=new Float32Array(2049);
  for(let index=0;index<brightness.length;index++){
    const dot=index/1024-1;
    brightness[index]=.055+.945*Math.pow(clamp((dot+.035)/1.035),.68);
  }
  const rim=glow.createRadialGradient(CENTER,CENTER,RADIUS-1,CENTER,CENTER,116);
  rim.addColorStop(0,'rgba(159,186,215,.035)');rim.addColorStop(.3,'rgba(131,158,193,.015)');rim.addColorStop(1,'rgba(119,150,190,0)');
  glow.fillStyle=rim;glow.fillRect(0,0,SIZE,SIZE);
  const cache=new Map();
  function frame(index){
    const key=(index+STEPS)%STEPS;
    if(cache.has(key))return cache.get(key);
    const phase=key/STEPS*TAU,side=Math.sin(phase),lx=side*Math.cos(-.22),ly=side*Math.sin(-.22),lz=Math.cos(phase);
    const surface=canvas(),context=surface.getContext('2d'),data=new ImageData(new Uint8ClampedArray(base.data),SIZE,SIZE);
    if(!context)return texture;
    for(const pixel of pixels){
      const dot=pixel.nx*lx+pixel.ny*ly+pixel.nz*lz;
      const light=brightness[Math.max(0,Math.min(2048,Math.round((dot+1)*1024)))];
      for(let channel=0;channel<3;channel++)data.data[pixel.index+channel]=base.data[pixel.index+channel]*light;
    }
    context.putImageData(data,0,0);cache.set(key,surface);
    if(cache.size>4)cache.delete(cache.keys().next().value);
    return surface;
  }
  let previousPhase;
  function render(phase){
    const normalized=(phase%TAU+TAU)%TAU;
    if(normalized===previousPhase)return image;
    previousPhase=normalized;
    const position=normalized/TAU*STEPS,index=Math.floor(position),fraction=position-index;
    output.globalAlpha=1;output.clearRect(0,0,SIZE,SIZE);output.drawImage(halo,0,0);
    output.drawImage(frame(index),0,0);
    if(fraction>0){output.globalAlpha=fraction;output.drawImage(frame(index+1),0,0);}
    output.globalAlpha=1;image.dataset.phase=normalized.toFixed(7);
    image.dataset.illumination=((1+Math.cos(normalized))/2).toFixed(7);
    return image;
  }
  return {image,render};
}
