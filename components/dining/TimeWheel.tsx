"use client";
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from './Language';

// A web wheel picker inspired by iOS Clock; scroll, touch, click and keyboard work alike.
function Wheel({ values, value, onChange, label }: { values: string[]; value: string; onChange: (value: string)=>void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onChange);
  useEffect(()=>{callback.current=onChange;},[onChange]);
  useEffect(()=>{ const el=ref.current; if(el)el.scrollTop=Math.max(0,values.indexOf(value))*44; },[value,values]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const select = (index: number) => {
    const next=Math.max(0,Math.min(values.length-1,index));
    ref.current?.scrollTo({top:next*44,behavior:'auto'}); onChange(values[next]);
  };
  return <div className="clock-wheel" ref={ref} role="spinbutton" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={values.length-1} aria-valuenow={Math.max(0,values.indexOf(value))} aria-valuetext={value}
    onKeyDown={event=>{const index=values.indexOf(value);if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();select(event.key==='Home'?0:event.key==='End'?values.length-1:index+(event.key==='ArrowDown'?1:-1));}}}
    onScroll={()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{const el=ref.current;if(el)callback.current(values[Math.max(0,Math.min(values.length-1,Math.round(el.scrollTop/44)))]);},100);}}>
    {values.map((item,index)=><div key={item} className={'clock-number'+(item===value?' selected':'')} aria-hidden="true" onClick={()=>select(index)}>{item}</div>)}
  </div>;
}
const hours=Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
const minutes=['00','30'];
export default function TimeWheel({ label, value, onChange, allowMidnight=false }: {label: string; value: string; onChange:(value:string)=>void; allowMidnight?:boolean}) {
  const {t}=useLanguage();
  const dialog=useRef<HTMLDialogElement>(null);
  const [draft,setDraft]=useState(value);
  const [revision,setRevision]=useState(0);
  const [hour,minute]=draft.split(':');
  return <>
    <button className="clock-row" type="button" onClick={()=>{setDraft(value);dialog.current?.showModal();setRevision(v=>v+1);}} aria-label={`${label}: ${value}`}><span>{label}</span><strong>{value}</strong></button>
    <dialog className="clock-dialog" ref={dialog} aria-label={label}>
      <div className="clock-dialog-header"><button type="button" onClick={()=>dialog.current?.close()}>{t('取消','Cancel')}</button><h3>{label}</h3><button type="button" onClick={()=>{onChange(draft);dialog.current?.close();}}>{t('完成','Done')}</button></div>
      <div className="clock-wheels"><div className="clock-selection"/><Wheel key={`hours-${revision}`} label={t('小時','Hour')} values={hours} value={hour==='24'?'00':hour} onChange={h=>setDraft(`${h}:${minute}`)}/><span className="clock-colon">:</span><Wheel key={`minutes-${revision}`} label={t('分鐘','Minute')} values={minutes} value={minute} onChange={m=>setDraft(`${hour==='24'?'00':hour}:${m}`)}/></div>
      <p>{t('台灣時間 · 24 小時制','Taipei time · 24-hour clock')}</p>
      {allowMidnight && <button type="button" className="clock-midnight" onClick={()=>{onChange('24:00');dialog.current?.close();}}>{t('直到當天午夜（24:00）','Until midnight (24:00)')}</button>}
    </dialog>
  </>;
}
