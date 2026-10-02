import {afterEach,expect,it,vi}from'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),binding:vi.fn(),transcribe:vi.fn()}));
vi.mock('@/lib/server/auth',()=>({requireUser:mocks.user}));
vi.mock('@/lib/ai/cloudflare-audio',()=>({workersAudioBinding:mocks.binding,transcribeWorkersAudio:mocks.transcribe}));
import{POST}from '@/app/api/calendar-imports/transcribe/route';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
function request(type='audio/webm'){const form=new FormData();form.set('audio',new Blob(['synthetic recording'],{type}),'synthetic.webm');return new Request('https://example.test/api/calendar-imports/transcribe',{method:'POST',body:form});}
it('requires login before reading recordings',async()=>{mocks.user.mockRejectedValue(new Error());expect((await POST(request())).status).toBe(401);expect(mocks.transcribe).not.toHaveBeenCalled();});
it('uses the Workers AI binding for captions and returns text without model inference',async()=>{vi.stubEnv('AI_IMPORT_ENABLED','true');mocks.user.mockResolvedValue({});mocks.binding.mockResolvedValue({run:vi.fn()});mocks.transcribe.mockResolvedValue('晚上七點到八點沒空');const r=await POST(request());expect(r.status).toBe(200);expect(await r.json()).toEqual({transcript:'晚上七點到八點沒空'});});
it('rejects invalid file types and preserves no-speech as a recoverable error',async()=>{vi.stubEnv('AI_IMPORT_ENABLED','true');mocks.user.mockResolvedValue({});expect((await POST(request('text/plain'))).status).toBe(415);mocks.binding.mockResolvedValue({});mocks.transcribe.mockRejectedValue(new Error('AUDIO_NO_SPEECH'));expect((await POST(request())).status).toBe(422);});
