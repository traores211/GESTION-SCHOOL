import { DAY_NAMES, TIME_PATTERN, TimeRange, overlaps, toMinutes } from './time';

/** Minimal shape needed to reason about a lesson; works for stored sessions and for drafts. */
export interface SlotLike {
  id?: string;
  classId: string;
  teacherId?: string | null;
  roomId?: string | null;
  termId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface GridSettings {
  days: number[];
  start: string;
  end: string;
  breaks: TimeRange[];
}

export type ConflictKind = 'TEACHER' | 'ROOM' | 'CLASS' | 'INVALID' | 'OUTSIDE_HOURS' | 'CLOSED_DAY' | 'BREAK';

export interface Conflict {
  kind: ConflictKind;
  /** error = the slot cannot work as is; warning = unusual but possible (e.g. lesson during a break). */
  severity: 'error' | 'warning';
  sessionId?: string;
  otherSessionId?: string;
  message: string;
}

/** Names used to write readable messages ("M. Kouassi a déjà cours en 5ème A …"). */
export interface NameLookup {
  className(id: string): string;
  teacherName(id: string): string;
  roomName(id: string): string;
}

const MIN_DURATION = 5;

/** Checks a slot on its own: well-formed times, duration, open day, school hours, breaks. */
export function validateSlot(slot: SlotLike, settings?: GridSettings): Conflict[] {
  const issues: Conflict[] = [];
  const base = { sessionId: slot.id };
  if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 1 || slot.dayOfWeek > 7) {
    issues.push({ ...base, kind: 'INVALID', severity: 'error', message: 'Jour invalide' });
  }
  if (!TIME_PATTERN.test(slot.startTime) || !TIME_PATTERN.test(slot.endTime)) {
    issues.push({ ...base, kind: 'INVALID', severity: 'error', message: 'Horaire invalide (format attendu HH:MM)' });
    return issues;
  }
  if (slot.startTime >= slot.endTime) {
    issues.push({ ...base, kind: 'INVALID', severity: 'error', message: "L'heure de fin doit être après l'heure de début" });
    return issues;
  }
  if (toMinutes(slot.endTime) - toMinutes(slot.startTime) < MIN_DURATION) {
    issues.push({ ...base, kind: 'INVALID', severity: 'error', message: `Une séance doit durer au moins ${MIN_DURATION} minutes` });
  }
  if (!settings) return issues;
  if (settings.days.length && !settings.days.includes(slot.dayOfWeek)) {
    issues.push({
      ...base,
      kind: 'CLOSED_DAY',
      severity: 'warning',
      message: `${DAY_NAMES[slot.dayOfWeek] ?? 'Ce jour'} n'est pas un jour de cours de l'établissement`,
    });
  }
  if (slot.startTime < settings.start || slot.endTime > settings.end) {
    issues.push({
      ...base,
      kind: 'OUTSIDE_HOURS',
      severity: 'warning',
      message: `En dehors des horaires de l'établissement (${settings.start}–${settings.end})`,
    });
  }
  for (const pause of settings.breaks) {
    if (overlaps(slot.startTime, slot.endTime, pause.start, pause.end)) {
      issues.push({ ...base, kind: 'BREAK', severity: 'warning', message: `Empiète sur la pause ${pause.start}–${pause.end}` });
    }
  }
  return issues;
}

/** Two lessons can collide only if they happen in the same week: null term = all year. */
function sameTerm(a: SlotLike, b: SlotLike) {
  return !a.termId || !b.termId || a.termId === b.termId;
}

function clash(a: SlotLike, b: SlotLike) {
  return a.dayOfWeek === b.dayOfWeek && sameTerm(a, b) && overlaps(a.startTime, a.endTime, b.startTime, b.endTime);
}

/** Resource conflicts between `slot` and `others` (the slot itself, matched by id, is ignored). */
export function findConflicts(slot: SlotLike, others: SlotLike[], names: NameLookup): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const other of others) {
    if (slot.id && other.id === slot.id) continue;
    if (!clash(slot, other)) continue;
    const when = `${DAY_NAMES[other.dayOfWeek]} ${other.startTime}–${other.endTime}`;
    const ids = { sessionId: slot.id, otherSessionId: other.id };
    if (other.classId === slot.classId) {
      conflicts.push({ ...ids, kind: 'CLASS', severity: 'error', message: `${names.className(slot.classId)} a déjà une séance ${when}` });
    }
    if (slot.teacherId && other.teacherId === slot.teacherId) {
      conflicts.push({
        ...ids,
        kind: 'TEACHER',
        severity: 'error',
        message: `${names.teacherName(slot.teacherId)} enseigne déjà en ${names.className(other.classId)} ${when}`,
      });
    }
    if (slot.roomId && other.roomId === slot.roomId) {
      conflicts.push({
        ...ids,
        kind: 'ROOM',
        severity: 'error',
        message: `${names.roomName(slot.roomId)} est déjà occupée par ${names.className(other.classId)} ${when}`,
      });
    }
  }
  return conflicts;
}

/**
 * All conflicts of a whole timetable, keyed by session id. Sessions are grouped by day and scanned
 * in start order, so each session is only compared with the ones still running when it starts.
 */
export function detectAllConflicts(sessions: SlotLike[], names: NameLookup, settings?: GridSettings) {
  const result = new Map<string, Conflict[]>();
  const add = (id: string | undefined, c: Conflict) => {
    if (!id) return;
    const list = result.get(id) ?? [];
    list.push(c);
    result.set(id, list);
  };

  for (const s of sessions) validateSlot(s, settings).forEach((c) => add(s.id, c));

  const byDay = new Map<number, SlotLike[]>();
  for (const s of sessions) {
    if (!TIME_PATTERN.test(s.startTime) || !TIME_PATTERN.test(s.endTime) || s.startTime >= s.endTime) continue;
    byDay.set(s.dayOfWeek, [...(byDay.get(s.dayOfWeek) ?? []), s]);
  }
  for (const daySessions of byDay.values()) {
    daySessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const active: SlotLike[] = [];
    for (const current of daySessions) {
      for (let i = active.length - 1; i >= 0; i--) if (active[i].endTime <= current.startTime) active.splice(i, 1);
      for (const c of findConflicts(current, active, names)) {
        add(current.id, c);
        // Mirror the conflict on the other session so both are flagged in the editor.
        const other = active.find((a) => a.id === c.otherSessionId);
        if (other) add(other.id, { ...c, sessionId: other.id, otherSessionId: current.id, message: mirrorMessage(c, current, names) });
      }
      active.push(current);
    }
  }
  return result;
}

function mirrorMessage(c: Conflict, current: SlotLike, names: NameLookup) {
  const when = `${DAY_NAMES[current.dayOfWeek]} ${current.startTime}–${current.endTime}`;
  switch (c.kind) {
    case 'CLASS':
      return `${names.className(current.classId)} a déjà une séance ${when}`;
    case 'TEACHER':
      return `${names.teacherName(current.teacherId!)} enseigne déjà en ${names.className(current.classId)} ${when}`;
    case 'ROOM':
      return `${names.roomName(current.roomId!)} est déjà occupée par ${names.className(current.classId)} ${when}`;
    default:
      return c.message;
  }
}

export function hasBlockingConflict(conflicts: Conflict[]) {
  return conflicts.some((c) => c.severity === 'error');
}
