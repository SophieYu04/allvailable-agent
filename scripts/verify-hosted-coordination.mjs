// Creates disposable synthetic accounts only on the explicitly approved project.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const url=env.NEXT_PUBLIC_SUPABASE_URL;
const appOrigin=new URL(process.env.ALLVAILABLE_TEST_ORIGIN || 'http://localhost:5173');
if(appOrigin.protocol!=='https:' && !['localhost','127.0.0.1'].includes(appOrigin.hostname))throw Error('Hosted acceptance requires HTTPS');
if(url!=='https://mccbaouodyprmqplxeav.supabase.co')throw Error('Wrong project');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,options);
const users=[];let gathering;
const check=(condition,label)=>{if(!condition)throw Error(label);console.log('PASS '+label);};
const rpc=async(client,name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw Error(name+': '+error.message);return data;};
try{
 for(let i=0;i<3;i++){
  const email=`allvailable-test-${randomUUID()}@example.test`,password=randomUUID()+'aA1!';
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:`Synthetic guest ${i+1}`}});
  if(error)throw Error(error.message);
  const row={id:data.user.id,client:createClient(url,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options)};users.push(row);
  const login=await row.client.auth.signInWithPassword({email,password});if(login.error)throw Error(login.error.message);row.token=login.data.session.access_token;
 }
 const host=users[0].client;
 gathering=await rpc(host,'create_gathering_once',{p_key:randomUUID(),p_input:{name:'Synthetic acceptance — delete after run',dateStart:'2035-10-03',dateEnd:'2035-10-03',dailyStart:'18:00',dailyEnd:'22:00',duration:60,deadline:'2035-10-02T10:00:00Z',saveAsDraft:true}});
 check(gathering.status==='draft'&&!gathering.join_code,'draft has no code');
 await rpc(host,'manage_gathering',{p_id:gathering.id,p_version:String(gathering.revision),p_key:randomUUID(),p_action:'publish',p_input:{}});
 gathering=await rpc(host,'read_gathering',{p_id:gathering.id});check(/^\d{6}$/.test(gathering.join_code),'published six-digit code');
 for(const user of users.slice(1)){
  const found=await rpc(user.client,'resolve_gathering_code',{p_code:gathering.join_code});
  check(found.token===gathering.invite_token,'code resolves invitation');
  await rpc(user.client,'join_gathering',{p_invite_token:found.token});
 }
 const cells={'2035-10-03-19:00':'green','2035-10-03-19:30':'green'};
 for(const user of users){
  let detail=await rpc(user.client,'read_gathering',{p_id:gathering.id});
  let draft=await rpc(user.client,'save_availability_draft',{p_gathering_id:gathering.id,p_version:detail.availability_drafts[0].version,p_cells:cells});
  await rpc(user.client,'submit_availability',{p_gathering_id:gathering.id,p_expected_draft_version:draft.version,p_cells:cells,p_changes:[]});
 }
 const own=await rpc(users[1].client,'read_gathering',{p_id:gathering.id});
 check(own.availability_drafts.length===1&&own.availability_drafts[0].user_id===users[1].id,'owner-only draft projection');
 const foreign=await users[1].client.from('availability_drafts').select('*').eq('user_id',users[0].id);
 check(!foreign.error&&foreign.data.length===0,'cross-account draft read denied');
 const denied=await users[1].client.rpc('manage_gathering',{p_id:gathering.id,p_version:own.revision,p_key:randomUUID(),p_action:'publish',p_input:{}});
 check(Boolean(denied.error),'nonhost mutation denied');
 const result=await fetch(appOrigin.origin+'/api/v1/coordination/'+gathering.id+'/recalculate',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+users[0].token,apikey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({gatheringId:gathering.id})});
 if(!result.ok)throw Error('calculate-results HTTP '+result.status+': '+(await result.text()).slice(0,1200));
 check(result.ok,'deployed calculation endpoint');
 gathering=await rpc(host,'read_gathering',{p_id:gathering.id});
 const snapshot=gathering.result_snapshots[0];const best=snapshot.candidates[0];
 check(best.startsAt==='2035-10-03T11:00:00.000Z'||best.startsAt==='2035-10-03T11:00:00Z','correct shared hour');
 check(best.totalScore===6,'all three fully available');
 await rpc(host,'finalize_gathering',{p_gathering_id:gathering.id,p_snapshot_id:snapshot.id,p_candidate_id:best.id,p_expected_revision:gathering.revision});
 await rpc(host,'manage_gathering',{p_id:gathering.id,p_version:gathering.revision,p_key:randomUUID(),p_action:'reopen',p_input:{deadline:'2035-10-02T11:00:00Z'}});
 const reopened=await rpc(host,'read_gathering',{p_id:gathering.id});check(reopened.status==='open'&&reopened.finalizations.length===1,'reopen retains history');
 const settings=await fetch(url+'/auth/v1/settings',{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}}).then(r=>r.json());
 console.log('Google provider enabled: '+Boolean(settings.external?.google));
 console.log('Hosted synthetic acceptance complete. Not a real-friends or live-AI test.');
}finally{
 if(gathering){const {error}=await admin.from('gatherings').delete().eq('id',gathering.id);if(error)console.error('Cleanup gathering failed: '+error.message);}
 for(const u of users){const {error}=await admin.auth.admin.deleteUser(u.id);if(error)console.error('Cleanup test user failed: '+error.message);}
}
