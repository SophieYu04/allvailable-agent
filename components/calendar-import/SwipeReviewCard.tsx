'use client';
import {useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {useLanguage} from '@/components/dining/Language';
export default function SwipeReviewCard({children,remaining,disabled,canConfirm,onConfirm,onSkip,onEdit,onDiscard,simple=false}:{simple?:boolean;children:ReactNode;remaining:number;disabled:boolean;canConfirm:boolean;onConfirm:()=>void;onSkip:()=>void;onEdit:()=>void;onDiscard?:()=>void}) {
 const {t}=useLanguage();const origin=useRef<{x:number;y:number}|null>(null);const [offset,setOffset]=useState(0);const swipeOffset=useRef(0);
 function move(e:PointerEvent<HTMLDivElement>){if(!origin.current||disabled)return;const x=e.clientX-origin.current.x,y=e.clientY-origin.current.y;if(Math.abs(y)>Math.abs(x)&&Math.abs(y)>14){origin.current=null;swipeOffset.current=0;setOffset(0);return;}swipeOffset.current=Math.max(-130,Math.min(130,x));setOffset(swipeOffset.current);}
 function finish(){const x=swipeOffset.current;origin.current=null;swipeOffset.current=0;setOffset(0);if(disabled)return;if(x>85&&canConfirm)onConfirm();else if(x< -85)onSkip();}
 return <div className="review-card-stack" data-remaining={Math.min(remaining,3)}>
  {remaining>1&&<div className="review-card-back" aria-hidden="true"/>}
  <div className="review-swipe-card" style={{transform:`translateX(${offset}px) rotate(${offset/30}deg)`,touchAction:'pan-y',userSelect:'none'}} onPointerDown={e=>{if(disabled||e.button!==0||(e.target as HTMLElement).closest('button,input,select,textarea,summary,a'))return;swipeOffset.current=0;origin.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{origin.current=null;swipeOffset.current=0;setOffset(0);}}>
   {Math.abs(offset)>25&&<span className={'swipe-decision '+(offset>0?'accept':'skip')} aria-hidden="true">{offset>0?t('✓ 加入','✓ Add'):t('略過','Skip')}</span>}
   {onDiscard&&<button type="button" className="review-discard-stack" disabled={disabled} aria-label={t("刪除整疊卡片","Discard all cards")} title={t("刪除整疊卡片","Discard all cards")} onClick={onDiscard}>×</button>}
   {children}
   <div className={'review-card-actions'+(simple?' simple':'')}><button type="button" disabled={disabled} onClick={onSkip}>{t('✕ 略過','✕ Skip')}</button>{!simple&&<button type="button" disabled={disabled} onClick={onEdit}>{t('編輯','Edit')}</button>}<button type="button" className="dining-primary" disabled={disabled||!canConfirm} onClick={onConfirm}>{simple?t('✓ Busy','✓ Busy'):t('✓ 加入時間表','✓ Add to timetable')}</button></div>
   <p className="swipe-hint">{t('← 略過 · 右滑確認 →','← Skip · Swipe right to confirm →')}</p>
  </div>
 </div>;
}
