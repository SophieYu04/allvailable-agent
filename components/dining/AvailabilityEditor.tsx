"use client";

import { Fragment, useRef, useState, type PointerEvent } from "react";
import { dateList, timeList } from "@/lib/calendar/slots";
import type { Cells, SlotStatus } from "@/lib/calendar/types";
import { useLanguage } from "./Language";
import "./availability-entry.css";

export default function AvailabilityEditor({ cells, savedCells, onChange, dateStart, dateEnd, dailyStart, dailyEnd, showRange = true, disabled = false }: {
  cells: Cells; savedCells?: Cells; onChange: (cells: Cells) => void; dateStart: string; dateEnd: string;
  dailyStart: string; dailyEnd: string; showRange?: boolean; disabled?: boolean;
}) {
  const { t, language } = useLanguage();
  const dates = dateList(dateStart, dateEnd);
  const times = timeList(dailyStart.slice(0, 5), dailyEnd.slice(0, 5));
  const [brush, setBrush] = useState<SlotStatus>("green");
  const [selectedDate, setSelectedDate] = useState(dateStart);
  const [rangeStart, setRangeStart] = useState(dailyStart.slice(0, 5));
  const [rangeEnd, setRangeEnd] = useState(dailyEnd.slice(0, 5));
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
  }
  const pointerHandled = useRef(false);
  const drag = useRef<{ date: string; start: number; base: Cells; status: SlotStatus } | null>(null);
  const labels: Record<SlotStatus, string> = { green: t("可以", "Available"), yellow: t("可能有事", "Tentative"), red: t("忙碌", "Busy"), unknown: t("未填", "Not marked") };
  function paint(base: Cells, date: string, first: number, last: number, status: SlotStatus) {
    return { ...base, ...Object.fromEntries(times.slice(Math.min(first, last), Math.max(first, last) + 1).map(time => [date + "-" + time, status])) };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || disabled) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-slot]");
    if (!target || !event.currentTarget.contains(target) || target.dataset.date !== drag.current.date) return;
    onChange(paint(drag.current.base, drag.current.date, drag.current.start, Number(target.dataset.slot), drag.current.status));
  }
  function finish(cancel = false) {
    if (cancel && drag.current) { onChange(drag.current.base); pointerHandled.current = false; }
    drag.current = null;
  }
  return <section className="availability-editor timetable-editor" aria-label={t("我的時間", "My availability")}>
    {showRange && <div className="availability-range-entry">
      <div className="availability-entry-heading"><h3>{t('新增一段時間', 'Add a time range')}</h3><span>{t('台北時間', 'Taipei time')}</span></div>
      <div className="availability-range-fields">
        <label className="availability-day-field">{t('日期', 'Day')}<select disabled={disabled} value={activeDate} onChange={event => { setSelectedDate(event.target.value); }}>{dates.map(date => <option key={date} value={date}>{dayLabel(date)}</option>)}</select></label>
        <label>{t('從', 'From')}<select disabled={disabled} value={from} onChange={event => { setRangeStart(event.target.value); }}>{times.map(time => <option key={time} value={time}>{time}</option>)}</select></label>
        <label>{t('到', 'Until')}<select disabled={disabled} value={until} onChange={event => { setRangeEnd(event.target.value); }}>{endTimes.map(time => <option key={time} value={time}>{time}</option>)}</select></label>
      </div>
      {!validRange && <p className="availability-range-error" role="alert">{t('結束時間須晚於開始時間。', 'End time must be after start time.')}</p>}
      <button type="button" className="availability-apply" disabled={disabled || !validRange} onClick={applyRange}>{t('新增這段時間', 'Add time range')}</button>
    </div>}
    <div className="availability-grid-heading"><h3>{t('檢查我的時間', 'Review my times')}</h3></div>
    <div className="timetable-palette" role="group" aria-label={t("這段時間的狀態", "Availability for this range")}>
      {(["green", "yellow", "red"] as const).map(status => <button type="button" key={status} className={"timetable-swatch status-" + status} disabled={disabled} aria-label={labels[status]} aria-pressed={brush === status} onClick={() => setBrush(status)}><span className="swatch-dot" aria-hidden="true"/><span>{labels[status]}</span></button>)}
    </div>
    <div className="timetable-scroll">
      <div className="timetable" style={{ gridTemplateColumns: `52px repeat(${dates.length}, minmax(88px, 1fr))` }} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()}>
        <span className="timetable-corner"/>{dates.map(date => <div className="timetable-date" key={date}>{dayLabel(date)}</div>)}
        {times.map((time, index) => <Fragment key={time}>
          <span className="timetable-time">{time}</span>
          {dates.map(date => { const status = cells[date + "-" + time] ?? "unknown"; return <button type="button" key={date} data-slot={index} data-date={date} className={"timetable-cell status-" + status + (savedCells && status !== (savedCells[date + "-" + time] ?? "unknown") ? " is-unsaved" : "")} disabled={disabled}
            aria-label={dayLabel(date) + " " + time + "-" + (times[index + 1] ?? dailyEnd.slice(0, 5)) + ", " + (status === "unknown" ? t("未填", "Not marked") : labels[status])}
            onPointerDown={event => {
              if (disabled || event.button !== 0 || event.pointerType === "touch") return;
              pointerHandled.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              const nextStatus = status === "unknown" ? brush : "unknown";
              drag.current = { date, start: index, base: cells, status: nextStatus };
              onChange(paint(cells, date, index, index, nextStatus));
            }}
            onClick={() => { if (!disabled && !pointerHandled.current) onChange(paint(cells, date, index, index, status === "unknown" ? brush : "unknown")); pointerHandled.current = false; }}/>; })}
        </Fragment>)}
        <span className="timetable-time timetable-end">{dailyEnd.slice(0, 5)}</span>
      </div>
    </div>
  </section>;
}
