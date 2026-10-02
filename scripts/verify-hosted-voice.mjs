// Live synthetic acceptance: one disposable account, no gathering or user recording.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(url!=='https://mccbaouodyprmqplxeav.supabase.co') throw Error('Wrong project');
const origin=process.env.ALLVAILABLE_TEST_ORIGIN;
if(!origin || new URL(origin).protocol!=='https:') throw Error('Explicit HTTPS test origin required');
const audioPath=process.argv[2];
if(!audioPath) throw Error('Provide a consented synthetic WAV fixture');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options);
let userId;
try {
 const email=`allvailable-voice-test-${randomUUID()}@example.test`, password=randomUUID()+'aA1!';
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic voice acceptance'}});
 if(created.error) throw created.error; userId=created.data.user.id;
 const login=await client.auth.signInWithPassword({email,password});
 if(login.error) throw login.error;
 const headers={Authorization:'Bearer '+login.data.session.access_token};
 const capability=await fetch(origin+'/api/calendar-imports',{headers}).then(r=>r.json());
 if(capability.webAudioAvailable!==true) throw Error('Live voice capability unavailable');
 console.log('PASS live voice capability');
 const isMp4=/\.(m4a|mp4)$/i.test(audioPath);
 const form=new FormData(); form.set('audio',new Blob([readFileSync(audioPath)],{type:isMp4?'audio/mp4':'audio/wav'}),isMp4?'synthetic.m4a':'synthetic.wav');
 const started=Date.now();
 const response=await fetch(origin+'/api/calendar-imports',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:form});
 const data=await response.json();
 console.log(JSON.stringify({status:response.status,latencyMs:Date.now()-started,statusName:data.status,extraction:data.extraction,error:data.error},null,2));
 if(!response.ok) throw Error('Live voice import failed');
 const event=data.extraction?.events?.find(e=>e.intent==='available');
 if(!event || event.startDate!=='2026-10-03' || event.endDate!=='2026-10-03' || event.startTime!=='19:00' || event.endTime!=='21:00' || event.sourceTimezone!=='Asia/Taipei' || event.userConfirmed!==false) throw Error('Voice extraction did not match the fixture');
 console.log('PASS Chinese voice → Whisper → Nemotron → unconfirmed 2026-10-03 19:00–21:00 Asia/Taipei availability');
} finally {
 await client.auth.signOut();
 if(userId) {
  const cleanup=await admin.auth.admin.deleteUser(userId);
  if(cleanup.error) throw Error('Synthetic account cleanup failed: '+cleanup.error.message);
  console.log('PASS synthetic account cleaned up');
 }
}
