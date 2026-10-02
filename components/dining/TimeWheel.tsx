"use client";
import { useId, useRef, useState } from 'react';
import { ChevronDown, Clock3 } from 'lucide-react';
import { useLanguage } from './Language';
import './time-picker.css';

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const minutes = ['00', '30'];

export default function TimeWheel({ label, value, onChange, allowMidnight = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowMidnight?: boolean;
}) {
  const { t } = useLanguage();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(value);
  const [hour, minute] = draft.split(':');
  const midnight = hour === '24';

  function close() {
    dialog.current?.close();
    trigger.current?.focus();
  }

  return <>
    <button ref={trigger} className="time-picker-trigger" type="button" aria-haspopup="dialog" aria-label={`${label}: ${value}. ${t('更改時間', 'Change time')}`} onClick={() => {
      setDraft(value);
      dialog.current?.showModal();
    }}>
      <span className="time-picker-label"><Clock3 size={17} aria-hidden="true" />{label}</span>
      <span className="time-picker-value"><strong>{value}</strong><ChevronDown size={18} aria-hidden="true" /></span>
    </button>
    <dialog className="time-picker-dialog" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-zone`} onClose={() => trigger.current?.focus()}>
      <header className="time-picker-header">
        <h3 id={`${id}-title`}>{label}</h3>
        <p id={`${id}-zone`}>{t('台灣時間 · 24 小時制', 'Taipei time · 24-hour clock')}</p>
      </header>
      <output className="time-picker-preview" aria-live="polite">{draft}</output>
      <div className="time-picker-controls">
        <label className="time-picker-hour" htmlFor={`${id}-hour`}>
          <span>{t('小時', 'Hour')}</span>
          <select id={`${id}-hour`} value={hour} onChange={event => {
            const nextHour = event.target.value;
            setDraft(`${nextHour}:${nextHour === '24' ? '00' : minute}`);
          }}>
            {hours.map(item => <option key={item} value={item}>{item}</option>)}
            {allowMidnight && <option value="24">24 · {t('午夜', 'Midnight')}</option>}
          </select>
        </label>
        <fieldset className="time-picker-minutes">
          <legend>{t('分鐘', 'Minute')}</legend>
          <div>
            {minutes.map(item => <button type="button" key={item} aria-pressed={minute === item} disabled={midnight && item === '30'} onClick={() => setDraft(`${hour}:${item}`)}>{item}</button>)}
          </div>
        </fieldset>
      </div>
      {midnight && <p className="time-picker-midnight-note">{t('當天結束時的午夜', 'Midnight at the end of this day')}</p>}
      <footer className="time-picker-actions">
        <button type="button" onClick={close}>{t('取消', 'Cancel')}</button>
        <button type="button" className="time-picker-done" onClick={() => { onChange(draft); close(); }}>{t('完成', 'Done')}</button>
      </footer>
    </dialog>
  </>;
}
