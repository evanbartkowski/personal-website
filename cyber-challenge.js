import {createCyberChallengeState,cyberChallengeCommand,completeCyberChallenge,challengeStages} from './cyber-challenge-model.js';

export function mountCyberChallenge({beforeOpen=()=>{}}={}){
  const lifetime=new AbortController(),motion=matchMedia('(prefers-reduced-motion: reduce)');
  const on=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal:lifetime.signal});
  const dialog=document.createElement('dialog');dialog.id='cyber-challenge-dialog';dialog.className='cyber-challenge-dialog';
  dialog.setAttribute('aria-labelledby','cyber-challenge-title');dialog.setAttribute('aria-describedby','cyber-challenge-description');
  dialog.innerHTML=`<div class="ctf-head"><div><span class="ctf-eyebrow">Hack me <span aria-hidden="true">/</span> local sandbox</span><h2 id="cyber-challenge-title">Cybersecurity Challenge</h2></div><button type="button" class="ctf-close" aria-label="Close cybersecurity challenge">&times;</button></div>
    <p id="cyber-challenge-description" class="ctf-description">Find an identity. Follow the open port. Take control of a fictional node.</p>
    <ol class="ctf-progress" aria-label="Challenge progress"><li data-phase="query"><span>01</span>Query</li><li data-phase="authenticate"><span>02</span>Identity</li><li data-phase="recon"><span>03</span>Recon</li><li data-phase="shell"><span>04</span>Shell</li></ol>
    <div class="ctf-workspace"><canvas class="ctf-cascade" aria-hidden="true"></canvas><div class="ctf-node" aria-hidden="true"><svg viewBox="0 0 500 400"><defs><radialGradient id="ctf-core"><stop stop-color="currentColor" stop-opacity=".24"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><circle cx="250" cy="195" r="180" fill="url(#ctf-core)"/><g fill="none" stroke="currentColor" stroke-width=".8"><path d="M250 40 385 118 385 274 250 352 115 274 115 118Z M250 80 350 138 350 254 250 312 150 254 150 138Z M250 40V352 M115 118 385 274 M385 118 115 274 M150 138 350 254 M350 138 150 254 M150 138H350 M150 254H350"/><ellipse cx="250" cy="195" rx="180" ry="62"/><ellipse cx="250" cy="195" rx="180" ry="125" transform="rotate(-60 250 195)"/></g><g fill="currentColor"><circle cx="250" cy="40" r="3"/><circle cx="385" cy="118" r="3"/><circle cx="385" cy="274" r="3"/><circle cx="250" cy="352" r="3"/><circle cx="115" cy="274" r="3"/><circle cx="115" cy="118" r="3"/></g></svg></div>
      <div id="cyber-challenge-output" class="ctf-output" role="log" aria-label="Challenge terminal output" aria-live="polite" aria-relevant="additions text" tabindex="0"></div>
      <div class="ctf-reset-sequence" hidden><span class="ctf-reset-orbit" aria-hidden="true"></span><strong>CONTAINMENT RESET</strong><span>Simulated thread limit reached</span><div class="ctf-reset-meter" aria-hidden="true"><i></i></div></div>
    </div>
    <div class="ctf-objective"><div><span>Current objective</span><strong id="cyber-challenge-objective"></strong></div><button type="button" class="ctf-hint">Hint <span aria-hidden="true">↗</span></button></div>
    <form id="cyber-challenge-form" autocomplete="off"><label class="ctf-prompt" for="cyber-challenge-input">gate <span aria-hidden="true">$</span></label><input id="cyber-challenge-input" name="challenge-command" maxlength="512" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Sandbox command" placeholder="query &lt;expression&gt;"/><button type="submit" aria-label="Run sandbox command">Enter <span aria-hidden="true">↵</span></button></form>
    <div class="ctf-foot"><span>Browser simulation <span aria-hidden="true">·</span> no network or system commands</span><button type="button" class="ctf-help">help</button><button type="button" class="ctf-restart">reset</button></div><span class="sr-only" id="cyber-challenge-announcement" role="status" aria-live="polite"></span>`;
  document.body.append(dialog);
  const one=selector=>dialog.querySelector(selector),output=one('#cyber-challenge-output'),input=one('#cyber-challenge-input');
  const canvas=one('.ctf-cascade'),context=canvas.getContext('2d'),overlay=one('.ctf-reset-sequence');
  let state=createCyberChallengeState(),active=true,frame=0,resetTimer=0,resetDue=0,resetRemaining=2900,started=0,lastPaint=0,opener;
  let history=[],historyIndex=0,draft='',cascadeTime=0;
  const commands=['query','wordlist','crack','login','nmap','scan','ssh','hint','status','clear','reset','exit'];
  const prompt=()=>state.stage==='shell'?'admin@internal-node':state.stage==='query'?'gate':'console';
  function print(text,tone='normal'){
    const line=document.createElement('p');line.className=`ctf-line ctf-line-${tone}`;line.textContent=text;output.append(line);
    while(output.childElementCount>120)output.firstElementChild.remove();
    output.scrollTop=output.scrollHeight;
  }
  function introduction(){
    print('SANDBOX / training node ready','accent');
    print('The public directory exposes a search gate. Its query is built from whatever you type.');
    print("SELECT username, password_hash FROM users\nWHERE username = '<your expression>';",'code');
    print('Start with query <expression>. Type help for tools, or hint for a breadcrumb.');
  }
  function update(){
    dialog.dataset.stage=state.stage;dialog.dataset.hints=String(state.hintsUsed);
    const definition=challengeStages.find(stage=>stage.id===state.stage);one('#cyber-challenge-objective').textContent=definition.title;
    const at=challengeStages.findIndex(stage=>stage.id===state.stage),phase=state.stage==='connect'?'recon':at>=4?'shell':state.stage;
    const phaseOrder=['query','authenticate','recon','shell'],current=phaseOrder.indexOf(phase);
    for(const item of dialog.querySelectorAll('.ctf-progress li')){
      const index=phaseOrder.indexOf(item.dataset.phase),complete=index<current||state.stage==='complete';
      item.dataset.state=complete?'complete':item.dataset.phase===phase?'active':'locked';
      if(!complete&&item.dataset.phase===phase)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
    }
    one('.ctf-prompt').firstChild.textContent=`${prompt()} `;
    const locked=state.stage==='reboot';input.disabled=locked;one('#cyber-challenge-form button').disabled=locked;one('.ctf-hint').disabled=locked;one('.ctf-restart').disabled=locked;
    const placeholders={query:'query <expression>',authenticate:'crack <digest> · login <user> <plaintext>',recon:'Inspect internal-node',connect:'ssh <user>@internal-node',shell:'A shell. A weak process guard.',complete:'reset to replay · exit to return'};
    input.placeholder=placeholders[state.stage]||'Resetting the mock node…';
  }
  function stopCascade(){cancelAnimationFrame(frame);frame=0;lastPaint=0;}
  function resizeCascade(){
    const bounds=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.max(1,Math.round(bounds.width*ratio));canvas.height=Math.max(1,Math.round(bounds.height*ratio));
    if(context)context.setTransform(ratio,0,0,ratio,0,0);
  }
  function paintCascade(now){
    frame=0;if(!active||!dialog.open||document.hidden||motion.matches||state.stage!=='reboot'||!context)return;
    if(!started)started=now;
    if(!lastPaint||now-lastPaint>=45){
      const dt=lastPaint?Math.min((now-lastPaint)/1000,.08):0;lastPaint=now;cascadeTime+=dt;
      const {width,height}=canvas.getBoundingClientRect();context.clearRect(0,0,width,height);
      const color=getComputedStyle(dialog).getPropertyValue('--green').trim()||'#849bab';context.fillStyle=color;context.font='11px monospace';
      // Fixed-size decorative columns, unrelated to the mock process count.
      const columns=Math.min(62,Math.ceil(width/19));
      for(let col=0;col<columns;col++){
        const head=((cascadeTime*(65+(col*17)%80)+col*59)%(height+160))-80;
        for(let row=0;row<9;row++){
          context.globalAlpha=(1-row/10)*.29;const glyph=((col*47+row*13+Math.floor(cascadeTime*4))%16).toString(16).toUpperCase();
          context.fillText(glyph,col*19+7,head-row*14);
        }
      }context.globalAlpha=1;
    }
    frame=requestAnimationFrame(paintCascade);
  }
  function finishReset(){
    clearTimeout(resetTimer);resetTimer=0;state=completeCyberChallenge(state);stopCascade();overlay.hidden=true;dialog.classList.remove('ctf-resetting');
    if(context)context.clearRect(0,0,canvas.width,canvas.height);
    print('NODE RESTORED / challenge complete','success');print('You recovered an identity, found SSH, gained mock shell access, and triggered the process guard.');
    print(`Run complete · ${state.commands} commands · ${state.hintsUsed} hints\nType reset to replay or exit to return to the website.`,'accent');
    one('#cyber-challenge-announcement').textContent='Challenge complete. The simulated node has rebooted.';update();if(dialog.open)input.focus({preventScroll:true});
  }
  function resumeReset(){
    if(state.stage!=='reboot'||!active||!dialog.open||document.hidden||resetTimer)return;
    resizeCascade();resetDue=performance.now()+resetRemaining;resetTimer=setTimeout(finishReset,resetRemaining);
    if(!motion.matches&&context&&!frame)frame=requestAnimationFrame(paintCascade);
  }
  function pauseReset(){
    if(resetTimer){resetRemaining=Math.max(0,resetDue-performance.now());clearTimeout(resetTimer);resetTimer=0;}
    stopCascade();
  }
  function beginReset(){
    resetRemaining=motion.matches?700:2900;cascadeTime=0;started=0;overlay.hidden=false;dialog.classList.add('ctf-resetting');resumeReset();
    // Move focus off the newly disabled composer so Escape remains usable.
    one('.ctf-close').focus({preventScroll:true});
    one('#cyber-challenge-announcement').textContent='Mock thread limit reached. The fictional node is resetting.';
  }
  function execute(raw){
    if(!active||!dialog.open||state.stage==='reboot')return;
    const command=raw.trim();if(!command)return;
    print(`${prompt()} $ ${command.slice(0,512)}`,'command');
    const result=cyberChallengeCommand(state,command),before=state.stage;state=result.state;
    if(result.event==='clear'||result.event==='reset')output.replaceChildren();
    for(const line of result.lines)print(line.text,line.tone);
    if(result.event==='reset'){pauseReset();overlay.hidden=true;dialog.classList.remove('ctf-resetting');one('#cyber-challenge-announcement').textContent='Challenge reset.';introduction();}
    update();
    if(result.event==='reboot')beginReset();
    else if(result.event==='close')dialog.close();
    else input.focus({preventScroll:true});
    if(before!==state.stage&&state.stage!=='reboot')one('#cyber-challenge-announcement').textContent=`Objective: ${challengeStages.find(stage=>stage.id===state.stage).title}`;
  }
  on(one('#cyber-challenge-form'),'submit',event=>{
    event.preventDefault();const command=input.value.trim();input.value='';if(!command)return;
    if(history.at(-1)!==command)history.push(command.slice(0,512));if(history.length>80)history.shift();historyIndex=history.length;draft='';execute(command);
  });
  on(input,'keydown',event=>{
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();if(historyIndex===history.length)draft=input.value;
      historyIndex=Math.max(0,Math.min(history.length,historyIndex+(event.key==='ArrowUp'?-1:1)));input.value=historyIndex===history.length?draft:history[historyIndex]||'';
      input.setSelectionRange(input.value.length,input.value.length);
    }else if(event.key==='Tab'&&!event.shiftKey&&input.value&&!input.value.includes(' ')){
      const matches=commands.filter(command=>command.startsWith(input.value.toLowerCase()));
      if(matches.length===1){event.preventDefault();input.value=matches[0]+' ';}
    }else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='l'){event.preventDefault();execute('clear');}
  });
  on(one('.ctf-close'),'click',()=>dialog.close());on(one('.ctf-hint'),'click',()=>execute('hint'));
  on(one('.ctf-help'),'click',()=>execute('help'));on(one('.ctf-restart'),'click',()=>{if(state.stage==='reboot')return;execute('reset');});
  on(dialog,'click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
  on(dialog,'close',()=>{pauseReset();opener?.isConnected&&opener.focus({preventScroll:true});});
  on(document,'visibilitychange',()=>{if(document.hidden)pauseReset();else resumeReset();});
  on(motion,'change',()=>{stopCascade();if(state.stage==='reboot'&&dialog.open&&!document.hidden&&!motion.matches)frame=requestAnimationFrame(paintCascade);});
  on(window,'resize',()=>{if(state.stage==='reboot')resizeCascade();});
  introduction();update();
  return {
    open(){
      if(!active)return;if(dialog.open){input.focus({preventScroll:true});return;}
      const origin=document.activeElement;beforeOpen(dialog);
      opener=origin?.closest('details:not([open])')?.querySelector(':scope > summary')||origin;
      dialog.showModal();input.focus({preventScroll:true});resumeReset();
    },
    dispose(){if(!active)return;active=false;pauseReset();lifetime.abort();if(dialog.open)dialog.close();dialog.remove();history=[];},
  };
}
