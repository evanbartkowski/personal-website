const SVG = 'http://www.w3.org/2000/svg';
const node = (tag, attributes = {}) => {const element = document.createElementNS(SVG, tag); for (const [name,value] of Object.entries(attributes)) element.setAttribute(name,String(value)); return element;};
const project = (lat,lon) => [480 + lon * 8 / 3, 240 - lat * 8 / 3];
const placeLabel = point => {const label=point.label || point.country || 'Unknown region';return point.country && !label.toLowerCase().includes(point.country.toLowerCase()) ? `${label}, ${point.country}` : label;};
const hasCoordinates = point => point && Number.isFinite(point.lat) && Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
const ownAddress = value => {
  if (typeof value !== 'string' || value.length > 45 || !/^[\da-f:.]+$/i.test(value)) return null;
  if (value.includes(':')) {try {new URL(`http://[${value}]/`);return value;} catch {return null;}}
  const parts = value.split('.');
  return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255) ? value : null;
};
let recording;
let recordedThisDocument = false;
export function recordSiteVisit() {
  if (recording || recordedThisDocument || ['localhost','127.0.0.1'].includes(location.hostname) || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return recording;
  recording = fetch('/api/visitors', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true,signal:AbortSignal.timeout(12000)})
    .then(async response => {
      const result = await response.json();
      if (response.ok && (result.recorded === true || hasCoordinates(result.current) || result.locationStatus === 'located' || result.trackingDisabled === true)) recordedThisDocument = true;
    })
    .catch(() => {}).finally(() => {recording = undefined;});
  return recording;
}

