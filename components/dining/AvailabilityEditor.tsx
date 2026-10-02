"use client";

import { useRef, useState, type PointerEvent } from "react";
import { dateList, timeList } from "@/lib/calendar/slots";
import type { Cells, SlotStatus } from "@/lib/calendar/types";
import { useLanguage } from "./Language";

export default function AvailabilityEditor({ cells, onChange, dateStart, dateEnd, dailyStart, dailyEnd, disabled = false }: {
  cells: Cells; onChange: (cells: Cells) => void; dateStart: string; dateEnd: string;
  dailyStart: string; dailyEnd: string; disabled?: boolean;
}) {
  const { t } = useLanguage();
  const dates = dateList(dateStart, dateEnd);
  const times = timeList(dailyStart.slice(0, 5), dailyEnd.slice(0, 5));
  const [brush, setBrush] = useState<SlotStatus>("green");
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
    <div className="timetable-palette" aria-label={t("選擇填色", "Choose a color")}>
      {(Object.keys(labels) as SlotStatus[]).map(status => <button type="button" key={status} className={"timetable-swatch status-" + status} disabled={disabled} aria-label={labels[status]} aria-pressed={brush === status} onClick={() => setBrush(status)}><span className="swatch-dot" aria-hidden="true"/><span>{labels[status]}</span></button>)}
    </div>
    <div className="timetable-scroll">
      <div className="timetable" style={{ gridTemplateColumns: `52px repeat(${dates.length}, minmax(72px, 1fr))` }} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()}>
        <span/>{dates.map(date => <div className="timetable-date" key={date}>{date.slice(5).replace('-', '/')}</div>)}
        {times.map((time, index) => <div className="timetable-row" key={time}>
          <span className="timetable-time">{time}</span>
          {dates.map(date => { const status = cells[date + "-" + time] ?? "unknown"; return <button type="button" key={date} data-slot={index} data-date={date} className={"timetable-cell status-" + status} disabled={disabled}
            aria-label={date + " " + time + ", " + labels[status]}
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
