"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import NavigationMenu from "./NavigationMenu";
import PlanAssistant, { type PlanDraft } from './PlanAssistant';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import './dining.css';
import './workflow.css';
import { ArrowUpRight } from 'lucide-react';
import { useLanguage } from './Language';

type Meal = {id:string;name:string;date_start:string;date_end:string;status:string;deadline_at:string;host_id:string;memberships?:Array<{user_id:string;status:string}>;availability_submissions?:Array<{user_id:string}>};
const statusText:Record<string,string>={open:'等大家回覆',draft:'草稿',calculated:'推薦已出爐',finalized:'已拍板',cancelled:'已取消'};
export default function DiningHome(){
  const router=useRouter();
  const {t}=useLanguage();
  const [meals,setMeals]=useState<Meal[]>([]);
  const [userId,setUserId]=useState<string|null>(null);
  const [scope,setScope]=useState<'all'|'hosting'|'joined'>('all');
  const [user,setUser]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [creating,setCreating]=useState(false);
  const [planDraft,setPlanDraft]=useState<PlanDraft|null>(null);
  const [draftVersion,setDraftVersion]=useState(0);
  const [assistantBusy,setAssistantBusy]=useState(false);
  const [busy,setBusy]=useState(false);
  const [ended,setEnded]=useState(false);
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
      const response=await fetch('/api/v1/coordination',{cache:'no-store'});
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
      const response=await fetch('/api/v1/coordination',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.get('name'),dateStart:form.get('start'),dateEnd:form.get('end'),dailyStart:form.get('from'),dailyEnd:form.get('to'),duration:Number(form.get('duration')),deadline:`${form.get('deadline')}:00+08:00`,recommendationCount:3,saveAsDraft:true,hostParticipates:form.has('participates'),conditionsPublic:form.has('public'),idempotencyKey:requestKey.current})});
      const result=await response.json() as {error?:{message?:string};gatherings:Meal[];gathering:Meal};
      if(!response.ok)throw new Error(result.error?.message??t("建立失敗，填寫已保留", "Creation failed. Your input is retained."));
      router.push(`/gatherings/${result.gathering.id}`);
    }catch(error){setMessage(error instanceof Error?error.message:t("建立失敗，請重試", "Creation failed. Retry."));}
    finally{submitting.current=false;setBusy(false);}
  }
  const visible=meals.filter(m=>ended===['finalized','cancelled'].includes(m.status) && (scope==='all' || (scope==='hosting' ? m.host_id===userId : m.host_id!==userId)));
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const nextDate = (days:number) => new Date(new Date(today+'T00:00:00Z').getTime()+days*86400000).toISOString().slice(0,10);
  const deadlineLabel = (value:string) => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
  return <main className="dining workflow-home"><header className="dining-nav"><NavigationMenu/></header>
    <section className={"workflow-heading" + (!user ? " welcome-heading" : "")}
      onPointerMove={event=>{if(event.pointerType!=="mouse")return;const box=event.currentTarget.getBoundingClientRect();event.currentTarget.style.setProperty('--pointer-x',`${((event.clientX-box.left)/box.width-.5)*10}px`);event.currentTarget.style.setProperty('--pointer-y',`${((event.clientY-box.top)/box.height-.5)*6}px`);}}
      onPointerLeave={event=>{event.currentTarget.style.setProperty('--pointer-x','0px');event.currentTarget.style.setProperty('--pointer-y','0px');}}>
      <h1>{user?t('我的飯局','My gatherings'):<><span>Make time</span><br/><span className="home-wordmark">Allvailable</span></>}</h1>
      <div className="home-entry-actions">{user?<button className="dining-primary" disabled={creating} onClick={()=>{requestKey.current=null;setPlanDraft(null);setCreating(true);}}>{t('發起','Launch')}<ArrowUpRight size={18}/></button>:<Link className="dining-primary" href="/login">{t('發起','Launch')}<ArrowUpRight size={18}/></Link>}<Link className="home-join" href="/join">{t('加入','Join')}<span aria-hidden="true">→</span></Link></div>
    </section>
    {message&&<div className="dining-message" role="status">{message}<button disabled={loading} onClick={()=>void load()}>{t('重試','Retry')}</button></div>}
    {creating&&<section className="dining-panel"><p className="dining-eyebrow">{t('新的邀約','NEW PLAN')}</p><h2>{t('這次約什麼？','New gathering')}</h2><PlanAssistant disabled={busy} onBusyChange={setAssistantBusy} onDraft={draft=>{setPlanDraft(draft);setDraftVersion(v=>v+1);requestKey.current=null;}}/><form key={draftVersion} onSubmit={create}><fieldset disabled={busy||assistantBusy} className="dining-form"><label className="dining-wide">{t('邀約名稱','Invitation name')}<input autoFocus name="name" defaultValue={planDraft?.name??''} required maxLength={80} placeholder={t('週末聚餐、讀書會、一起運動…','Dinner, study group, a run…')}/></label><label>{t('最早日期','First date')}<input name="start" type="date" defaultValue={planDraft ? planDraft.dateStart??'' : nextDate(1)} required/></label><label>{t('最晚日期','Last date')}<input name="end" type="date" defaultValue={planDraft ? planDraft.dateEnd??'' : nextDate(14)} required/></label><label>{t('每天開始','Daily start')}<input name="from" type="time" step="1800" defaultValue={planDraft ? planDraft.dailyStart??'' : '18:00'} required/></label><label>{t('每天結束','Daily end')}<input name="to" type="time" step="1800" defaultValue={planDraft ? planDraft.dailyEnd??'' : '22:00'} required/></label><label>{t('活動長度','Duration')}<select name="duration" required defaultValue={planDraft ? planDraft.duration??'' : 120}><option value="" disabled>{t('選擇長度','Choose duration')}</option>{[30,60,90,120,150,180,210,240].map(n=><option key={n} value={n}>{n} {t('分鐘','minutes')}</option>)}</select></label><label>{t('回覆截止（台灣時間）','Reply deadline (Taipei time)')}<input name="deadline" type="datetime-local" defaultValue={planDraft?.deadline && Number.isFinite(Date.parse(planDraft.deadline)) ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(planDraft.deadline)).replace(' ','T') : ''} required/></label><label className="check-label"><input type="checkbox" name="participates" defaultChecked/>{t('我也參加','I am participating')}</label><label className="check-label"><input type="checkbox" name="public"/>{t('公開推薦條件','Share ranking criteria')}</label><p className="dining-wide dining-note">{t('最多 14 天、10 人。回覆截止需早於最早候選時間。','Up to 14 days and 10 people. Reply deadline must precede the first candidate time.')}</p><div className="dining-actions dining-wide"><button type="submit" className="dining-primary">{busy?t('建立中…','Creating…'):t('建立並邀請朋友','Save gathering draft')}</button><button type="button" onClick={()=>setCreating(false)}>{t('取消','Cancel')}</button></div></fieldset></form></section>}
    {user&&<section className="dining-list"><div className="dining-actions"><div className="gathering-filters">{(['all','hosting','joined'] as const).map(value=><button key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{value==='all'?t('全部','All'):value==='hosting'?t('我發起的','Hosting'):t('我參加的','Joined')}</button>)}</div><button aria-pressed={!ended} onClick={()=>setEnded(false)}>{t('進行中','Active')}</button><button aria-pressed={ended} onClick={()=>setEnded(true)}>{t('已結束','Finished')}</button><button disabled={loading||busy} onClick={()=>void load()}>{t('重新整理','Refresh')}</button></div>{loading?<p role="status">{t('載入邀約中…','Loading invitations…')}</p>:visible.length===0?<div className="dining-empty">{t('還沒有邀約。從一個連結開始。','No plans yet.')}</div>:<div className="dining-cards">{visible.map(meal=><Link className="dining-meal" key={meal.id} href={`/gatherings/${meal.id}`}><span className="dining-badge">{t(statusText[meal.status]??meal.status,({open:'Collecting replies',draft:'Draft',calculated:'Results ready',finalized:'Finalized',cancelled:'Cancelled'} as Record<string,string>)[meal.status]??meal.status)}</span><span className="gathering-role">{meal.host_id===userId?t('我發起的','Hosting'):t('我參加的','Joined')}</span><h3>{meal.name}</h3><p>{meal.date_start} – {meal.date_end}</p><p>{t('回覆截止','Reply by')} {deadlineLabel(meal.deadline_at)}</p><p className="my-response">{meal.availability_submissions?.some(s=>s.user_id===userId)?t('你已提交','You submitted'):t('你尚未提交','Your reply is pending')}</p><p>{meal.availability_submissions?.length??0} / {meal.memberships?.filter(m=>m.status==='joined').length??0} {t('人已提交','submitted')}</p><span>{t('查看邀約','View')} →</span></Link>)}</div>}</section>}
    <footer className="dining-footer"><Link href="/privacy">{t('隱私說明','Privacy')}</Link> · <Link href="/terms">{t('服務條款','Terms')}</Link></footer>
  </main>;
}
