"use client";

import { memo, useState, type PointerEvent } from 'react';
import Image from 'next/image';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { Check, Minus, LockKeyhole, Clock3 } from 'lucide-react';
import { useLanguage } from './Language';

// Fictional result snapshots: only candidate-specific submitted responses.
// Never model or display another participant's full calendar or submission grid.
const candidates = [
  { time: '19:00–20:30', statuses: ['available', 'available', 'available'] },
  { time: '18:00–19:30', statuses: ['available', 'available', 'unavailable'] },
  { time: '20:00–21:30', statuses: ['available', 'tentative', 'available'] },
] as const;

export default memo(function AvailabilityScene() {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(0);
  const reduced = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(pointerY, { stiffness: 110, damping: 24 });
  const rotateY = useSpring(pointerX, { stiffness: 110, damping: 24 });
  const candidate = candidates[selected];
  const count = candidate.statuses.filter(status => status === 'available').length;
  const names = [t('你', 'You'), 'Alex', 'Sam'];

  function move(event: PointerEvent<HTMLDivElement>) {
    if (reduced || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - rect.left) / rect.width - .5) * 5);
    pointerY.set(-((event.clientY - rect.top) / rect.height - .5) * 4);
  }
  function reset() { pointerX.set(0); pointerY.set(0); }
  function onKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? Math.min(candidates.length - 1, index + 1) : event.key === 'ArrowLeft' ? Math.max(0, index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? candidates.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); setSelected(next);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=radio]');
    buttons?.[next]?.focus();
  }
  return <div className="availability-scene" onPointerMove={move} onPointerLeave={reset}>
    <motion.div className="availability-object" style={{ rotateX: reduced ? 0 : rotateX, rotateY: reduced ? 0 : rotateY }}>
      <div className="together-photo"><Image src="/images/together.png" alt={t('朋友在咖啡桌旁相聚', 'Friends sharing coffee at a table')} fill sizes="(max-width: 767px) 92vw, 48vw" priority /></div>
      <section className="time-experiment" aria-label={t('邀約結果互動範例', 'Interactive invitation results example')}>
        <div className="experiment-heading"><span>{t('週五聚餐', 'Friday dinner')}</span><span>{t('範例', 'Example')}</span></div>
        <div className="reply-progress"><span>{t('回覆已收齊', 'Replies are in')}</span><span><Check size={14} aria-hidden="true"/>3/3 {t('已提交', 'submitted')}</span></div>
        <div className="candidate-options" role="radiogroup" aria-label={t('候選時間', 'Suggested times')}>
          {candidates.map((option, index) => <button key={option.time} type="button" role="radio" aria-checked={selected === index} tabIndex={selected === index ? 0 : -1} aria-label={option.time} className={selected === index ? 'is-selected' : ''} onClick={() => setSelected(index)} onFocus={() => setSelected(index)} onKeyDown={event => onKey(event, index)}><span>{t('選項', 'Option')} {index + 1}</span><strong>{option.time.split('–')[0]}</strong></button>)}
        </div>
        <div className="candidate-response" aria-live="polite" aria-atomic="true">
          <div className="candidate-caption">{t('週五 · 90 分鐘', 'Friday · 90 min')}</div><div className="experiment-result"><strong>{candidate.time}</strong><span className={count === 3 ? 'everyone' : ''}>{count === 3 ? t('全員可約', 'Works for everyone') : candidate.statuses.some(status => status === 'unavailable') ? t('有人無法出席', 'One person unavailable') : t('一人待確認', 'One tentative')}</span></div>
          <ul className="candidate-people">
            {candidate.statuses.map((status, index) => <li key={names[index]}><span className="candidate-person"><span className="person-initial" aria-hidden="true">{names[index].slice(0,1)}</span>{names[index]}</span><span className={status === 'available' ? 'everyone' : ''}>{status === 'available' ? <Check size={14} aria-hidden="true"/> : status === 'tentative' ? <Clock3 size={14} aria-hidden="true"/> : <Minus size={14} aria-hidden="true"/>}{status === 'available' ? t('可以', 'Available') : status === 'tentative' ? t('待確認', 'Tentative') : t('不行', 'Unavailable')}</span></li>)}
          </ul>
        </div>
        <div className="calendar-private"><LockKeyhole size={13} aria-hidden="true"/>{t('日曆僅本人可見', 'Calendars stay private')}</div>
      </section>
    </motion.div>
  </div>;
});
