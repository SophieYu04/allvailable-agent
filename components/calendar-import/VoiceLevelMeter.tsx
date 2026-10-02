'use client';
import {Mic} from 'lucide-react';
import {useLanguage} from '@/components/dining/Language';
export default function VoiceLevelMeter({level}:{level:number}) {
 const {t}=useLanguage();const value=Math.round(Math.min(1,Math.max(0,level))*100);
 return <div className="voice-level-meter" role="meter" aria-label={t('麥克風音量','Microphone level')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
  <Mic size={20} aria-hidden="true"/><div className="voice-level-bars" aria-hidden="true">{Array.from({length:20},(_,index)=><span key={index} className={index<value/5?'is-active':''} style={{height:8+(index%5)*4}}/>)}</div>
 </div>;
}
