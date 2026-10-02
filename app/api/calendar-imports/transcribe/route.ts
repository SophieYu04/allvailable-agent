import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/server/auth';
import {jsonError} from '@/lib/server/http';
import {workersAudioBinding,transcribeWorkersAudio} from '@/lib/ai/cloudflare-audio';
/** Caption fallback uses Workers AI only, never Nebius inference or card billing. */
export async function POST(request:Request){
 try{await requireUser(request);}catch{return jsonError(401,'UNAUTHENTICATED','請先登入');}
 if(process.env.AI_IMPORT_ENABLED!=='true')return jsonError(503,'AI_DISABLED','AI 尚未開放');
 const form=await request.formData();const audio=form.get('audio');
 if(!(audio instanceof File)||!audio.size||audio.size>10*1024*1024||!['audio/webm','audio/mp4','audio/wav','audio/mpeg','audio/x-m4a'].includes(audio.type.split(';')[0]))return jsonError(415,'AUDIO_INVALID','錄音格式或大小不符合限制');
 const ai=await workersAudioBinding();if(!ai)return jsonError(503,'CLOUDFLARE_AUDIO_NOT_CONFIGURED','此输入尚未設定，請手動填寫');
 try{return NextResponse.json({transcript:await transcribeWorkersAudio(audio,ai)});}
 catch(error){const code=error instanceof Error?error.message:'CLOUDFLARE_AUDIO_FAILED';return jsonError(code==='AUDIO_NO_SPEECH'?422:502,code,'辨識失敗，錄音仍保留，可重試',true);}
}
