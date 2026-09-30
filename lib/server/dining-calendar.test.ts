import {beforeEach,describe,expect,it,vi} from 'vitest';
import {requireUser} from './auth';
import {GET,POST} from '@/app/api/gatherings/[id]/personal-calendar/route';
vi.mock('./auth',()=>({requireUser:vi.fn()}));
const from=vi.fn();const rpc=vi.fn();
const context={params:Promise.resolve({id:'meal'})};
function query(data:unknown){const result={data,error:null};return {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),is:vi.fn().mockReturnThis(),gte:vi.fn().mockReturnThis(),lte:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue(result),maybeSingle:vi.fn().mockResolvedValue(result),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};}
const gathering={date_start:'2030-01-01',date_end:'2030-01-01',daily_start:'18:00',daily_end:'22:00'};
const event={start_at:'2030-01-01T10:00:00Z',end_at:'2030-01-01T10:30:00Z',all_day:false};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requireUser).mockResolvedValue({user:{id:'owner'},supabase:{from,rpc}} as never);});
describe('dining reads the App calendar',()=>{
 it('maps App busy and Google tentative, excludes free and private titles',async()=>{
   const tables:Record<string,ReturnType<typeof query>>={gatherings:query(gathering),availability_drafts:query({cells:{},version:'9007199254740993'}),personal_busy_cells:query([]),calendar_events:query([{...event,title:'PRIVATE APP'}]),external_calendar_events:query([{...event,start_at:'2030-01-01T10:30:00Z',end_at:'2030-01-01T11:00:00Z',availability:'tentative',title:'PRIVATE GOOGLE'},{...event,start_at:'2030-01-01T11:00:00Z',end_at:'2030-01-01T11:30:00Z',availability:'free'}])};
   from.mockImplementation(table=>tables[table]);
   const response=await GET(new Request('https://test/api'),context);
   const body=await response.json() as {changes:unknown[];draftVersion:string};
   expect(response.status).toBe(200);expect(body.draftVersion).toBe('9007199254740993');
   expect(body.changes).toEqual([{key:'2030-01-01-18:00',before:'unknown',after:'red'},{key:'2030-01-01-18:30',before:'unknown',after:'yellow'}]);
   expect(JSON.stringify(body)).not.toContain('PRIVATE');
   expect(tables.calendar_events.eq).toHaveBeenCalledWith('user_id','owner');
   expect(tables.external_calendar_events.eq).toHaveBeenCalledWith('user_id','owner');
   expect(tables.external_calendar_events.select.mock.calls[0][0]).not.toContain('title');
 });
 it('rejects a calendar change after preview without writing a draft',async()=>{
   from.mockImplementation(table=>query(table==='gatherings'?gathering:table==='availability_drafts'?{version:'2',cells:{}}:table==='calendar_events'?[event]:[]));
   const response=await POST(new Request('https://test/api',{method:'POST',body:JSON.stringify({expectedDraftVersion:'2',selectedKeys:['2030-01-01-18:00'],expectedStatuses:{'2030-01-01-18:00':'yellow'}})}),context);
   expect(response.status).toBe(409);expect(rpc).not.toHaveBeenCalled();
 });
 it('applies only explicitly selected differences preserving other choices',async()=>{
   from.mockImplementation(table=>query(table==='gatherings'?gathering:table==='availability_drafts'?{version:'2',cells:{'2030-01-01-19:00':'green'}}:table==='calendar_events'?[event]:[]));
   rpc.mockResolvedValue({data:{version:'3',cells:{}},error:null});
   const response=await POST(new Request('https://test/api',{method:'POST',body:JSON.stringify({expectedDraftVersion:'2',selectedKeys:['2030-01-01-18:00'],expectedStatuses:{'2030-01-01-18:00':'red'}})}),context);
   expect(response.status).toBe(200);expect(rpc).toHaveBeenCalledWith('save_availability_draft',{p_gathering_id:'meal',p_version:'2',p_cells:{'2030-01-01-19:00':'green','2030-01-01-18:00':'red'}});
 });
});
