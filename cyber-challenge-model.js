// This is a string-driven puzzle, not a shell, SQL engine or network client.
// Each command returns bounded mock text and one immutable local transition.
export const challengeStages = Object.freeze([
  {id:'query', title:'Find a way in', hint:'The directory trusts its search text a little too much. What if a condition were always true?'},
  {id:'authenticate', title:'Recover an identity', hint:'A digest is a fingerprint, not encryption. A short local wordlist may contain a match.'},
  {id:'recon', title:'Read the perimeter', hint:'You have an identity. Find out which service is listening on the internal node.'},
  {id:'connect', title:'Cross the boundary', hint:'A familiar remote-login service answered. Use the identity you recovered to connect.'},
  {id:'shell', title:'Test the limit', hint:'The shell is simulated. Its process guard has a limit; what happens when one task keeps making more tasks?'},
  {id:'reboot', title:'Containment reset', hint:'The simulated node is resetting. No commands run on your device.'},
  {id:'complete', title:'Challenge complete', hint:'Access recovered. Node reset. Type reset to take another run.'},
]);

const HASH='21232f297a57a5a743894a0e4a801fc3', USER='admin', PASSWORD='admin';
const localTargets=new Set(['internal-node','localhost','127.0.0.1']);
const reply=(state,lines,event)=>({state,lines:lines.map(line=>typeof line==='string'?{text:line,tone:'normal'}:line),...(event?{event}:{})});
const accent=text=>({text,tone:'accent'}),failure=text=>({text,tone:'error'});
const records=()=>[accent('MOCK USERS / 1 row'),`username        password_hash (MD5)\n${USER.padEnd(16)}${HASH}`,'A legacy digest. Try wordlist, then crack <hash>.'];
const ports=()=>[accent('internal-node / simulated host is up'),'PORT      STATE    SERVICE\n22/tcp    open     ssh\n80/tcp    filtered http\n443/tcp   closed   https','One door answered. The recovered identity should still fit.'];
const stageIndex=state=>challengeStages.findIndex(stage=>stage.id===state.stage);

export function createCyberChallengeState(){return {stage:'query',commands:0,hintsUsed:0,hashMatched:false};}
export function challengeHint(state){
  if(state.stage==='authenticate'&&state.hashMatched)return 'You matched the digest. Return to the gate with login <username> <plaintext>.';
  return (challengeStages.find(stage=>stage.id===state.stage)||challengeStages[0]).hint;
}
export function completeCyberChallenge(state){return state.stage==='reboot'?{...state,stage:'complete'}:state;}

