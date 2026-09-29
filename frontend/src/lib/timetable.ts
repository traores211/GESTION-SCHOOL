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
  teachers: (Ref & { position: string })[];
  rooms: (Ref & { type: string | null; capacity: number | null; building: string | null })[];
  terms: (Ref & { order: number })[];
  settings: TimetableSettings;
  me: { role: string; teacherId: string | null };
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
const PALETTE = ["#2563eb", "#db2777", "#7c3aed", "#059669", "#d97706", "#0891b2", "#dc2626", "#4f46e5", "#65a30d", "#c026d3", "#0d9488", "#ea580c"];

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
