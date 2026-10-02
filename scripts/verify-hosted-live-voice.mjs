// Disposable synthetic acceptance. No public gathering or user audio.
import {randomUUID} from 'node:crypto';import{createClient}from'@supabase/supabase-js';
process.loadEnvFile('.env.local');const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(url!=='https://mccbaouodyprmqplxeav.supabase.co')throw Error('Wrong project');
const origin=process.env.ALLVAILABLE_TEST_ORIGIN;if(!origin||new URL(origin).protocol!=='https:')throw Error('HTTPS origin required');
const opts={auth:{persistSession:false,autoRefreshToken:false}};const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,opts),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts);let userId;
try{
 const email=`allvailable-live-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;userId=created.data.user.id;
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;
 const headers={Authorization:'Bearer '+login.data.session.access_token};
 const call=async(path,body)=>{const started=Date.now();const r=await fetch(origin+path,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(JSON.stringify({status:r.status,error:data.error}));console.log(JSON.stringify({path:path.replace(/\/[0-9a-f-]{36}/g,'/synthetic-import'),status:r.status,latencyMs:Date.now()-started,events:data.extraction?.events?.length}));return data;};
 const first='時區是台北。2026年10月3日晚上七點到九點有空。';
 const form=new FormData();form.set('mode','live_voice');form.set('transcript',first);
 const r=await fetch(origin+'/api/calendar-imports',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:form});let data=await r.json();if(!r.ok)throw Error(JSON.stringify(data.error));const id=data.importId;
 const initial=data.extraction.events.find(e=>e.intent==='available'&&e.startDate==='2026-10-03'&&e.startTime==='19:00'&&e.endTime==='21:00');if(!initial||initial.userConfirmed!==false)throw Error('First live card mismatch');
 console.log('PASS first phrase produces an unconfirmed card before recording finish');
 data=await call(`/api/calendar-imports/${id}`,{action:'edit_event',eventId:initial.id,version:data.version,changes:{reviewed:true}});
 const second=first+'2026年10月4日晚上六點到七點可能有事，是暫定。';
 data=await call(`/api/calendar-imports/${id}/live`,{version:data.version,transcript:second});
 if(!data.extraction.events.find(e=>e.id===initial.id&&e.userConfirmed===true)||data.extraction.events.filter(e=>e.startDate==='2026-10-03'&&e.startTime==='19:00').length!==1)throw Error('Reviewed first card changed or duplicated');
 const next=data.extraction.events.find(e=>e.startDate==='2026-10-04'&&e.startTime==='18:00'&&e.endTime==='19:00'&&e.intent==='tentative');if(!next||next.userConfirmed!==false)throw Error('Second live card mismatch');
 console.log('PASS second phrase adds a tentative card and preserves the approved first card');
 const version=data.version;data=await call(`/api/calendar-imports/${id}/live`,{version,transcript:second});if(data.version!==version)throw Error('Identical transcript consumed a new version');
 console.log('PASS repeated stable transcript does not trigger another model call');
 data=await call(`/api/calendar-imports/${id}/live`,{version:data.version,finish:true});
 const closed=await fetch(origin+`/api/calendar-imports/${id}/live`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({version:data.version,transcript:second+'更多'})});if(closed.status!==410)throw Error('Closed session accepted more model requests');
 console.log('PASS explicit finish prevents further inference');
}finally{await client.auth.signOut();if(userId){const cleanup=await admin.auth.admin.deleteUser(userId);if(cleanup.error)throw Error('Cleanup failed');console.log('PASS disposable test account cleaned up');}}