export function cyberChallengeCommand(previous,raw){
  if(typeof raw!=='string'||raw.length>512)return reply(previous,[failure('Keep each mock command under 512 characters.')]);
  const text=raw.trim();if(!text)return reply(previous,[]);
  const state={...previous,commands:Math.min(99999,previous.commands+1)},[first,...args]=text.split(/\s+/),command=first.toLowerCase();
  const at=stageIndex(state);
  if(command==='reset')return reply(createCyberChallengeState(),[accent('Sandbox restored.'),'The directory is waiting for a search expression.'], 'reset');
  if(command==='hint'){
    const more={query:'The mock expression becomes part of a WHERE clause. Try making its condition true, then commenting out the rest.',authenticate:'Run crack with the recovered MD5 digest, then login with the username and matching word.',recon:'Try nmap internal-node or scan localhost. These only show the built-in mock table.',connect:'The open port is SSH. Try ssh admin@internal-node.',shell:'Read cat process-guard.txt. Enter overload to model an unbounded fork without creating any processes.'};
    return reply({...state,hintsUsed:Math.min(99999,state.hintsUsed+1)},[accent(args[0]==='more'&&more[state.stage]?more[state.stage]:challengeHint(state))]);
  }
  if(command==='clear')return reply(state,[],'clear');
  if(command==='exit'||command==='quit')return reply(state,['Session suspended. Your progress stays here until you leave this page.'],'close');
  if(command==='help')return reply(state,[
    accent('SANDBOX COMMANDS'),
    'query <expression>     Search the mock user directory\nwordlist               Inspect the supplied test words\ncrack <digest>         Match a digest against those words\nlogin <user> <pass>    Authenticate to the internal console\nnmap [internal-node]  Inspect the mock port table\nssh <user>@internal-node\n                      Enter the simulated shell\nhint [more] · status · clear · reset · exit',
    'Commands unlock in sequence. This environment never executes code or contacts a network.'
  ]);
  if(state.stage==='reboot')return reply(state,['Containment reset in progress…']);
  if(state.stage==='complete')return reply(state,[accent('COMPLETE / You recovered access and reset the node.'),'Type reset to try again or exit to return to the website.']);
  if(command==='status'&&state.stage!=='recon')return reply(state,[accent(`OBJECTIVE / ${challengeStages[at].title}`),challengeHint(state)]);
  if(command==='wordlist')return reply(state,['LOCAL TEST WORDLIST\nguest\nletmein\nadmin\npassword123\nwelcome','These are fictional training credentials. No files are read.']);
  if(command==='hashes'||command==='records')return reply(state,at>=1?records():[failure('The directory has not returned any records yet.')]);
  if(['crack','hashcat','decode'].includes(command)){
    if(at<1)return reply(state,[failure('Find a digest in the mock directory first.')]);
    const digest=args.find(arg=>/^[a-f\d]{32}$/i.test(arg));
    if(!digest)return reply(state,['Usage: crack <32-character MD5 digest>']);
    if(digest.toLowerCase()!==HASH)return reply(state,['No match in the supplied test wordlist. Check the recovered digest.']);
    return reply({...state,hashMatched:true},[accent(`WORDLIST MATCH / ${HASH} : ${PASSWORD}`),'MD5 is one-way; this found a matching test word, rather than decrypting anything.','Return to the gate: login <username> <plaintext>.']);
  }
  if(command==='login'){
    if(at<1)return reply(state,[failure('The gate needs a recovered identity. Investigate the directory first.')]);
    if(at>1)return reply(state,['You are already authenticated to the internal console.']);
    if(args.length!==2)return reply(state,['Usage: login <username> <plaintext password>']);
    if(args[0]!==USER||args[1]!==PASSWORD)return reply(state,[failure('Authentication failed. Use the recovered username and the matching plaintext, not the digest.')]);
    return reply({...state,stage:'recon',hashMatched:true},[accent('IDENTITY VERIFIED / admin'),'Internal console unlocked. One isolated node is waiting: internal-node.','Find the listening service before trying to connect.']);
  }
  if(command==='nmap'||command==='scan'||command==='status'&&state.stage==='recon'){
    if(at<2)return reply(state,[failure('The internal console is locked. Authenticate first.')]);
    const target=args.filter(arg=>!arg.startsWith('-')).at(-1);
    if(target&&!localTargets.has(target))return reply(state,[failure('Only the fictional internal-node target exists in this sandbox.')]);
    return reply({...state,stage:state.stage==='recon'?'connect':state.stage},ports());
  }
  if(command==='ssh'){
    if(at<2)return reply(state,[failure('Authenticate to the internal console before connecting.')]);
    if(at===2)return reply(state,[failure('No service has been discovered yet. Read the perimeter first.')]);
    if(at===4)return reply(state,['You are already inside the simulated internal-node shell.']);
    if(args.length!==1||args[0]!==`${USER}@internal-node`)return reply(state,['Usage: ssh <recovered-user>@internal-node','Only the discovered fictional node accepts a connection.']);
    return reply({...state,stage:'shell'},[accent('SSH / connected to internal-node'),'Welcome, admin. Mock shell access granted.','The node has a weak process guard. See if you can trigger its containment reset.','Type hint for a breadcrumb. Everything here remains a local simulation.']);
  }
  const fork=text.replace(/\s/g,'');
  if(fork===':(){:|:&};:'||['overload','stress-test','forkbomb'].includes(command)){
    if(state.stage!=='shell')return reply(state,[failure('No shell is attached. Finish recovering access first.')]);
    return reply({...state,stage:'reboot'},[accent('PROCESS GUARD / simulated limit reached'),'Containment engaged. Resetting the fictional node…'],'reboot');
  }
  if(state.stage==='query'){
    const expression=command==='query'?text.slice(first.length).trim():text;
    // Deliberately tiny recognizer, never a parser or a database query.
    const bypass=/(?:'|")\s*(?:or|OR)\s+(?:'1'\s*=\s*'1'|"1"\s*=\s*"1"|1\s*=\s*1)\s*(?:--|#)(?:\s|$)/i.test(expression);
    if(bypass)return reply({...state,stage:'authenticate'},[accent('DIRECTORY / condition accepted'),...records()]);
    if(command==='query'||/['"]/.test(text))return reply(state,['No records returned. The gate still trusts the expression it was given.','Type hint for a breadcrumb.']);
  }
  if(state.stage==='shell'&&['whoami','pwd','ls','uptime'].includes(command))return reply(state,[({whoami:USER,pwd:'/srv/sandbox',ls:'process-guard.txt  README.mock',uptime:'internal-node / 1 mock user / process cap: 64'})[command]]);
  if(state.stage==='shell'&&command==='cat')return reply(state,args[0]==='process-guard.txt'?['PROCESS GUARD / 64 simulated threads','A self-replicating shell function would trigger the guard. The overload command models the same outcome.']:['This mock shell exposes only process-guard.txt.']);
  return reply(state,[`No mock action named "${text.slice(0,72)}". Try help or hint.`]);
}
