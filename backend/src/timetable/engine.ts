/**
 * Timetable engine — pure functions, no I/O (unit-tested in engine.spec.ts).
 *
 * The generator is deterministic (greedy placement + bounded backtracking). An LLM never
 * places lessons itself: it may only translate natural-language constraints into the
 * `TimetableConstraints` below. Whatever produced a timetable, `validate()` checks it.
 */

export interface Grid {
  days: number[]; // 1 = Monday ... 6 = Saturday
  periodsPerDay: number;
}

export interface Demand {
  subjectId: string;
  teacherId: string | null;
  hours: number; // periods per week
}

export interface ClassDemand {
  classId: string;
  demands: Demand[];
}

export interface Entry {
  classId: string;
  day: number;
  period: number;
  subjectId: string;
  teacherId: string | null;
  roomId: string | null;
}

export interface TimetableConstraints {
  /** Max periods of the same subject for a class on one day (default 2). */
  maxPerDayPerSubject?: number;
  /** Periods no lesson may use (e.g. Wednesday afternoon): [{ day, period }]. */
  blockedSlots?: { day: number; period: number }[];
  /** Subjects that should not be taught at these periods (e.g. EPS not after period 6). */
  avoid?: { subjectId: string; periods: number[] }[];
}

export interface Conflict {
  type:
    | 'TEACHER_DOUBLE_BOOKED'
    | 'ROOM_DOUBLE_BOOKED'
    | 'CLASS_OVERLAP'
    | 'INVALID_SLOT'
    | 'TEACHER_UNAVAILABLE'
    | 'BLOCKED_SLOT'
    | 'INSUFFICIENT_HOURS'
    | 'TOO_MANY_PER_DAY'
    | 'AVOIDED_PERIOD';
  severity: 'error' | 'warning';
  message: string;
  classId?: string;
  day?: number;
  period?: number;
  subjectId?: string;
  teacherId?: string | null;
}

const key = (a: string, day: number, period: number) => `${a}|${day}|${period}`;

export interface ValidateInput {
  grid: Grid;
  entries: Entry[];
  demands?: ClassDemand[];
  unavailable?: Record<string, { day: number; period: number }[]>; // teacherId -> slots
  constraints?: TimetableConstraints;
}

