"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavigationMenu from "./NavigationMenu";
import { useLanguage } from "./Language";
import "./dining.css";
import "./workflow.css";
export default function JoinByCode({ initialCode }: { initialCode: string }) {
 const {t}=useLanguage(); const router=useRouter();
 const [code,setCode]=useState(initialCode); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 async function join(event:FormEvent) {
  event.preventDefault(); if(busy)return; setBusy(true);setError('');
  try {
   const response=await fetch('/api/v1/join-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
   if(response.status===401){router.push('/login?next='+encodeURIComponent('/join?code='+code));return;}
   const data=await response.json() as {token?:string};
   if(!response.ok){setError(response.status===429?t('請在十分鐘後重試','Try again in 10 minutes.'):response.status===404?t('找不到邀約，請確認編號','No gathering found. Check the code.'):t('目前無法加入，請稍後重試','Joining is unavailable. Try again shortly.'));return;}
   if(!data.token)throw new Error('Missing invitation');
   router.push('/join/'+encodeURIComponent(data.token));
  } catch {setError(t('連線失敗，請重試','Connection failed. Retry.'));} finally {setBusy(false);}
 }
 return <main className="dining workflow-detail join-code-page"><header className="dining-nav"><Link href="/" aria-label={t('返回','Back')}>←</Link><NavigationMenu/></header><h1>{t('加入邀約','Join a gathering')}</h1><form onSubmit={join}><label htmlFor="gathering-code">{t('六位數編號','Six-digit code')}</label><input id="gathering-code" className="join-code-input" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="000000" aria-describedby={error?'join-code-error':undefined}/><button className="dining-primary" disabled={busy||code.length!==6}>{busy?t('尋找中…','Finding…'):t('加入','Join →')}</button>{error&&<p id="join-code-error" role="alert">{error}</p>}</form></main>;
}
