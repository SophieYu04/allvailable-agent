"use client";

import { useRef, useState, type PointerEvent } from "react";
import { dateList, timeList } from "@/lib/calendar/slots";
import type { Cells, SlotStatus } from "@/lib/calendar/types";
import { useLanguage } from "./Language";
import "./availability-entry.css";

export default function AvailabilityEditor({ cells, onChange, dateStart, dateEnd, dailyStart, dailyEnd, disabled = false }: {
  cells: Cells; onChange: (cells: Cells) => void; dateStart: string; dateEnd: string;
  dailyStart: string; dailyEnd: string; disabled?: boolean;
}) {
  const { t, language } = useLanguage();
  const dates = dateList(dateStart, dateEnd);
  const times = timeList(dailyStart.slice(0, 5), dailyEnd.slice(0, 5));
  const [brush, setBrush] = useState<SlotStatus>("green");
  const [selectedDate, setSelectedDate] = useState(dateStart);
  const [rangeStart, setRangeStart] = useState(dailyStart.slice(0, 5));
  const [rangeEnd, setRangeEnd] = useState(dailyEnd.slice(0, 5));
  const [notice, setNotice] = useState("");
  const activeDate = dates.includes(selectedDate) ? selectedDate : dateStart;
  const endTimes = [...times.slice(1), dailyEnd.slice(0, 5)];
  const from = times.includes(rangeStart) ? rangeStart : times[0];
  const until = endTimes.includes(rangeEnd) ? rangeEnd : dailyEnd.slice(0, 5);
  const validRange = Boolean(from && until && until > from);
  const dayLabel = (date: string) => new Intl.DateTimeFormat(language === 'zh' ? 'zh-TW' : 'en-GB', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
  function applyRange() {
    if (disabled || !validRange || !dates.includes(activeDate)) return;
    const selectedTimes = times.filter(time => time >= from && time < until);
    onChange({ ...cells, ...Object.fromEntries(selectedTimes.map(time => [activeDate + '-' + time, brush])) });
    setNotice(`${dayLabel(activeDate)} · ${from}-${until} · ${labels[brush]} · ${t('已加入草稿', 'Added to draft')}`);
  }
  const pointerHandled = useRef(false);
  const drag = useRef<{ date: string; start: number; base: Cells } | null>(null);
  const labels: Record<SlotStatus, string> = { green: t("可以", "Available"), yellow: t("可能有事", "Tentative"), red: t("不行", "Unavailable"), unknown: t("清除", "Erase") };
  function paint(base: Cells, date: string, first: number, last: number) {
    return { ...base, ...Object.fromEntries(times.slice(Math.min(first, last), Math.max(first, last) + 1).map(time => [date + "-" + time, brush])) };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || disabled) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-slot]");
    if (!target || !event.currentTarget.contains(target) || target.dataset.date !== drag.current.date) return;
    onChange(paint(drag.current.base, drag.current.date, drag.current.start, Number(target.dataset.slot)));
  }
  function finish(cancel = false) {
    if (cancel && drag.current) onChange(drag.current.base);
    drag.current = null;
  }
  return <section className="availability-editor timetable-editor" aria-label={t("我的時間", "My availability")}>
    <div className="availability-range-entry">
      <div className="availability-entry-heading"><h3>{t('新增一段時間', 'Add a time range')}</h3><span>{t('台北時間', 'Taipei time')}</span></div>
      <div className="availability-range-fields">
        <label className="availability-day-field">{t('日期', 'Day')}<select disabled={disabled} value={activeDate} onChange={event => { setSelectedDate(event.target.value); setNotice(''); }}>{dates.map(date => <option key={date} value={date}>{dayLabel(date)}</option>)}</select></label>
        <label>{t('從', 'From')}<select disabled={disabled} value={from} onChange={event => { setRangeStart(event.target.value); setNotice(''); }}>{times.map(time => <option key={time} value={time}>{time}</option>)}</select></label>
        <label>{t('到', 'Until')}<select disabled={disabled} value={until} onChange={event => { setRangeEnd(event.target.value); setNotice(''); }}>{endTimes.map(time => <option key={time} value={time}>{time}</option>)}</select></label>
      </div>
    <div className="timetable-palette" role="group" aria-label={t("這段時間的狀態", "Availability for this range")}>
      {(Object.keys(labels) as SlotStatus[]).map(status => <button type="button" key={status} className={"timetable-swatch status-" + status} disabled={disabled} aria-label={labels[status]} aria-pressed={brush === status} onClick={() => setBrush(status)}><span className="swatch-dot" aria-hidden="true"/><span>{labels[status]}</span></button>)}
    </div>
      {!validRange && <p className="availability-range-error" role="alert">{t('結束時間須晚於開始時間。', 'End time must be after start time.')}</p>}
      <button type="button" className="availability-apply" disabled={disabled || !validRange} onClick={applyRange}>{t('套用到這一天', 'Apply to this day')}</button>
      <p className="availability-entry-notice" role="status">{notice || t('加入後可在下方檢查，再提交。', 'Review below, then submit your reply.')}</p>
    </div>
    <div className="availability-grid-heading"><h3>{t('檢查我的時間', 'Review my times')}</h3><p>{t('點選或拖曳格子，套用上方狀態。', 'Tap or drag slots to apply the status above.')}</p></div>
    <div className="timetable-scroll">
      <div className="timetable" style={{ gridTemplateColumns: `52px repeat(${dates.length}, minmax(72px, 1fr))` }} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()}>
        <span/>{dates.map(date => <div className="timetable-date" key={date}>{dayLabel(date)}</div>)}
        {times.map((time, index) => <div className="timetable-row" key={time}>
          <span className="timetable-time">{time}</span>
          {dates.map(date => { const status = cells[date + "-" + time] ?? "unknown"; return <button type="button" key={date} data-slot={index} data-date={date} className={"timetable-cell status-" + status} disabled={disabled}
            aria-label={dayLabel(date) + " " + time + "-" + (times[index + 1] ?? dailyEnd.slice(0, 5)) + ", " + (status === "unknown" ? t("未填", "Not marked") : labels[status])}
            onPointerDown={event => {
              if (disabled || event.button !== 0) return;
              pointerHandled.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { date, start: index, base: cells };
              onChange(paint(cells, date, index, index));
            }}
            onClick={event => { if (!disabled && (event.detail === 0 || !pointerHandled.current)) onChange(paint(cells, date, index, index)); pointerHandled.current = false; }}/>; })}
        </div>)}
        <span className="timetable-time timetable-end">{dailyEnd.slice(0, 5)}</span>
      </div>
    </div>
  </section>;
}
