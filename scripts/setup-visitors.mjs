import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

// Fixed resources only. Native HTTPS avoids CLI debug logs containing secrets.
const project='personal-website-7d04c', number='199095231244', database='portfolio-visitors';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(`${process.env.APPDATA.replaceAll('\\','/')}/npm/node_modules/firebase-tools/package.json`);
const {logger}=require('./lib/logger.js');logger.silent=true;
const auth=require('./lib/auth.js'), {requireAuth}=require('./lib/requireAuth.js'), {getAccessToken}=require('./lib/apiv2.js');
const account=auth.getProjectDefaultAccount(root)||auth.getGlobalDefaultAccount();
delete process.env.FIREBASE_TOKEN;
try {
  await requireAuth({...account,project,nonInteractive:true},true);
  const token=await getAccessToken();
  async function call(url,method='GET',body,allowed=[200],attempt=0) {
    const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!allowed.includes(response.status)){const error=await response.json().catch(()=>({}));const reasons=error.error?.details?.map(item=>item.reason).filter(Boolean).join(',')||error.error?.status||'rejected';if(reasons.includes('SERVICE_DISABLED')&&attempt<12){await delay(2000);return call(url,method,body,allowed,attempt+1);}throw new Error(`Visitor setup request rejected (HTTP ${response.status}, ${new URL(url).pathname}, ${reasons}).`);}
    const data=await response.json().catch(()=>({}));return {status:response.status,data};
  }
  for(const service of ['firestore.googleapis.com','secretmanager.googleapis.com']){
    const url=`https://serviceusage.googleapis.com/v1/projects/${number}/services/${service}`;
    const state=await call(url);if(state.data.state!=='ENABLED'){
      await call(url+':enable','POST',{});
      for(let i=0;i<50;i++){if((await call(url)).data.state==='ENABLED')break;if(i===49)throw new Error('API activation is still pending.');await delay(1000);}
    }
  }
  const databaseURL=`https://firestore.googleapis.com/v1/projects/${project}/databases/${database}`;
  if((await call(databaseURL,'GET',undefined,[200,404])).status===404){
    await call(`https://firestore.googleapis.com/v1/projects/${project}/databases?databaseId=${database}`,'POST',{locationId:'us-central1',type:'FIRESTORE_NATIVE'},[200,201]);
    for(let i=0;i<60;i++){if((await call(databaseURL,'GET',undefined,[200,404])).status===200)break;if(i===59)throw new Error('Visitor database creation is still pending.');await delay(1000);}
  }
  for(const collection of ['visitor_days','visitor_seen']){
    await call(`${databaseURL}/collectionGroups/${collection}/fields/expiresAt?updateMask=ttlConfig`,'PATCH',{ttlConfig:{}},[200]);
  }
  const secret=`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/VISITOR_HASH_SALT`;
  if((await call(secret,'GET',undefined,[200,404])).status===404)await call(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets?secretId=VISITOR_HASH_SALT`,'POST',{replication:{automatic:{}}},[200,201]);
  const existing=await call(secret+'/versions/latest:access','GET',undefined,[200,404]);
  const salt=existing.data.payload?.data ? Buffer.from(existing.data.payload.data,'base64').toString('utf8') : '';
  if(!/^[a-f0-9]{64}$/.test(salt))await call(secret+':addVersion','POST',{payload:{data:Buffer.from(randomBytes(32).toString('hex'),'utf8').toString('base64')}},[200,201]);
  console.log('Visitor database, retention policies, and private hashing secret are ready.');
} catch(error) {console.error(error.message?.startsWith('Visitor setup')||error.message?.endsWith('pending.')?error.message:'Visitor infrastructure setup could not complete.');process.exitCode=1;}
