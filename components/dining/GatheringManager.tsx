"use client";
import { apiFetch } from '@/lib/api-fetch';
import { useRef, useState, type FormEvent } from "react";
import { useLanguage } from "./Language";

export type ManagedGathering = {
  id:string;name:string;date_start:string;date_end:string;daily_start:string;daily_end:string;
  deadline_at:string;duration_minutes:number;recommendation_count:number;revision:string;status:string;
  host_participates?:boolean;conditions_public?:boolean;
  memberships?:Array<{user_id:string;display_name:string;status:string;is_priority?:boolean}>;
};
export default function GatheringManager({ gathering:g, reload, onLeave, host, expired, disabled=false }:{
  gathering:ManagedGathering; reload:()=>Promise<void>;onLeave:()=>void;host:boolean;expired:boolean;disabled?:boolean;
}) {
  const {t}=useLanguage();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const key=useRef<{body:string;value:string}|null>(null);
  const inflight=useRef(false);
  const closed=['finalized','cancelled'].includes(g.status);
  async function run(action:string,input:Record<string,unknown>={}) {
    if(inflight.current || disabled)return;
    inflight.current=true;setBusy(true);setMessage("");
    const content=JSON.stringify({action,input,expectedRevision:g.revision});
    if(key.current?.body!==content)key.current={body:content,value:crypto.randomUUID()};
    try{
      const response=await apiFetch('/api/v1/coordination/'+g.id+'/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(content),idempotencyKey:key.current.value})});
      const result=await response.json() as {error?:{message?:string}};
      if(!response.ok)throw new Error(result.error?.message??t('操作失敗，輸入已保留','Could not save. Your input is retained.'));
      key.current=null;
      if(action==='leave'&&!host){onLeave();return;}
      await reload();setMessage(t('已更新','Updated.'));
    }catch(error){setMessage(error instanceof Error?error.message:'Request failed');}
    finally{inflight.current=false;setBusy(false);}
  }
  function settings(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const f=new FormData(event.currentTarget);
    void run('settings',{name:f.get('name'),dateStart:f.get('start'),dateEnd:f.get('end'),dailyStart:f.get('from'),dailyEnd:f.get('to'),duration:Number(f.get('duration')),recommendationCount:Number(f.get('count')),deadline:f.get('deadline')+':00+08:00',hostParticipates:f.has('participates'),conditionsPublic:f.has('public'),priorityIds:f.getAll('priority')});
  }
  const taipeiLocal=new Date(new Date(g.deadline_at).getTime()+8*3600000).toISOString().slice(0,16);
  return <section className="gathering-management">
    {message&&<p role="status">{message}</p>}
    {host&&g.status==='draft'&&<button className="dining-primary" disabled={busy||disabled||expired} onClick={()=>void run('publish')}>{t('發起聚會並填寫空檔','Launch event & add availability')}</button>}
    {host&&<details><summary>{t('主揪設定','Host controls')}</summary>
      {!closed&&!expired&&<form key={g.revision} onSubmit={settings}><fieldset disabled={busy||disabled} className="dining-form">
        <label className="dining-wide">{t('名稱','Name')}<input name="name" required defaultValue={g.name}/></label>
        <label>{t('開始日期','First date')}<input name="start" type="date" required defaultValue={g.date_start}/></label><label>{t('結束日期','Last date')}<input name="end" type="date" required defaultValue={g.date_end}/></label>
        <label>{t('每天開始','Daily start')}<input name="from" type="time" step="1800" required defaultValue={g.daily_start.slice(0,5)}/></label><label>{t('每天結束','Daily end')}<input name="to" type="time" step="1800" required defaultValue={g.daily_end.slice(0,5)}/></label>
        <label>{t('分鐘','Minutes')}<select name="duration" defaultValue={g.duration_minutes}>{[30,60,90,120,150,180,210,240].map(n=><option key={n}>{n}</option>)}</select></label>
        <label>{t('推薦數','Suggestions')}<select name="count" defaultValue={g.recommendation_count}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label>
        <label className="dining-wide">{t('截止（台灣時間）','Reply deadline · Taipei')}<input name="deadline" type="datetime-local" required defaultValue={taipeiLocal}/></label>
        <label className="check-label"><input name="participates" type="checkbox" defaultChecked={g.host_participates!==false}/>{t('我也參加','I am participating')}</label>
        <label className="check-label"><input name="public" type="checkbox" defaultChecked={g.conditions_public}/>{t('公開推薦條件','Share ranking criteria')}</label>
        <fieldset className="dining-wide"><legend>{t('優先出席者','Priority guests')}</legend>{g.memberships?.filter(m=>m.status==='joined').map(m=><label className="check-label" key={m.user_id}><input type="checkbox" name="priority" value={m.user_id} defaultChecked={m.is_priority}/>{m.display_name}</label>)}</fieldset>
        <p className="dining-wide dining-note">{t('更改日期、時段或長度後，成員需重新提交。','Changing dates, hours or duration requires new submissions.')}</p>
        <button type="submit" className="dining-primary">{t('儲存設定','Save settings')}</button>
      </fieldset></form>}
      {!closed&&g.status!=='draft'&&<form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void run('add-candidate',{startsAt:f.get('candidate')+':00+08:00'});}}><fieldset disabled={busy||disabled}><label>{t('加入候選（台灣時間）','Add candidate · Taipei')}<input name="candidate" type="datetime-local" step="1800" required/></label><button>{t('加入並等待重算','Add for next calculation')}</button></fieldset></form>}
      {g.status!=='draft'&&<form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);if(confirm(t('重新開放回覆並取消目前拍板？歷史結果會保留。','Reopen replies and clear the current final choice? History is retained.')))void run('reopen',{deadline:f.get('deadline')+':00+08:00'});}}><fieldset disabled={busy||disabled}><label>{t('新的截止（台灣時間）','New deadline · Taipei')}<input name="deadline" type="datetime-local" required/></label><button>{t('重開飯局','Reopen gathering')}</button></fieldset></form>}
    </details>}
    {!closed&&!expired&&g.status!=='draft'&&<button disabled={busy||disabled} onClick={()=>{if(confirm(t('退出後不再參與計分。確定退出？','Leave this gathering? Your response will no longer count.')))void run('leave');}}>{host?t('只管理，不參加','Manage without participating'):t('退出飯局','Leave gathering')}</button>}
  </section>;
}
