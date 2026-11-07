// The public photo-derived landmarks form the inner surface of a denser
// projection. Everything added here is geometry, never a photograph or model.
const lerp=(a,b,t)=>a+(b-a)*t;
const noise=value=>{const wave=Math.sin(value*127.1+311.7)*43758.5453;return wave-Math.floor(wave);};
const zoneOf=([x,y])=>Math.abs(x)<.44&&y<-.35&&y>-.80?'mouth':y>.62||Math.abs(x)>.79?'circuit':'';

export function createPortraitGeometry(data) {
  // Preserve source positions and ordering, including both iris centers.
  const points=data.positions.map((p,index)=>({p:[...p],kind:index>=468?'iris':'face',energy:.38+noise(index)*.55,zone:index>=468?'eye':zoneOf(p)}));
  const edges=[],panels=[],edgeKeys=new Set();
  const add=(p,kind='face',energy=.6,zone=zoneOf(p))=>{points.push({p,kind,energy,zone});return points.length-1;};
  // Keep the source landmarks intact as anchors. The projected mouth is a
  // flatter, narrower surface with a light seam instead of anatomical lips.
  const surface=data.positions.map(([x,y,z],index)=>{
    if(index>=468){points[index].hidden=true;return index;}
    const weight=Math.max(0,1-(x/.51)**2-((y+.55)/.27)**2);
    if(!weight)return index;
    points[index].hidden=true;
    return add([x,lerp(y,-.55+(y+.55)*.26,weight),lerp(z,.275+(z-.275)*.22,weight)],'face',points[index].energy,'mouth');
  });
  const inSeam=([x,y])=>Math.abs(x)<.335&&Math.abs(y+.55)<.044*Math.max(0,1-(x/.35)**2);
  const line=(a,b,kind='mesh',zone='')=>{
    if(kind==='mesh'&&(inSeam(points[a].p)||inSeam(points[b].p)))return;
    if(a===b)return;const key=`${Math.min(a,b)}:${Math.max(a,b)}:${kind}`;
    if(!edgeKeys.has(key)){edgeKeys.add(key);edges.push({a,b,kind,zone});}
  };
  const triangle=(a,b,c,kind='mesh',zone='')=>{line(a,b,kind,zone);line(b,c,kind,zone);line(c,a,kind,zone);};
  const neighbors=Array.from({length:468},()=>new Set()),midpoints=new Map();
  for(const [a,b] of data.edges)if(a<468&&b<468){neighbors[a].add(b);neighbors[b].add(a);}
  function midpoint(a,b){
    const key=`${Math.min(a,b)}:${Math.max(a,b)}`;if(midpoints.has(key))return midpoints.get(key);
    const p=points[a].p.map((v,i)=>(v+points[b].p[i])/2),id=add(p);midpoints.set(key,id);return id;
  }
  for(let a=0;a<468;a++)for(const b of neighbors[a])if(b>a)for(const c of neighbors[b])if(c>b&&neighbors[a].has(c)){
    const sa=surface[a],sb=surface[b],sc=surface[c],ab=midpoint(sa,sb),bc=midpoint(sb,sc),ca=midpoint(sc,sa);
    triangle(sa,ab,ca);triangle(sb,bc,ab);triangle(sc,ca,bc);triangle(ab,bc,ca);
  }
  for(const [name,connections] of Object.entries(data.features||{})){
    if(name==='lips'||name.includes('Iris')||name.includes('Eye'))continue;
    const kind=name==='oval'?'silhouette':'feature';
    for(const [a,b]of connections)line(surface[a],surface[b],kind);
  }
  // Two gently angular, interrupted traces suggest a synthetic mouth. Avoid a
  // closed lip outline, dense lip facets or a fleshy cupid's bow.
  for(const sign of [-1,1]){
    const seam=[],lower=[];
    for(let i=0;i<=16;i++){
      const t=i/16,x=sign*(.018+t*.31),depth=.277+.035*(1-t*t);
      seam.push(add([x,-.548+.009*t-.013*t*t,depth],'mouth',.35,'mouth'));
      if(i>=4&&i<=13)lower.push(add([x,-.586+.025*t,depth-.009],'mouth',.20,'mouth'));
    }
    for(const path of [seam,lower])for(let i=1;i<path.length;i++)line(path[i-1],path[i],'mouth','mouth');
  }
  // Slim almond optics frame smooth, open pupils. Soft arcs replace the old
  // diamond landmark loops and radial spokes.
  for(const center of [468,473]){
    const [x,y,z]=points[center].p,sign=Math.sign(x),upper=[],lower=[],outer=[],inner=[];
    for(let i=0;i<=32;i++){
      const t=i/32,dx=(t-.5)*.405,arch=Math.sin(t*Math.PI),slant=dx*sign*.085;
      upper.push(add([x+dx,y+slant+.058*arch,z-.065+.080*arch],'optic',.48,'eye'));
      lower.push(add([x+dx,y+slant-.045*arch,z-.065+.080*arch],'optic',.32,'eye'));
      const a=t*Math.PI*2;
      outer.push(add([x+Math.cos(a)*.060,y+Math.sin(a)*.039,z+.029],'iris',.62,'eye'));
      inner.push(add([x+Math.cos(a)*.029,y+Math.sin(a)*.024,z+.032],'iris',.46,'eye'));
    }
    for(let i=1;i<=32;i++){
      line(upper[i-1],upper[i],'optic','eye');line(lower[i-1],lower[i],'optic','eye');
      line(outer[i-1],outer[i],'iris','eye');if(i<12||i>17)line(inner[i-1],inner[i],'iris','eye');
    }
    const glint=add([x-.021,y+.019,z+.035],'iris',.85,'eye');
    line(glint,add([x-.006,y+.025,z+.035],'iris',.75,'eye'),'iris','eye');
  }
  // Receding rings continue the oval into a rounded bald cranium, rather than
  // making a flat outline around the face. Fine triangles close behind it.
  const oval=[10];let previous=-1,current=10;
  for(let i=0;i<40;i++){
    const next=(data.features?.oval||[]).flatMap(([a,b])=>a===current?[b]:b===current?[a]:[]).find(id=>id!==previous);
    if(next===undefined||next===10)break;oval.push(next);previous=current;current=next;
  }
  const skull=[oval];
  for(let row=1;row<=9;row++){
    const t=row/10,s=Math.cos(t*Math.PI/2)+.11*Math.sin(t*Math.PI),ring=[];
    for(let col=0;col<oval.length;col++){
      const [x,y,z]=points[oval[col]].p;
      ring.push(add([x*s,y*s+.32*Math.sin(t*Math.PI),lerp(z,-1.10,t)],'skull',.33+noise(col+row*71)*.28,'circuit'));
    }skull.push(ring);
  }
  const cap=add([0,.06,-1.10],'skull',.3,'circuit');
  for(let row=1;row<skull.length;row++)for(let col=0;col<oval.length;col++){
    const next=(col+1)%oval.length,a=skull[row-1][col],b=skull[row-1][next],c=skull[row][col],d=skull[row][next];
    triangle(a,b,c);triangle(c,b,d);
  }
  for(let col=0;col<oval.length;col++)triangle(skull.at(-1)[col],skull.at(-1)[(col+1)%oval.length],cap);
  // The neck and clavicle lattice dissolve before meeting the page.
  const neck=[];
  for(let row=0;row<12;row++){
    const t=row/11,ring=[],radius=.33+.055*t+.30*t**4;
    for(let col=0;col<32;col++){
      const a=col/32*Math.PI*2;
      ring.push(add([Math.cos(a)*radius,-.97-t*.93,-.42+Math.sin(a)*(.28+.06*t)],'shoulder',.35));
    }neck.push(ring);
  }
  for(let row=0;row<neck.length;row++)for(let col=0;col<32;col++){
    const next=(col+1)%32;line(neck[row][col],neck[row][next],'shoulder');
    if(row){line(neck[row-1][col],neck[row][col],'shoulder');line(neck[row-1][col],neck[row][next],'shoulder');}
  }
  // Broken triangular fragments dissolve locally, with no frame or backdrop.
  for(let i=0;i<52;i++){
    const source=points[oval[Math.floor(noise(i+67)*oval.length)]].p,side=source[0]<0?-1:1;
    const p=[source[0]+side*(.065+noise(i+34)*.23),source[1]+(noise(i+90)-.45)*.23,source[2]-(.05+noise(i+19)*.36)],ids=[];
    for(let j=0;j<3;j++)ids.push(add([p[0]+(noise(i*8+j+12)-.5)*.15,p[1]+(noise(i*7+j+81)-.5)*.16,p[2]+(noise(i*9+j+122)-.5)*.12],'fragment',.13+noise(i)*.24));
    line(ids[0],ids[1],'fragment');if(i%3!==0)line(ids[1],ids[2],'fragment');if(i%4===0)line(ids[2],ids[0],'fragment');
  }
  for(const point of points)if(point.kind==='face'&&inSeam(point.p))point.hidden=true;
  return {points,edges,panels,centerY:-.20,height:3.34,maxY:1.44,eyeY:.447,minY:-1.90};
}
