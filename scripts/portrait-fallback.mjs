import {createPortraitGeometry} from '../portrait.js';

// A transparent wire projection from the identical spatial mesh. An internal
// luminance mask preserves fine alpha coverage when used as a CSS color mask.
export function portraitFallback(data,{eyesOnly=false}={}){
  const geometry=createPortraitGeometry(data),width=300,height=390,scale=Math.min(width/2.85,height/(geometry.height*1.04));
  const points=geometry.points.map(({p,kind,hidden})=>{
    const [x,rawY,z]=p,y=rawY-geometry.centerY,rx=x*Math.cos(-.075)+z*Math.sin(-.075),rz=z*Math.cos(-.075)-x*Math.sin(-.075);
    const ry=y*Math.cos(-.018)-rz*Math.sin(-.018),depth=rz*Math.cos(-.018)+y*Math.sin(-.018),perspective=5.5/(5.5-depth);
    const base=kind==='shoulder'?Math.max(0,Math.min(1,(rawY-geometry.minY)/.72))*.38:kind==='fragment'?.28:kind==='skull'?.47:kind==='iris'||kind==='optic'?1:.88;
    return {x:+(width/2+rx*scale*perspective).toFixed(2),y:+(height/2-ry*scale*perspective).toFixed(2),fade:base*Math.max(.12,Math.min(1,.48+(depth+.55)*.58)),hidden};
  });
  const batches=new Map();
  for(const edge of geometry.edges){
    const optical=edge.kind==='iris'||edge.kind==='optic',fine=edge.kind==='feature'||optical||edge.kind==='mouth';
    if(eyesOnly?!optical:optical)continue;
    const a=points[edge.a],b=points[edge.b],opacity=Math.max(.025,Math.round((edge.kind==='iris'?.65:edge.kind==='optic'?.57:edge.kind==='mouth'?.34:edge.kind==='feature'?.45:edge.kind==='silhouette'?.24:edge.kind==='fragment'?.24:edge.kind==='shoulder'?.18:.255)*Math.min(a.fade,b.fade)*28)/28).toFixed(3);
    const key=`${opacity}:${fine?.65:.44}`;
    let batch=batches.get(key);if(!batch){batch={opacity,width:fine?.65:.44,path:[]};batches.set(key,batch);}batch.path.push(`M${a.x},${a.y}L${b.x},${b.y}`);
  }
  const paths=[...batches.values()].map(batch=>`<path d="${batch.path.join('')}" opacity="${batch.opacity}" stroke-width="${batch.width}"/>`).join('');
  const dots=points.map((p,index)=>({p,index,source:geometry.points[index]})).filter(({p,index,source})=>!p.hidden&&source.kind!=='mouth'&&source.kind!=='optic'&&(eyesOnly?source.kind==='iris'&&source.energy>=.75:source.kind!=='iris'&&index%3===0)).map(({p,source})=>`<circle cx="${p.x}" cy="${p.y}" r="${source.kind==='iris'?.49:.36}" opacity="${((.16+source.energy*.30)*p.fade).toFixed(3)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><mask id="projection" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:luminance"><g fill="none" stroke="white" stroke-linecap="round">${paths}</g><g fill="white">${dots}</g></mask></defs><rect width="${width}" height="${height}" fill="white" mask="url(#projection)"/></svg>\n`;
}
