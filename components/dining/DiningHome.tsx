"use client";
import { apiFetch } from '@/lib/api-fetch';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import NavigationMenu from "./NavigationMenu";
import LaunchForm from './LaunchForm';
import { timelineMeals, type TimelineMeal } from '@/lib/calendar/timeline';
import './launch.css';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import './dining.css';
import './workflow.css';
import { ArrowUpRight, CalendarDays, History } from 'lucide-react';
import { useLanguage } from './Language';

type Meal = TimelineMeal;
const statusText:Record<string,string>={open:'等大家回覆',draft:'草稿',calculated:'推薦已出爐',finalized:'已拍板',cancelled:'已取消'};
export default function DiningHome({view = 'upcoming'}: {view?: 'upcoming' | 'history' | 'hosting'}){
  const router=useRouter();
  const {t}=useLanguage();
  const [meals,setMeals]=useState<Meal[]>([]);
  const [userId,setUserId]=useState<string|null>(null);
  const [user,setUser]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [creating,setCreating]=useState(false);
  const [busy,setBusy]=useState(false);
  const requestKey=useRef<string|null>(null);
  const submitting=useRef(false);
  const generation=useRef(0);
  const load=useCallback(async()=>{
    const epoch=++generation.current;
    setLoading(true);setMessage('');
    try{
      const client=getSupabaseBrowserClient();
      if(!client){setMessage(t("登入暫時無法使用。", "Sign-in is temporarily unavailable."));return;}
      const {data,error}=await client.auth.getUser();
      if(epoch!==generation.current)return;
      if(error||!data.user){setUser(null);setUserId(null);setMeals([]);return;}
      setUserId(data.user.id);
      setUser(data.user.email??t("已登入", "Signed in"));
      const response=await apiFetch('/api/v1/coordination',{cache:'no-store'});
      const result=await response.json() as {error?:{message?:string};gatherings:Meal[];gathering:Meal};
      if(epoch!==generation.current)return;
      if(!response.ok)throw new Error(result.error?.message??t("飯局載入失敗", "Unable to load invitations"));
      setMeals(result.gatherings??[]);
    }catch(error){if(epoch===generation.current)setMessage(error instanceof Error?error.message:t("載入失敗，請重試", "Unable to load. Retry."));}
    finally{if(epoch===generation.current)setLoading(false);}
  },[t]);
  useEffect(()=>{
    const timer=setTimeout(()=>void load(),0);
    const epochRef=generation;
    const client=getSupabaseBrowserClient();
    const subscription=client?.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){++epochRef.current;setUser(null);setUserId(null);setMeals([]);setCreating(false);setLoading(false);} });
    const refresh=()=>{if(document.visibilityState==='visible'&&!submitting.current)void load();};
    document.addEventListener('visibilitychange',refresh);
    return()=>{++epochRef.current;clearTimeout(timer);subscription?.data.subscription.unsubscribe();document.removeEventListener('visibilitychange',refresh);};
  },[load]);
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(submitting.current)return;
    const form=new FormData(event.currentTarget);
    submitting.current=true;setBusy(true);setMessage('');
    requestKey.current??=crypto.randomUUID();
    try{
      const response=await apiFetch('/api/v1/coordination',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.get('name'),dateStart:form.get('start'),dateEnd:form.get('end'),dailyStart:form.get('from'),dailyEnd:form.get('to'),...(form.get('duration') ? {duration:Number(form.get('duration'))} : {}),deadline:`${form.get('deadline')}:00+08:00`,recommendationCount:3,saveAsDraft:false,hostParticipates:form.has('participates'),conditionsPublic:form.has('public'),idempotencyKey:requestKey.current})});
      const result=await response.json() as {error?:{message?:string};gatherings:Meal[];gathering:Meal};
      if(!response.ok)throw new Error(result.error?.message??t("建立失敗，填寫已保留", "Creation failed. Your input is retained."));
      router.push(`/gatherings/${result.gathering.id}`);
    }catch(error){setMessage(error instanceof Error?error.message:t("建立失敗，請重試", "Creation failed. Retry."));}
    finally{submitting.current=false;setBusy(false);}
  }
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const visible = timelineMeals(meals, view, userId, today);
  const heading = view === 'history' ? t('歷史聚會','History') : view === 'hosting' ? t('我發起的聚會','Hosting') : t('接下來的聚會','Upcoming gatherings');
  const dayLabel = (value: string) => new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  const deadlineLabel = (value:string) => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
  return <main className="dining workflow-home"><header className="dining-nav"><Link href="/" className="dining-brand">Allvailable</Link><NavigationMenu onRefresh={()=>void load()} refreshDisabled={loading||busy||creating}/></header>
    {!creating && (!loading || user) && <section className={"workflow-heading" + (!user ? " welcome-heading" : "")}
      onPointerMove={event=>{if(event.pointerType!=="mouse")return;const box=event.currentTarget.getBoundingClientRect();event.currentTarget.style.setProperty('--pointer-x',`${((event.clientX-box.left)/box.width-.5)*10}px`);event.currentTarget.style.setProperty('--pointer-y',`${((event.clientY-box.top)/box.height-.5)*6}px`);}}
      onPointerLeave={event=>{event.currentTarget.style.setProperty('--pointer-x','0px');event.currentTarget.style.setProperty('--pointer-y','0px');}}>
      <h1>{user?heading:<><span>Make time</span><br/><span className="home-wordmark">Allvailable</span></>}</h1>
      <div className="home-entry-actions">{user?<button className="dining-primary" disabled={creating} onClick={()=>{requestKey.current=null;setCreating(true);}}>{t('發起','Launch')}<ArrowUpRight size={18}/></button>:<Link className="dining-primary" href="/login">{t('發起','Launch')}<ArrowUpRight size={18}/></Link>}<Link className="home-join" href="/join">{t('加入','Join')}<span aria-hidden="true">→</span></Link></div>
    </section>}
    {loading && !user && <div className="timeline-loading" role="status" aria-label={t("載入聚會中", "Loading gatherings")}><span/><span/><span/></div>}
    {message&&<div className="dining-message" role="status">{message}<button disabled={loading} onClick={()=>void load()}>{t('重試','Retry')}</button></div>}
    {creating && <LaunchForm busy={busy} onSubmit={create} onCancel={()=>setCreating(false)}/>}
    {user && !creating && <section className="gathering-timeline" aria-label={heading}>
      {loading ? <div className="timeline-loading" role="status" aria-label={t('載入聚會中','Loading gatherings')}><span/><span/><span/></div> : visible.length === 0 ? <div className="timeline-empty"><span className="timeline-empty-icon" aria-hidden="true">{view === 'history' ? <History size={28} strokeWidth={1.5}/> : <CalendarDays size={28} strokeWidth={1.5}/>}</span><h2>{view === 'history' ? t('還沒有歷史聚會','No past gatherings') : view === 'hosting' ? t('還沒有發起的聚會','No hosted gatherings') : t('目前沒有即將到來的聚會','No upcoming gatherings')}</h2><p>{view === 'history' ? t('結束的聚會會保留在這裡。','Finished gatherings will appear here.') : t('發起聚會，或用邀請碼加入。','Launch a plan or join with a code.')}</p></div> : <ol className="timeline-items">{visible.map(meal=><li key={meal.id}>
        <time className="timeline-date" dateTime={meal.date_start}><strong>{meal.date_start.slice(8)}</strong><span>{dayLabel(meal.date_start).split(' ')[1]}</span></time>
        <Link className="timeline-gathering" href={`/gatherings/${meal.id}`}><div className="timeline-summary"><span className="timeline-status">{t(statusText[meal.status]??meal.status,({open:'Collecting replies',draft:'Draft',calculated:'Ready to decide',finalized:'Confirmed',cancelled:'Cancelled'} as Record<string,string>)[meal.status]??meal.status)}</span><h2>{meal.name}</h2><p>{dayLabel(meal.date_start)}{meal.date_end!==meal.date_start ? ` - ${dayLabel(meal.date_end)}` : ''}</p></div><div className="timeline-response"><span>{meal.availability_submissions?.some(x=>x.user_id===userId)?t('已回覆','Replied'):meal.status==='finalized'?t('時間已定','Time confirmed'):new Date(meal.deadline_at).getTime()<=Date.now()?t('回覆已截止','Replies closed'):t('等你回覆','Your reply is pending')}</span><span className="timeline-deadline">{t('回覆截止','Reply by')} {deadlineLabel(meal.deadline_at)}</span></div><span className="timeline-arrow" aria-hidden="true">↗</span></Link>
      </li>)}</ol>}
    </section>}
    <footer className="dining-footer"><Link href="/privacy">{t('隱私說明','Privacy')}</Link> · <Link href="/terms">{t('服務條款','Terms')}</Link></footer>
  </main>;
}