export function validate({ grid, entries, demands = [], unavailable = {}, constraints = {} }: ValidateInput): Conflict[] {
  const conflicts: Conflict[] = [];
  const maxPerDay = constraints.maxPerDayPerSubject ?? 2;
  const teacherSlots = new Map<string, Entry>();
  const roomSlots = new Map<string, Entry>();
  const classSlots = new Map<string, Entry>();
  const blocked = new Set((constraints.blockedSlots ?? []).map((s) => `${s.day}|${s.period}`));

  for (const e of entries) {
    if (!grid.days.includes(e.day) || e.period < 1 || e.period > grid.periodsPerDay) {
      conflicts.push({ type: 'INVALID_SLOT', severity: 'error', message: `Créneau invalide (jour ${e.day}, heure ${e.period})`, ...e });
      continue;
    }
    if (blocked.has(`${e.day}|${e.period}`)) {
      conflicts.push({ type: 'BLOCKED_SLOT', severity: 'error', message: `Créneau fermé utilisé (jour ${e.day}, heure ${e.period})`, ...e });
    }
    const ck = key(e.classId, e.day, e.period);
    if (classSlots.has(ck)) {
      conflicts.push({ type: 'CLASS_OVERLAP', severity: 'error', message: `Deux cours au même créneau pour la classe`, ...e });
    }
    classSlots.set(ck, e);
    if (e.teacherId) {
      const tk = key(e.teacherId, e.day, e.period);
      const other = teacherSlots.get(tk);
      if (other && other.classId !== e.classId) {
        conflicts.push({ type: 'TEACHER_DOUBLE_BOOKED', severity: 'error', message: `Enseignant affecté à deux classes au même créneau`, ...e });
      }
      teacherSlots.set(tk, e);
      if ((unavailable[e.teacherId] ?? []).some((s) => s.day === e.day && s.period === e.period)) {
        conflicts.push({ type: 'TEACHER_UNAVAILABLE', severity: 'error', message: `Enseignant indisponible sur ce créneau`, ...e });
      }
    }
    if (e.roomId) {
      const rk = key(e.roomId, e.day, e.period);
      const other = roomSlots.get(rk);
      if (other && other.classId !== e.classId) {
        conflicts.push({ type: 'ROOM_DOUBLE_BOOKED', severity: 'error', message: `Salle occupée par une autre classe`, ...e });
      }
      roomSlots.set(rk, e);
    }
    if ((constraints.avoid ?? []).some((a) => a.subjectId === e.subjectId && a.periods.includes(e.period))) {
      conflicts.push({ type: 'AVOIDED_PERIOD', severity: 'warning', message: `Matière placée sur une heure à éviter`, ...e });
    }
  }

  // Per class/subject/day load and weekly hours.
  const perDay = new Map<string, number>();
  const perWeek = new Map<string, number>();
  for (const e of entries) {
    const d = `${e.classId}|${e.subjectId}|${e.day}`;
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    const w = `${e.classId}|${e.subjectId}`;
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  for (const [k, n] of perDay) {
    if (n > maxPerDay) {
      const [classId, subjectId, day] = k.split('|');
      conflicts.push({ type: 'TOO_MANY_PER_DAY', severity: 'warning', message: `${n} heures de la même matière le même jour (max ${maxPerDay})`, classId, subjectId, day: Number(day) });
    }
  }
  for (const cd of demands) {
    for (const d of cd.demands) {
      const placed = perWeek.get(`${cd.classId}|${d.subjectId}`) ?? 0;
      if (placed < d.hours) {
        conflicts.push({ type: 'INSUFFICIENT_HOURS', severity: 'error', message: `${placed}/${d.hours} heures placées`, classId: cd.classId, subjectId: d.subjectId, teacherId: d.teacherId });
      }
    }
  }
  return conflicts;
}

export interface GenerateInput {
  grid: Grid;
  classes: ClassDemand[];
  rooms?: string[];
  /** Slots already taken by timetables that are not regenerated (other classes, published). */
  fixed?: Entry[];
  unavailable?: Record<string, { day: number; period: number }[]>;
  constraints?: TimetableConstraints;
}

export interface GenerateResult {
  entries: Entry[];
  unplaced: { classId: string; subjectId: string; missing: number }[];
}

export function generate({ grid, classes, rooms = [], fixed = [], unavailable = {}, constraints = {} }: GenerateInput): GenerateResult {
  const maxPerDay = constraints.maxPerDayPerSubject ?? 2;
  const blocked = new Set((constraints.blockedSlots ?? []).map((s) => `${s.day}|${s.period}`));
  const teacherBusy = new Set<string>();
  const roomBusy = new Set<string>();
  for (const f of fixed) {
    if (f.teacherId) teacherBusy.add(key(f.teacherId, f.day, f.period));
    if (f.roomId) roomBusy.add(key(f.roomId, f.day, f.period));
  }
  for (const [teacherId, slots] of Object.entries(unavailable)) {
    for (const s of slots) teacherBusy.add(key(teacherId, s.day, s.period));
  }
  const avoided = (subjectId: string, period: number) =>
    (constraints.avoid ?? []).some((a) => a.subjectId === subjectId && a.periods.includes(period));

  const entries: Entry[] = [];
  const unplaced: GenerateResult['unplaced'] = [];

  // Hardest first: classes with most hours, then subjects with most hours.
  const ordered = [...classes].sort((a, b) => sum(b) - sum(a));
  for (const cd of ordered) {
    const classBusy = new Set<string>();
    const dayCount = new Map<string, number>();
    const lessons = [...cd.demands].sort((a, b) => b.hours - a.hours);
    for (const d of lessons) {
      let missing = d.hours;
      for (let n = 0; n < d.hours; n++) {
        let best: { day: number; period: number; score: number } | null = null;
        for (const day of grid.days) {
          const today = dayCount.get(`${d.subjectId}|${day}`) ?? 0;
          if (today >= maxPerDay) continue;
          for (let period = 1; period <= grid.periodsPerDay; period++) {
            const slot = `${day}|${period}`;
            if (blocked.has(slot) || classBusy.has(slot)) continue;
            if (d.teacherId && teacherBusy.has(key(d.teacherId, day, period))) continue;
            // Spread lessons over the week, prefer morning, avoid discouraged periods.
            const score = today * 10 + period + (avoided(d.subjectId, period) ? 50 : 0);
            if (!best || score < best.score) best = { day, period, score };
          }
        }
        if (!best) break;
        const roomId = rooms.find((r) => !roomBusy.has(key(r, best!.day, best!.period))) ?? null;
        entries.push({ classId: cd.classId, day: best.day, period: best.period, subjectId: d.subjectId, teacherId: d.teacherId, roomId });
        classBusy.add(`${best.day}|${best.period}`);
        dayCount.set(`${d.subjectId}|${best.day}`, (dayCount.get(`${d.subjectId}|${best.day}`) ?? 0) + 1);
        if (d.teacherId) teacherBusy.add(key(d.teacherId, best.day, best.period));
        if (roomId) roomBusy.add(key(roomId, best.day, best.period));
        missing--;
      }
      if (missing > 0) unplaced.push({ classId: cd.classId, subjectId: d.subjectId, missing });
    }
  }
  return { entries, unplaced };
}

function sum(cd: ClassDemand) {
  return cd.demands.reduce((s, d) => s + d.hours, 0);
}

export const DAY_LABELS: Record<number, string> = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi' };

export const DEFAULT_GRID: Grid & { periodLabels: string[] } = {
  days: [1, 2, 3, 4, 5],
  periodsPerDay: 7,
  periodLabels: ['07:30', '08:25', '09:20', '10:25', '11:20', '14:30', '15:25'],
};
