"use client";
import { useState, type FormEvent } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { enUS, zhTW } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import { useLanguage } from './Language';
import PlanAssistant, { type PlanDraft } from './PlanAssistant';
import TimeWheel from './TimeWheel';

const toDate=(s:string)=>new Date(`${s}T12:00:00`);
const key=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function Fields({draft,busy,onSubmit,onCancel}:{draft:PlanDraft|null;busy:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onCancel:()=>void}) {
  const {t,language}=useLanguage();
  const [range,setRange]=useState<DateRange|undefined>(draft?.dateStart ? {from:toDate(draft.dateStart),to:toDate(draft.dateEnd || draft.dateStart)} : undefined);
  const [from,setFrom]=useState(draft?.dailyStart || '18:00');
  const [to,setTo]=useState(draft?.dailyEnd || '22:00');
  const [error,setError]=useState('');
  const today=toDate(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  const start=range?.from ? key(range.from) : '';
  const end=range?.to ? key(range.to) : start;
  const dateLabel=(date:Date)=>new Intl.DateTimeFormat(language==='zh'?'zh-TW':'en-GB',{month:'short',day:'numeric'}).format(date);
  function submit(event:FormEvent<HTMLFormElement>){
    if(!start){event.preventDefault();setError(t('請先在月曆選擇日期。','Choose your dates on the calendar.'));return;}
    if(to<=from){event.preventDefault();setError(t('結束時間需晚於開始時間。','Choose an end time after the start.'));return;}
    setError('');onSubmit(event);
  }
  return <form onSubmit={submit}><fieldset className="launch-fields" disabled={busy}>
    <section className="launch-block launch-name"><label htmlFor="plan-name">{t('聚會','Plan')}</label><input id="plan-name" aria-label={t('聚會名稱','Plan name')} name="name" required maxLength={80} defaultValue={draft?.name || ''} placeholder={t('晚餐、讀書會、一起跑步…','Dinner, a study group, a run…')}/></section>
    <section className="launch-block launch-dates" aria-label={t('可接受的日期','Acceptable dates')}><div className="launch-section-title"><h3>{t('日期','Dates')}</h3><span>{t('最多 14 天','14 days max')}</span></div><p className="launch-help">{t('選一天，或選起訖日期。','Pick a day or a range.')}</p>
      <DayPicker mode="range" selected={range} onSelect={setRange} max={13} disabled={{before:today}} excludeDisabled defaultMonth={range?.from || today} locale={language==='zh'?zhTW:enUS} showOutsideDays/>
      <p className="date-selection" aria-live="polite">{range?.from ? `${dateLabel(range.from)}${range.to && key(range.to)!==start ? ` - ${dateLabel(range.to)}` : ''}` : t('選擇日期','Select dates')}</p><input type="hidden" name="start" value={start}/><input type="hidden" name="end" value={end}/>
    </section>
    <section className="launch-block launch-times" aria-label={t('可接受的時段','Acceptable times')}><div className="launch-section-title"><h3>{t('時間','Time')}</h3><span>{t('台灣時間','Taipei time')}</span></div><div className="clock-group"><TimeWheel label={t('開始','From')} value={from} onChange={setFrom}/><TimeWheel label={t('結束','Until')} value={to} onChange={setTo} allowMidnight/></div><input type="hidden" name="from" value={from}/><input type="hidden" name="to" value={to}/>
    <label className="launch-duration">{t('活動長度','Duration')} <span>{t('選填','Optional')}</span><select name="duration" defaultValue={draft?.duration ?? ''}><option value="">{t('不指定','No preference')}</option>{[30,60,90,120,150,180,210,240].map(n=><option key={n} value={n}>{n} {t('分鐘','minutes')}</option>)}</select></label></section>
    <section className="launch-block launch-reply"><label className="launch-deadline">{t('回覆期限','Reply by')}<input name="deadline" type="datetime-local" required max={start?`${start}T${from}`:undefined} defaultValue={draft?.deadline && Number.isFinite(Date.parse(draft.deadline)) ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(draft.deadline)).replace(' ','T') : ''}/><small>{t('台灣時間，聚會開始前。','Taipei time · Before the gathering.')}</small></label></section>
    <details className="launch-options"><summary>{t('其他設定','More options')}</summary><label><input type="checkbox" name="participates" defaultChecked/>{t('我也參加','I am participating')}</label><label><input type="checkbox" name="public"/>{t('公開推薦條件','Share ranking criteria')}</label></details>
    {error&&<p role="alert" className="dining-message">{error}</p>}
    <div className="launch-actions"><button type="button" onClick={onCancel}>{t('取消','Cancel')}</button><button type="submit" className="dining-primary">{busy?t('儲存中…','Saving…'):t('發起聚會','Launch event')}</button></div>
  </fieldset></form>;
}
export default function LaunchForm({busy,onSubmit,onCancel}:{busy:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onCancel:()=>void}) {
  const {t}=useLanguage();const [draft,setDraft]=useState<PlanDraft|null>(null);const [version,setVersion]=useState(0);const [assistantBusy,setAssistantBusy]=useState(false);
  return <section className="launch-panel"><h1>{t('一起約個時間','Make a plan')}</h1><details className="launch-ai"><summary>{t('用 AI 規劃','Plan with AI')}</summary><PlanAssistant disabled={busy} onBusyChange={setAssistantBusy} onDraft={value=>{setDraft(value);setVersion(v=>v+1);}}/></details><Fields key={version} draft={draft} busy={busy||assistantBusy} onSubmit={onSubmit} onCancel={onCancel}/></section>;
}
