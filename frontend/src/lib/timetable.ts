/** Timetable types (mirror of the /timetable API) and pure helpers for the editor. */

export type ConflictKind = "TEACHER" | "ROOM" | "CLASS" | "INVALID" | "OUTSIDE_HOURS" | "CLOSED_DAY" | "BREAK";

export interface Conflict {
  kind: ConflictKind;
  severity: "error" | "warning";
  sessionId?: string;
  otherSessionId?: string;
  message: string;
}

export interface TimetableSettings {
  days: number[];
  start: string;
  end: string;
  breaks: { start: string; end: string }[];
  slotMinutes: number;
  /** "3:PM,6:AM" — free half-days */
  freeHalfDays?: string;
  halfDaySplit?: string;
  maxClassHoursPerDay?: number | null;
  maxTeacherHoursPerDay?: number | null;
}

export interface Qualification {
  teacherId: string;
  subjectId: string;
  level: string;
  classId: string | null;
}

export interface PlanningInfo {
  qualifications: Qualification[];
  /** teacherId → merged availability windows (absent = no restriction) */
  availability: Record<string, { day: number; start: string; end: string }[]>;
  volumes: { level: string; subjectId: string; minutesPerWeek: number; maxSessionMinutes: number | null; coefficient: number | null }[];
}

/** One rule of the shared server-side validation (✅ / ❌ / not applicable). */
export interface Check {
  id: "GRID" | "QUALIFIED" | "AVAILABLE" | "TEACHER_FREE" | "CLASS_FREE" | "ROOM" | "CLASS_VOLUME" | "TEACHER_MAX" | "DAY_MAX";
  status: "ok" | "fail" | "na";
  label: string;
  detail?: string;
}

export interface SoftWarning {
  id: string;
  message: string;
}

export interface LessonReport {
  ok: boolean;
  checks: Check[];
  warnings: SoftWarning[];
}

export interface FormOptions {
  teachers: { id: string; name: string; qualified: boolean; free: boolean | null; loadHours: number; maxHours: number | null }[];
  rooms: { id: string; name: string; suitable: boolean; free: boolean | null; reason: string | null }[];
  freeSlots: { dayOfWeek: number; startTime: string; endTime: string }[];
  volume: { officialHours: number; plannedHours: number; maxSessionHours: number | null } | null;
}

export interface Suggestions {
  slots: { dayOfWeek: number; startTime: string; endTime: string; warnings: number }[];
  teachers: Ref[];
  rooms: Ref[];
}

export interface Ref {
  id: string;
  name: string;
}

export interface Session {
  id: string;
  classId: string;
  subjectId: string | null;
  teacherId: string | null;
  roomId: string | null;
  termId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
  notes: string | null;
  importId: string | null;
  locked?: boolean;
  class: Ref & { level: string };
  subject: (Ref & { code: string; color: string | null }) | null;
  teacher: Ref | null;
  room: Ref | null;
  term: Ref | null;
  conflicts: Conflict[];
}

export interface Resources {
  academicYear: Ref;
  classes: (Ref & { level: string; studentCount: number })[];
  subjects: (Ref & { code: string; color: string | null })[];
  teachers: (Ref & { position: string; matricule?: string | null; weeklyMaxMinutes?: number | null })[];
  rooms: (Ref & { type: string | null; capacity: number | null; building: string | null; subjectIds?: string[] })[];
  terms: (Ref & { order: number })[];
  settings: TimetableSettings;
  planning?: PlanningInfo;
  me: { role: string; teacherId: string | null };
}

/** Free half-days of the grid as a set of "day:AM|PM". */
export function parseHalfDays(value: string | null | undefined): { day: number; half: "AM" | "PM" }[] {
  return (value ?? "")
    .split(",")
    .map((p) => p.trim().toUpperCase().split(":"))
    .filter(([d, h]) => Number(d) >= 1 && Number(d) <= 7 && (h === "AM" || h === "PM"))
    .map(([d, h]) => ({ day: Number(d), half: h as "AM" | "PM" }));
}

/**
 * Quick client-side pre-checks for the lesson form (instant feedback while the server check runs).
 * The server stays the authority: it applies the same rules and refuses what breaks them.
 */