export function mountVisitorMap(details) {
  if (!details) return () => {};
  const lifetime = new AbortController();
  const on = (target,event,handler,options={}) => target.addEventListener(event,handler,{...options,signal:lifetime.signal});
  const one = selector => details.querySelector(selector);
  const svg=one('.visitor-world'), frame=one('.visitor-map-frame'), tooltip=one('.visitor-tooltip');
  tooltip.id='visitor-map-tooltip';
  const title=one('[data-map-tooltip-title]'), address=one('[data-map-tooltip-address]'), detail=one('[data-map-tooltip-detail]');
  const viewport=node('g'), land=node('path',{class:'visitor-land'}), grid=node('g',{class:'visitor-grid'}), points=node('g'), current=node('g');
  for(let x=80;x<960;x+=80)grid.append(node('path',{d:`M${x} 0V480`}));
  for(let y=80;y<480;y+=80)grid.append(node('path',{d:`M0 ${y}H960`}));
  viewport.append(grid,land,points,current);svg.append(viewport);
  let active=true,loaded=false,loading=false,outlineLoaded=false,inViewport=true,currentPoint,devicePoint,currentIp,renderLifetime,currentLifetime,refreshTimer;
  let box=[0,0,960,480],drag,dragMoved=false,regionMarkers=[],currentMarker,shown,pinned=false,wheelFrame=0,wheelDelta=0,wheelPointer;
  const status=one('.visitor-status');
  function scheduleRefresh(){
    clearTimeout(refreshTimer);
    if(active&&details.open&&!document.hidden&&inViewport)refreshTimer=setTimeout(load,60000);
  }
  function hideTooltip(){
    if(shown){shown.mark.setAttribute('aria-pressed','false');shown.mark.removeAttribute('aria-describedby');}
    tooltip.hidden=true;address.textContent='';address.hidden=true;shown=undefined;pinned=false;
  }
  function screenPoint(meta){
    const matrix=svg.getScreenCTM();
    return matrix?{x:matrix.a*meta.x+matrix.c*meta.y+matrix.e,y:matrix.b*meta.x+matrix.d*meta.y+matrix.f}:null;
  }
  function positionTooltip(){
    if(!shown||tooltip.hidden)return;
    const anchor=screenPoint(shown);if(!anchor)return;
    const rect=frame.getBoundingClientRect();
    tooltip.style.maxWidth=`${Math.max(80,Math.min(260,frame.clientWidth-16))}px`;
    const width=tooltip.offsetWidth,height=tooltip.offsetHeight;
    const left=Math.max(8,Math.min(frame.clientWidth-width-8,anchor.x-rect.left-width/2));
    const above=anchor.y-rect.top-height-14;
    const top=Math.max(8,Math.min(frame.clientHeight-height-8,above>=8?above:anchor.y-rect.top+17));
    tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
  }
  function showTooltip(meta,keep=false){
    if(!active||!details.open||!meta)return;
    if(shown&&shown!==meta){shown.mark.setAttribute('aria-pressed','false');shown.mark.removeAttribute('aria-describedby');}
    shown=meta;pinned=keep;title.textContent=meta.title;detail.textContent=meta.detail;
    address.textContent=meta.address||'';address.hidden=!meta.address;
    meta.mark.setAttribute('aria-pressed',String(keep));meta.mark.setAttribute('aria-describedby',tooltip.id);
    tooltip.hidden=false;positionTooltip();
  }
  function allMarkers(){return currentMarker?[...regionMarkers,currentMarker]:regionMarkers;}
  function nearestMarker(clientX,clientY){
    let nearest,distance=Infinity;
    for(const meta of allMarkers()){
      const point=screenPoint(meta);if(!point)continue;
      const next=Math.hypot(point.x-clientX,point.y-clientY);
      if(next<=(meta.own?13:12)&&next<distance){nearest=meta;distance=next;}
    }
    return nearest;
  }
  function resizeMarkers(){
    if(!active)return;
    const matrix=svg.getScreenCTM(),scale=matrix&&Math.hypot(matrix.a,matrix.b);
    if(!scale||!Number.isFinite(scale))return;
    for(const glyph of svg.querySelectorAll('.visitor-marker-glyph'))glyph.setAttribute('transform',`scale(${1/scale})`);
    positionTooltip();
  }
  function applyView(){hideTooltip();svg.setAttribute('viewBox',box.join(' '));resizeMarkers();}
  function resetView(){box=[0,0,960,480];applyView();}
  function focusPoint(point,width=560){
    if(!point)return;
    const center=project(point.lat,point.lon),height=width/2;
    box=[Math.max(0,Math.min(960-width,center[0]-width/2)),Math.max(0,Math.min(480-height,center[1]-height/2)),width,height];applyView();
  }
  function zoom(factor){
    const width=Math.max(240,Math.min(960,box[2]*factor)),height=width/2,own=devicePoint||currentPoint;
    const center=own&&box[2]===960?project(own.lat,own.lon):[box[0]+box[2]/2,box[1]+box[3]/2];
    box=[Math.max(0,Math.min(960-width,center[0]-width/2)),Math.max(0,Math.min(480-height,center[1]-height/2)),width,height];applyView();
  }
  function zoomAtPointer(factor,clientX,clientY){
    const matrix=svg.getScreenCTM();if(!matrix)return;
    const anchor=new DOMPoint(clientX,clientY).matrixTransform(matrix.inverse());
    const fractionX=Math.max(0,Math.min(1,(anchor.x-box[0])/box[2]));
    const fractionY=Math.max(0,Math.min(1,(anchor.y-box[1])/box[3]));
    const width=Math.max(240,Math.min(960,box[2]*factor)),height=width/2;
    box=[Math.max(0,Math.min(960-width,anchor.x-fractionX*width)),Math.max(0,Math.min(480-height,anchor.y-fractionY*height)),width,height];applyView();
  }
  function register(meta,signal){
    meta.mark.addEventListener('focus',()=>showTooltip(meta),{signal});
    meta.mark.addEventListener('blur',()=>{if(shown===meta&&!pinned)hideTooltip();},{signal});
    meta.mark.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();if(shown===meta&&pinned)hideTooltip();else showTooltip(meta,true);}
      if(event.key==='Escape'){event.preventDefault();hideTooltip();}
    },{signal});
  }
  function marker(point,own=false){
    const [x,y]=project(point.lat,point.lon),mark=node('g',{class:own?'visitor-self':'visitor-region',transform:`translate(${x} ${y})`,tabindex:0,role:'button','aria-pressed':'false'});
    const glyph=node('g',{class:'visitor-marker-glyph'});
    glyph.append(node('circle',{r:12,class:'visitor-marker-hit',fill:'transparent'}));
    if(own){
      glyph.append(node('circle',{r:8,class:'visitor-self-ring'}),node('path',{d:'M0-6 6 0 0 6-6 0Z',class:'visitor-self-reticle'}),node('circle',{r:3.2,class:'visitor-self-core'}));
      const label=node('text',{x:0,y:-14,'text-anchor':'middle',class:'visitor-self-tag'});label.textContent='YOU';glyph.append(label);
    }else glyph.append(node('circle',{r:2.2+Math.min(1,Math.log2(point.visits+1)*.18),class:'visitor-dot'}));
    mark.append(glyph);return{mark,x,y,own};
  }
  function drawCurrent(){
    if(shown?.own)hideTooltip();currentLifetime?.abort();currentLifetime=new AbortController();current.replaceChildren();currentMarker=undefined;
    const point=devicePoint||currentPoint;if(!point)return;
    const meta=marker(point,true);meta.title='You';meta.address=currentIp;
    meta.detail=devicePoint?'Your device location':placeLabel(point);
    meta.mark.setAttribute('aria-label',`Your location: ${meta.detail}`);
    register(meta,currentLifetime.signal);current.append(meta.mark);currentMarker=meta;resizeMarkers();
  }
  function render(data){
    if(!data||typeof data!=='object'||!Array.isArray(data.points)||!Number.isFinite(data.totalVisits)||data.totalVisits<0)throw new Error('Invalid visitor data');
    hideTooltip();renderLifetime?.abort();renderLifetime=new AbortController();points.replaceChildren();regionMarkers=[];
    currentIp=ownAddress(data.currentIp);
    const regions=data.points.filter(region=>hasCoordinates(region)&&Number.isFinite(region.visits)&&region.visits>0).slice(0,100);
    for(const region of regions){
      const meta=marker(region);meta.title=placeLabel(region);meta.detail=`${region.visits.toLocaleString()} ${region.visits===1?'visit':'visits'}`;
      meta.mark.setAttribute('aria-label',`${meta.title}, ${meta.detail}`);
      register(meta,renderLifetime.signal);points.append(meta.mark);regionMarkers.push(meta);
    }
    currentPoint=hasCoordinates(data.current)?data.current:null;drawCurrent();resizeMarkers();
    one('[data-map-home]').disabled=!currentPoint&&!devicePoint;
    one('[data-visitor-total]').textContent=Math.max(0,Number(data.totalVisits)||0).toLocaleString();
    one('[data-visitor-regions]').textContent=String(regions.length);
    const unavailable=data.locationStatus==='privacy'?'Privacy preference enabled':data.locationStatus==='lookup_unavailable'?'Location temporarily unavailable':'Unavailable on this network';
    one('[data-visitor-current]').textContent=devicePoint?'Device location':currentPoint?placeLabel(currentPoint):unavailable;
    one('[data-visitor-ip]').textContent=currentIp||'Unavailable on this network';
    one('.visitor-empty').hidden=regions.length>0;one('.visitor-empty').textContent='New visitor regions will appear here.';
    status.textContent=regions.length?'':'No mapped visits yet.';
    if(data.locationStatus==='lookup_unavailable'&&!devicePoint)status.textContent='Your location is temporarily unavailable. Refresh will retry.';
    if(data.locationStatus==='privacy'&&!devicePoint)status.textContent='Your location is hidden by your browser privacy preference.';
    const updated=new Date(data.updatedAt);
    one('[data-visitor-updated]').textContent=Number.isNaN(updated.getTime())?'Updated just now':`Updated ${updated.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
  }
  async function load(){
    if(!active||loading)return;
    loading=true;clearTimeout(refreshTimer);one('[data-map-refresh]').disabled=true;svg.setAttribute('aria-busy','true');status.textContent='Loading visitor map…';
    try{
      if(!outlineLoaded){
        const response=await fetch('/assets/maps/world.json',{signal:lifetime.signal});
        if(!response.ok)throw new Error('outline');const outline=await response.json();
        if(typeof outline.path!=='string'||outline.path.length>1000000)throw new Error('outline');land.setAttribute('d',outline.path);outlineLoaded=true;
      }
      await recordSiteVisit();if(!active)return;
      const response=await fetch('/api/visitors',{cache:'no-store',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(12000)])});
      if(!response.ok)throw new Error('visitors');const data=await response.json();if(!active)return;render(data);loaded=true;
    }catch(error){if(active&&error.name!=='AbortError'){
      status.textContent=loaded?'Live update could not be loaded. The previous map is still shown. Try Refresh in a moment.':'Visitor regions could not be loaded. Try Refresh in a moment.';
      if(!loaded){one('[data-visitor-current]').textContent='Location unavailable';one('[data-visitor-ip]').textContent='Unavailable';one('.visitor-empty').textContent='The visitor service is unavailable. Refresh to retry.';one('.visitor-empty').hidden=false;}
    }}finally{loading=false;if(active){one('[data-map-refresh]').disabled=false;svg.setAttribute('aria-busy','false');scheduleRefresh();}}
  }
  on(details,'toggle',()=>{hideTooltip();if(details.open&&!loaded)load();else{resizeMarkers();scheduleRefresh();}});
  on(document,'visibilitychange',()=>{if(document.hidden)hideTooltip();scheduleRefresh();});
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;if(!inViewport)hideTooltip();scheduleRefresh();},{threshold:0}):null;
  observer?.observe(frame);
  const sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(resizeMarkers):null;sizeObserver?.observe(frame);
  on(window,'resize',resizeMarkers);
  on(one('[data-map-refresh]'),'click',load);on(one('[data-map-zoom-in]'),'click',()=>zoom(.65));on(one('[data-map-zoom-out]'),'click',()=>zoom(1/.65));
  on(one('[data-map-reset]'),'click',resetView);on(one('[data-map-home]'),'click',()=>focusPoint(devicePoint||currentPoint));
  on(svg,'wheel',event=>{
    if(!details.open||event.ctrlKey||!event.deltaY)return;
    event.preventDefault();
    const units=event.deltaMode===1?16:event.deltaMode===2?frame.clientHeight:1;
    wheelDelta+=Math.max(-240,Math.min(240,event.deltaY*units));wheelPointer={x:event.clientX,y:event.clientY};
    if(!wheelFrame)wheelFrame=requestAnimationFrame(()=>{
      wheelFrame=0;if(!active||!details.open){wheelDelta=0;return;}
      const delta=wheelDelta;wheelDelta=0;
      zoomAtPointer(Math.exp(Math.max(-400,Math.min(400,delta))*.0025),wheelPointer.x,wheelPointer.y);
    });
  },{passive:false});
  on(svg,'pointerdown',event=>{
    if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('.visitor-region,.visitor-self'))return;
    const matrix=svg.getScreenCTM();if(!matrix)return;const start=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    drag={x:start.x,y:start.y,box:[...box],matrix:matrix.inverse()};dragMoved=false;hideTooltip();svg.setPointerCapture(event.pointerId);
  });
  on(svg,'pointermove',event=>{
    if(drag){
      const position=new DOMPoint(event.clientX,event.clientY).matrixTransform(drag.matrix),dx=position.x-drag.x,dy=position.y-drag.y;
      dragMoved ||= Math.abs(dx)+Math.abs(dy)>3;
      box=[Math.max(0,Math.min(960-drag.box[2],drag.box[0]-dx)),Math.max(0,Math.min(480-drag.box[3],drag.box[1]-dy)),drag.box[2],drag.box[3]];applyView();return;
    }
    if(event.pointerType==='touch'||pinned)return;
    const meta=nearestMarker(event.clientX,event.clientY);if(meta)showTooltip(meta);else if(document.activeElement!==shown?.mark)hideTooltip();
  });
  on(svg,'pointerup',()=>{drag=null;});on(svg,'pointercancel',()=>{drag=null;});
  on(svg,'pointerleave',()=>{if(!pinned&&document.activeElement!==shown?.mark)hideTooltip();});
  on(svg,'click',event=>{
    if(dragMoved){dragMoved=false;return;}
    const meta=nearestMarker(event.clientX,event.clientY);if(!meta){hideTooltip();return;}
    if(pinned&&shown===meta){hideTooltip();return;}
    meta.mark.focus({preventScroll:true});showTooltip(meta,true);
  });
  on(document,'pointerdown',event=>{if(!frame.contains(event.target))hideTooltip();});
  on(document,'focusin',event=>{if(!frame.contains(event.target))hideTooltip();});
  on(document,'keydown',event=>{if(event.key==='Escape'&&!tooltip.hidden){hideTooltip();if(details.contains(event.target))event.preventDefault();}});
  on(one('[data-map-locate]'),'click',()=>{
    if(!navigator.geolocation){status.textContent='Device location is unavailable in this browser.';return;}
    const button=one('[data-map-locate]');button.disabled=true;status.textContent='Waiting for your location permission…';
    navigator.geolocation.getCurrentPosition(position=>{
      if(!active)return;button.disabled=false;devicePoint={lat:position.coords.latitude,lon:position.coords.longitude};
      if(!hasCoordinates(devicePoint)){devicePoint=null;status.textContent='The browser returned an invalid location. Your network estimate remains available.';return;}
      drawCurrent();focusPoint(devicePoint,Math.min(560,box[2]));one('[data-map-home]').disabled=false;one('[data-visitor-current]').textContent='Device location · only you';status.textContent='Your device position is shown only in this browser.';
    },()=>{if(active){button.disabled=false;status.textContent='Location was not shared. The network estimate remains available.';}},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  });
  resetView();if(details.open)load();
  return()=>{active=false;clearTimeout(refreshTimer);cancelAnimationFrame(wheelFrame);observer?.disconnect();sizeObserver?.disconnect();renderLifetime?.abort();currentLifetime?.abort();lifetime.abort();hideTooltip();svg.replaceChildren();regionMarkers=[];currentMarker=undefined;};
}
