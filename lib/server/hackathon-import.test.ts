import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { requireUser } from './auth';
import { POST } from '@/app/api/calendar-imports/route';
import { GET as listImports } from '@/app/api/calendar-imports/route';
import { GET, POST as updateImport } from '@/app/api/calendar-imports/[id]/route';
vi.mock('./auth',()=>({requireUser:vi.fn()}));
const rpc=vi.fn();
function query(data:unknown){return {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data,error:null}),single:vi.fn().mockResolvedValue({data,error:null})};}
function listQuery(){return {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),gt:vi.fn().mockReturnThis(),order:vi.fn().mockResolvedValue({data:[],error:null})};}
const from=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('AI_IMPORT_ENABLED','true');vi.stubEnv('NEBIUS_AUDIO_API_KEY','');vi.stubEnv('NEBIUS_AUDIO_BASE_URL','');vi.stubEnv('NEBIUS_AUDIO_MODEL','');vi.stubEnv('NEBIUS_API_KEY','');vi.mocked(requireUser).mockResolvedValue({user:{id:'viewer'},supabase:{from,rpc}} as never);});
afterEach(()=>vi.unstubAllEnvs());
function audioRequest(gatheringId?:string){const form=new FormData();form.set('audio',new Blob(['voice'],{type:'audio/webm;codecs=opus'}),'voice.webm');if(gatheringId)form.set('gatheringId',gatheringId);return new Request('http://localhost/api/calendar-imports',{method:'POST',body:form});}
it('refuses a nonmember before inference or quota consumption',async()=>{
 const membership=query(null);from.mockReturnValue(membership);
 const response=await POST(audioRequest('group'));
 expect(response.status).toBe(403);expect(membership.eq).toHaveBeenCalledWith('user_id','viewer');expect(rpc).not.toHaveBeenCalled();
});
it('reports missing models before consuming AI quota, including Chrome codec MIME',async()=>{
 const response=await POST(audioRequest());expect(response.status).toBe(503);
 expect(await response.json()).toMatchObject({error:{code:'NEBIUS_NOT_CONFIGURED'}});expect(rpc).not.toHaveBeenCalled();
});
it('scopes private import reads to the current user',async()=>{
 const owned=query(null);from.mockReturnValue(owned);
 const response=await GET(new Request('http://localhost/api/calendar-imports/private'),{params:Promise.resolve({id:'private'})});
 expect(response.status).toBe(404);expect(owned.eq).toHaveBeenCalledWith('user_id','viewer');
});
it('keeps a dated-task import in clarification when answering one question creates the next ones',async()=>{
 const extraction={sources:[{id:'image',kind:'calendar',reason:null}],events:[{id:'row',sourceIds:['image'],label:'Dinner',intent:'uncertain',startDate:null,startTime:null,endDate:null,endTime:null,sourceTimezone:null,allDay:false,recurrence:null,unresolved:['date','time','timezone']}],visibleRanges:[],questions:[{id:'row-date',eventId:'row',kind:'date',prompt:'Which date?'}]};
 const importRow={id:'import',user_id:'viewer',version:1,status:'needs_clarification',expires_at:new Date(Date.now()+60_000).toISOString(),clarification_count:0,extraction};
 const initial={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({data:importRow,error:null})};
 let saved:Record<string,unknown>|undefined;
 const update={update:vi.fn((value:Record<string,unknown>)=>{saved=value;return update;}),eq:vi.fn().mockReturnThis(),select:vi.fn().mockReturnThis(),single:vi.fn().mockImplementation(async()=>({data:{id:'import',...saved,version:2,expires_at:importRow.expires_at},error:null}))};
 from.mockReturnValueOnce(initial).mockReturnValueOnce(update);
 const response=await updateImport(new Request('http://localhost/api/calendar-imports/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'clarify',version:'1',answer:{questionId:'row-date',value:'2026-10-03'}})}),{params:Promise.resolve({id:'import'})});
 const body=await response.json() as {status:string;extraction:{questions:Array<{kind:string}>}};
 expect(response.status).toBe(200);
 expect(body.status).toBe('needs_clarification');
 expect(body.extraction.questions.map(question=>question.kind)).toEqual(['time','timezone']);
});
it('exposes web voice only when the complete independent audio provider is configured',async()=>{
 const list=listQuery();from.mockReturnValue(list);
 const unavailable=await listImports(new Request('http://localhost/api/calendar-imports'));
 expect(await unavailable.json()).toMatchObject({imports:[],webAudioAvailable:false});
 vi.stubEnv('NEBIUS_AUDIO_API_KEY','audio-test-key');
 vi.stubEnv('NEBIUS_AUDIO_BASE_URL','https://api.example.test/v1');
 vi.stubEnv('NEBIUS_AUDIO_MODEL','speech-model');
 const configured=await listImports(new Request('http://localhost/api/calendar-imports'));
 expect(await configured.json()).toMatchObject({imports:[],webAudioAvailable:true});
 vi.stubEnv('NEBIUS_AUDIO_BASE_URL','');
 const partial=await listImports(new Request('http://localhost/api/calendar-imports'));
 expect(await partial.json()).toMatchObject({imports:[],webAudioAvailable:false});
});