export function clientChecks(
  d: { classId: string; subjectId: string; teacherId: string; dayOfWeek: number; startTime: string; endTime: string },
  resources: Resources,
): { id: Check["id"]; message: string }[] {
  const issues: { id: Check["id"]; message: string }[] = [];
  const s = resources.settings;
  if (!/^\d{2}:\d{2}$/.test(d.startTime) || !/^\d{2}:\d{2}$/.test(d.endTime) || d.startTime >= d.endTime) {
    return [{ id: "GRID", message: "L'heure de fin doit être après l'heure de début" }];
  }
  if (s.days.length && !s.days.includes(d.dayOfWeek)) issues.push({ id: "GRID", message: `${DAY_NAMES[d.dayOfWeek]} n'est pas un jour de cours` });
  if (d.startTime < s.start || d.endTime > s.end) issues.push({ id: "GRID", message: `En dehors de la journée (${s.start}–${s.end})` });
  for (const b of s.breaks) if (d.startTime < b.end && b.start < d.endTime) issues.push({ id: "GRID", message: `Empiète sur la pause ${b.start}–${b.end}` });
  const split = s.halfDaySplit ?? "12:00";
  for (const h of parseHalfDays(s.freeHalfDays)) {
    if (h.day !== d.dayOfWeek) continue;
    const [a, b] = h.half === "AM" ? [s.start, split] : [split, s.end];
    if (d.startTime < b && a < d.endTime) issues.push({ id: "GRID", message: `${DAY_NAMES[d.dayOfWeek]} ${h.half === "AM" ? "matin" : "après-midi"} est libre` });
  }
  const planning = resources.planning;
  const klass = resources.classes.find((c) => c.id === d.classId);
  if (planning && d.teacherId && d.subjectId && klass) {
    const qualified = planning.qualifications.some((q) => q.teacherId === d.teacherId && q.subjectId === d.subjectId && (q.classId ? q.classId === d.classId : q.level === klass.level));
    if (!qualified) issues.push({ id: "QUALIFIED", message: "Ce professeur n'est pas habilité pour cette matière à ce niveau" });
  }
  if (planning && d.teacherId) {
    const windows = planning.availability[d.teacherId];
    if (windows?.length && !windows.some((w) => w.day === d.dayOfWeek && w.start <= d.startTime && w.end >= d.endTime)) {
      issues.push({ id: "AVAILABLE", message: "Le professeur n'est pas disponible sur ce créneau" });
    }
  }
  return issues;
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours + 1e-9);
  const m = Math.round((hours - h) * 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export type ViewMode = "class" | "teacher" | "room";

export const DAY_NAMES = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const DAY_SHORT = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const EDITOR_ROLES = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR", "SECRETARY"];

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function snap(minutes: number, step: number): number {
  return Math.round(minutes / step) * step;
}

export function durationLabel(start: string, end: string): string {
  const d = toMinutes(end) - toMinutes(start);
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

// A palette readable with dark text on its light tint and as a solid left border.
const PALETTE = ["#3d5a80", "#a1472a", "#5b4a8b", "#4f6141", "#b07a12", "#2f7a78", "#9e2b4f", "#3c6e9e", "#7a6a2e", "#8a4f7d", "#2e6b4f", "#b85c1e"];

/** Subject colour: the one chosen by the school, else a stable colour derived from the name. */
export function subjectColor(subject: { name: string; color?: string | null } | null | undefined, fallbackKey = ""): string {
  if (subject?.color && /^#[0-9a-f]{6}$/i.test(subject.color)) return subject.color;
  const key = subject?.name ?? fallbackKey;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function hasBlocking(conflicts: Conflict[] | undefined): boolean {
  return !!conflicts?.some((c) => c.severity === "error");
}

/**
 * Side-by-side layout of overlapping lessons in one day column: each session gets a lane index and
 * the number of lanes of its overlap cluster (like calendar apps do).
 */
export function layoutDay<T extends { id: string; startTime: string; endTime: string }>(items: T[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime) || b.endTime.localeCompare(a.endTime));
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: T[] = [];
  let clusterEnd = "";
  let laneEnds: string[] = [];

  const flush = () => {
    for (const item of cluster) result.get(item.id)!.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
    clusterEnd = "";
  };

  for (const item of sorted) {
    if (cluster.length && item.startTime >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startTime);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.endTime);
    } else laneEnds[lane] = item.endTime;
    result.set(item.id, { lane, lanes: 1 });
    cluster.push(item);
    if (item.endTime > clusterEnd) clusterEnd = item.endTime;
  }
  flush();
  return result;
}

/** Days shown by the grid: the school's open days plus any day that still has sessions. */
export function visibleDays(settings: TimetableSettings, sessions: { dayOfWeek: number }[]): number[] {
  const days = new Set(settings.days.length ? settings.days : [1, 2, 3, 4, 5]);
  for (const s of sessions) days.add(s.dayOfWeek);
  return [...days].sort((a, b) => a - b);
}

/** Grid bounds: school hours, widened to whole hours and to any session outside them. */
export function gridBounds(settings: TimetableSettings, sessions: { startTime: string; endTime: string }[]): { start: number; end: number } {
  let start = toMinutes(settings.start);
  let end = toMinutes(settings.end);
  for (const s of sessions) {
    start = Math.min(start, toMinutes(s.startTime));
    end = Math.max(end, toMinutes(s.endTime));
  }
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}

export function sessionTitle(s: Pick<Session, "subject" | "label">): string {
  return s.subject?.name ?? s.label ?? "Séance";
}

/** Secondary line of a card: what is not already implied by the current view. */
export function sessionDetails(
  s: { class: { name: string }; teacher: { name: string } | null; room: { name: string } | null },
  view: ViewMode,
): string[] {
  const parts: (string | undefined)[] =
    view === "class" ? [s.teacher?.name, s.room?.name] : view === "teacher" ? [s.class.name, s.room?.name] : [s.class.name, s.teacher?.name];
  return parts.filter((p): p is string => !!p);
}
