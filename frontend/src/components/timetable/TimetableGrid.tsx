"use client";

import { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Conflict,
  DAY_NAMES,
  DAY_SHORT,
  TimetableSettings,
  ViewMode,
  durationLabel,
  fromMinutes,
  hasBlocking,
  layoutDay,
  sessionDetails,
  snap,
  subjectColor,
  toMinutes,
} from "../../lib/timetable";
import "./timetable.css";

/** What the grid needs to draw a lesson (stored sessions and import previews alike). */
export interface GridSession {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: { name: string; color?: string | null } | null;
  label?: string | null;
  class: { name: string };
  teacher: { name: string } | null;
  room: { name: string } | null;
  conflicts?: Conflict[];
}

export interface SlotChange {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface Props<T extends GridSession> {
  days: number[];
  bounds: { start: number; end: number };
  settings: TimetableSettings;
  sessions: T[];
  view: ViewMode;
  editable?: boolean;
  highlightId?: string | null;
  pxPerMinute?: number;
  onSlotClick?: (day: number, time: string) => void;
  onSessionClick?: (session: T) => void;
  onSessionChange?: (session: T, change: SlotChange) => void;
}

interface DragState {
  id: string;
  mode: "move" | "resize";
  pointerId: number;
  originX: number;
  originY: number;
  originDay: number;
  originStart: number;
  originEnd: number;
  active: boolean;
  day: number;
  start: number;
  end: number;
}

const DRAG_THRESHOLD = 4;

export default function TimetableGrid<T extends GridSession>({
  days,
  bounds,
  settings,
  sessions,
  view,
  editable = false,
  highlightId,
  pxPerMinute = 1.15,
  onSlotClick,
  onSessionClick,
  onSessionChange,
}: Props<T>) {
  const columnsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClick = useRef(false);
  const step = Math.max(5, settings.slotMinutes || 30);
  const height = (bounds.end - bounds.start) * pxPerMinute;
  const y = (minutes: number) => (minutes - bounds.start) * pxPerMinute;

  const byDay = useMemo(() => {
    const map = new Map<number, T[]>();
    for (const d of days) map.set(d, []);
    for (const s of sessions) map.get(s.dayOfWeek)?.push(s);
    return map;
  }, [sessions, days]);
  const layouts = useMemo(() => {
    const map = new Map<number, Map<string, { lane: number; lanes: number }>>();
    for (const [d, list] of byDay) map.set(d, layoutDay(list));
    return map;
  }, [byDay]);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let m = bounds.start; m <= bounds.end; m += 60) list.push(m);
    return list;
  }, [bounds]);

  // Current time marker on today's column.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const today = now ? ((now.getDay() + 6) % 7) + 1 : null;
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : null;

  // ---------------------------------------------------------------- drag & resize (mouse / pen)

  const startDrag = (e: ReactPointerEvent, session: T, mode: DragState["mode"]) => {
    if (!editable || !onSessionChange || e.button !== 0 || e.pointerType === "touch") return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);
    setDrag({
      id: session.id,
      mode,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      originDay: session.dayOfWeek,
      originStart: start,
      originEnd: end,
      active: false,
      day: session.dayOfWeek,
      start,
      end,
    });
  };

  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.originX;
    const dy = e.clientY - drag.originY;
    if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    const delta = snap(dy / pxPerMinute, step);
    if (drag.mode === "resize") {
      const end = Math.min(bounds.end, Math.max(drag.originStart + step, drag.originEnd + delta));
      setDrag({ ...drag, active: true, end });
      return;
    }
    const duration = drag.originEnd - drag.originStart;
    const start = Math.min(bounds.end - duration, Math.max(bounds.start, drag.originStart + delta));
    let day = drag.day;
    const rect = columnsRef.current?.getBoundingClientRect();
    if (rect && days.length > 1) {
      const index = Math.min(days.length - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * days.length)));
      day = days[index];
    }
    setDrag({ ...drag, active: true, day, start, end: start + duration });
  };

  const endDrag = (e: ReactPointerEvent, session: T) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const current = drag;
    setDrag(null);
    if (!current.active) return; // a plain click: handled by onClick
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    if (current.day !== current.originDay || current.start !== current.originStart || current.end !== current.originEnd) {
      onSessionChange?.(session, { dayOfWeek: current.day, startTime: fromMinutes(current.start), endTime: fromMinutes(current.end) });
    }
  };

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drag]);

  // Keyboard alternative to drag & drop: Alt+↑/↓ moves by one step, Alt+←/→ changes day, Alt+Shift+↑/↓ resizes.
  const onCardKeyDown = (e: ReactKeyboardEvent, session: T) => {
    if (!editable || !onSessionChange || !e.altKey) return;
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);
    const dayIndex = days.indexOf(session.dayOfWeek);
    let change: SlotChange | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const d = e.key === "ArrowUp" ? -step : step;
      if (e.shiftKey) {
        const newEnd = end + d;
        if (newEnd > start && newEnd <= bounds.end) change = { dayOfWeek: session.dayOfWeek, startTime: session.startTime, endTime: fromMinutes(newEnd) };
      } else if (start + d >= bounds.start && end + d <= bounds.end) {
        change = { dayOfWeek: session.dayOfWeek, startTime: fromMinutes(start + d), endTime: fromMinutes(end + d) };
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const next = days[dayIndex + (e.key === "ArrowLeft" ? -1 : 1)];
      if (next) change = { dayOfWeek: next, startTime: session.startTime, endTime: session.endTime };
    }
    if (change) {
      e.preventDefault();
      onSessionChange(session, change);
    }
  };

  const onColumnClick = (e: React.MouseEvent<HTMLDivElement>, day: number) => {
    if (!editable || !onSlotClick || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = bounds.start + Math.floor((e.clientY - rect.top) / pxPerMinute / step) * step;
    onSlotClick(day, fromMinutes(Math.min(minutes, bounds.end - step)));
  };

  const draggedSession = drag?.active ? sessions.find((s) => s.id === drag.id) : undefined;

  return (
    <div className={`tt-grid${editable ? " is-editable" : ""}${drag?.active ? " is-dragging" : ""}`} style={{ ["--days" as string]: days.length }}>
      <div className="tt-head" aria-hidden="true">
        <div className="tt-gutter-head" />
        {days.map((d) => (
          <div key={d} className={`tt-day-head${d === today ? " is-today" : ""}`}>
            <span className="tt-day-long">{DAY_NAMES[d]}</span>
            <span className="tt-day-short">{DAY_SHORT[d]}</span>
            <span className="tt-day-count">{byDay.get(d)?.length || ""}</span>
          </div>
        ))}
      </div>
      <div className="tt-body" style={{ height }}>
        <div className="tt-gutter" aria-hidden="true">
          {hours.map((m) => (
            <span key={m} className="tt-hour" style={{ top: y(m) }}>
              {fromMinutes(m)}
            </span>
          ))}
        </div>
        <div className="tt-columns" ref={columnsRef}>
          {hours.map((m) => (
            <div key={m} className="tt-hline" style={{ top: y(m) }} aria-hidden="true" />
          ))}
          {days.map((day) => {
            const layout = layouts.get(day)!;
            const list = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                className={`tt-column${day === today ? " is-today" : ""}`}
                role="group"
                aria-label={`${DAY_NAMES[day]} : ${list.length} séance(s)`}
                onClick={(e) => onColumnClick(e, day)}
              >
                {settings.breaks.map((b) => {
                  const s = Math.max(toMinutes(b.start), bounds.start);
                  const e = Math.min(toMinutes(b.end), bounds.end);
                  return e > s ? (
                    <div key={b.start} className="tt-break" style={{ top: y(s), height: (e - s) * pxPerMinute }} aria-hidden="true">
                      <span>Pause</span>
                    </div>
                  ) : null;
                })}
                {day === today && nowMinutes !== null && nowMinutes > bounds.start && nowMinutes < bounds.end && (
                  <div className="tt-now" style={{ top: y(nowMinutes) }} aria-hidden="true" />
                )}
                {list.map((s) => {
                  const isDragged = drag?.active && drag.id === s.id;
                  const pos = layout.get(s.id) ?? { lane: 0, lanes: 1 };
                  const start = toMinutes(s.startTime);
                  const end = toMinutes(s.endTime);
                  const blocking = hasBlocking(s.conflicts);
                  const warning = !blocking && !!s.conflicts?.length;
                  const title = s.subject?.name ?? s.label ?? "Séance";
                  const details = sessionDetails(s, view);
                  const tall = (end - start) * pxPerMinute >= 54;
                  const tooltip = [
                    `${title} — ${DAY_NAMES[s.dayOfWeek]} ${s.startTime}–${s.endTime} (${durationLabel(s.startTime, s.endTime)})`,
                    [s.class.name, s.teacher?.name, s.room?.name].filter(Boolean).join(" · "),
                    ...(s.conflicts ?? []).map((c) => `${c.severity === "error" ? "⛔" : "⚠"} ${c.message}`),
                  ].join("\n");
                  return (
                    <button
                      type="button"
                      key={s.id}
                      data-session={s.id}
                      className={`tt-session${blocking ? " has-conflict" : ""}${warning ? " has-warning" : ""}${isDragged ? " is-ghost" : ""}${
                        highlightId === s.id ? " is-highlight" : ""
                      }${tall ? "" : " is-compact"}`}
                      style={{
                        top: y(start),
                        height: Math.max((end - start) * pxPerMinute - 2, 18),
                        left: `calc(${(pos.lane / pos.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / pos.lanes}% - 4px)`,
                        ["--c" as string]: subjectColor(s.subject, title),
                      }}
                      title={tooltip}
                      aria-label={`${tooltip.replace(/\n/g, ". ")}${editable ? ". Alt + flèches pour déplacer." : ""}`}
                      onPointerDown={(e) => startDrag(e, s, "move")}
                      onPointerMove={moveDrag}
                      onPointerUp={(e) => endDrag(e, s)}
                      onPointerCancel={() => setDrag(null)}
                      onKeyDown={(e) => onCardKeyDown(e, s)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (suppressClick.current) return;
                        onSessionClick?.(s);
                      }}
                    >
                      <span className="tt-session-time">
                        {s.startTime}–{s.endTime}
                      </span>
                      <span className="tt-session-title">{title}</span>
                      {tall && details.length > 0 && <span className="tt-session-meta">{details.join(" · ")}</span>}
                      {(blocking || warning) && (
                        <span className="tt-session-flag" aria-hidden="true">
                          <AlertTriangle size={13} />
                        </span>
                      )}
                      {editable && onSessionChange && (
                        <span
                          className="tt-resize"
                          aria-hidden="true"
                          onPointerDown={(e) => startDrag(e, s, "resize")}
                          onPointerMove={moveDrag}
                          onPointerUp={(e) => endDrag(e, s)}
                        />
                      )}
                    </button>
                  );
                })}
                {draggedSession && drag && drag.day === day && (
                  <div
                    className="tt-session is-preview"
                    style={{
                      top: y(drag.start),
                      height: Math.max((drag.end - drag.start) * pxPerMinute - 2, 18),
                      left: 2,
                      width: "calc(100% - 4px)",
                      ["--c" as string]: subjectColor(draggedSession.subject, draggedSession.label ?? ""),
                    }}
                    aria-hidden="true"
                  >
                    <span className="tt-session-time">
                      {fromMinutes(drag.start)}–{fromMinutes(drag.end)}
                    </span>
                    <span className="tt-session-title">{draggedSession.subject?.name ?? draggedSession.label ?? "Séance"}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
