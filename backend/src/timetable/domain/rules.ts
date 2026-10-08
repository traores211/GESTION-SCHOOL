/**
 * The single source of timetable rules. The planning import, the generator, manual adjustments
 * (move, swap, change of teacher or room) and the lesson form all go through these functions.
 */
import { DAY_NAMES, TimeRange, overlaps, toMinutes } from './time';
import { YearGrid, formatHours, gapMinutes, gridIssue, hourUnit, lessonHours } from './grid';

export interface LessonInput {
  id?: string;
  classId: string;
  subjectId?: string | null;
  teacherId?: string | null;
  roomId?: string | null;
  termId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface StoredLesson extends LessonInput {
  id: string;
  locked?: boolean;
}

export interface TimeWindow extends TimeRange {
  day: number;
}

export interface Qualification {
  teacherId: string;
  subjectId: string;
  level: string;
  classId: string | null;
}

export interface OfficialVolumeInfo {
  minutesPerWeek: number;
  maxSessionMinutes: number | null;
  coefficient: number | null;
}

/** Everything the rules need, loaded once per request. */
export interface PlanningData {
  grid: YearGrid;
  classes: Map<string, { id: string; name: string; level: string }>;
  subjects: Map<string, { id: string; name: string; coefficient: number }>;
  teachers: Map<string, { id: string; name: string; weeklyMaxMinutes: number | null }>;
  rooms: Map<string, { id: string; name: string; subjectIds: string[] }>;
  qualifications: Qualification[];
  /** Merged windows per teacher. A teacher absent from the map has no restriction. */
  availability: Map<string, TimeWindow[]>;
  /** Keyed by volumeKey(level, subjectId). */
  volumes: Map<string, OfficialVolumeInfo>;
}

export type CheckId =
  | 'GRID'
  | 'QUALIFIED'
  | 'AVAILABLE'
  | 'TEACHER_FREE'
  | 'CLASS_FREE'
  | 'ROOM'
  | 'CLASS_VOLUME'
  | 'TEACHER_MAX'
  | 'DAY_MAX';

export interface Check {
  id: CheckId;
  status: 'ok' | 'fail' | 'na';
  label: string;
  detail?: string;
}

export type WarningId = 'SPREAD' | 'SESSION_LENGTH' | 'AFTERNOON' | 'GAP' | 'NO_VOLUME';

export interface SoftWarning {
  id: WarningId;
  message: string;
}

export interface LessonReport {
  ok: boolean;
  checks: Check[];
  warnings: SoftWarning[];
}

/** Coefficient from which a subject should rather be taught in the morning. */
export const HIGH_COEFFICIENT = 3;

export const volumeKey = (level: string, subjectId: string) => `${level}|${subjectId}`;

// ------------------------------------------------------------------ primitives

/** Sorts and merges touching/overlapping windows so 08:00–10:00 + 10:00–12:00 covers 09:00–11:00. */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = [...windows].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const out: TimeWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && last.day === w.day && w.start <= last.end) {
      if (w.end > last.end) last.end = w.end;
    } else out.push({ ...w });
  }
  return out;
}

export function isQualified(data: PlanningData, teacherId: string, subjectId: string, classId: string): boolean {
  const klass = data.classes.get(classId);
  return data.qualifications.some(
    (q) => q.teacherId === teacherId && q.subjectId === subjectId && (q.classId ? q.classId === classId : !!klass && q.level === klass.level),
  );
}

export function qualifiedTeacherIds(data: PlanningData, subjectId: string, classId: string): string[] {
  return [...data.teachers.keys()].filter((t) => isQualified(data, t, subjectId, classId));
}

export function isAvailable(data: PlanningData, teacherId: string, day: number, start: string, end: string): boolean {
  const windows = data.availability.get(teacherId);
  if (!windows || windows.length === 0) return true;
  return windows.some((w) => w.day === day && w.start <= start && w.end >= end);
}

/** Specialised rooms a subject must use (empty = any ordinary room). */
export function requiredRoomIds(data: PlanningData, subjectId: string | null | undefined): string[] {
  if (!subjectId) return [];
  return [...data.rooms.values()].filter((r) => r.subjectIds.includes(subjectId)).map((r) => r.id);
}

/** Null when the room suits the subject, otherwise the reason. */
export function roomMismatch(data: PlanningData, roomId: string, subjectId: string | null | undefined): string | null {
  const room = data.rooms.get(roomId);
  if (!room) return 'Salle inconnue';
  const subjectName = subjectId ? data.subjects.get(subjectId)?.name ?? 'cette matière' : 'ce cours';
  if (room.subjectIds.length && (!subjectId || !room.subjectIds.includes(subjectId))) {
    const reserved = room.subjectIds.map((id) => data.subjects.get(id)?.name ?? '?').join(', ');
    return `${room.name} est réservée à : ${reserved}`;
  }
  const required = requiredRoomIds(data, subjectId);
  if (required.length && !required.includes(roomId)) {
    return `${subjectName} doit avoir lieu en ${required.map((id) => data.rooms.get(id)?.name).join(' ou ')}`;
  }
  return null;
}

export function volumeFor(data: PlanningData, classId: string, subjectId: string | null | undefined): OfficialVolumeInfo | null {
  const klass = data.classes.get(classId);
  if (!klass || !subjectId) return null;
  return data.volumes.get(volumeKey(klass.level, subjectId)) ?? null;
}

export function coefficientFor(data: PlanningData, classId: string, subjectId: string | null | undefined): number {
  if (!subjectId) return 0;
  return volumeFor(data, classId, subjectId)?.coefficient ?? data.subjects.get(subjectId)?.coefficient ?? 1;
}

function sameWeek(a: LessonInput, b: LessonInput) {
  return !a.termId || !b.termId || a.termId === b.termId;
}

function minutes(l: { startTime: string; endTime: string }) {
  return toMinutes(l.endTime) - toMinutes(l.startTime);
}

function when(l: LessonInput) {
  return `${DAY_NAMES[l.dayOfWeek] ?? ''} ${l.startTime}–${l.endTime}`;
}

// ------------------------------------------------------------------ the lesson check

/**
 * Every hard rule (✅/❌) and soft rule (⚠️) for one lesson against the rest of the timetable.
 * `sessions` is the current timetable; the lesson itself (same id) is ignored.
 */
export function checkLesson(lesson: LessonInput, data: PlanningData, sessions: StoredLesson[]): LessonReport {
  const checks: Check[] = [];
  const warnings: SoftWarning[] = [];
  const grid = data.grid;
  const others = sessions.filter((s) => s.id !== lesson.id && sameWeek(s, lesson));
  const klass = data.classes.get(lesson.classId);
  const className = klass?.name ?? 'La classe';
  const teacher = lesson.teacherId ? data.teachers.get(lesson.teacherId) : undefined;
  const subject = lesson.subjectId ? data.subjects.get(lesson.subjectId) : undefined;
  const sameDay = others.filter((s) => s.dayOfWeek === lesson.dayOfWeek);
  const clashing = sameDay.filter((s) => overlaps(lesson.startTime, lesson.endTime, s.startTime, s.endTime));

  const issue = gridIssue(lesson.dayOfWeek, lesson.startTime, lesson.endTime, grid);
  checks.push({ id: 'GRID', status: issue ? 'fail' : 'ok', label: 'Le créneau respecte la grille (jours, horaires, pauses, demi-journées libres)', detail: issue ?? undefined });
  const wellFormed = !issue || !/Horaire invalide|L'heure de fin/.test(issue);

  // Teacher rules
  if (!teacher || !lesson.teacherId) {
    const na = 'Aucun professeur choisi';
    checks.push({ id: 'QUALIFIED', status: 'na', label: 'Le professeur enseigne cette matière à ce niveau', detail: na });
    checks.push({ id: 'AVAILABLE', status: 'na', label: 'Le professeur est disponible sur ce créneau', detail: na });
    checks.push({ id: 'TEACHER_FREE', status: 'na', label: "Le professeur n'a pas déjà cours à ce moment", detail: na });
  } else {
    if (!lesson.subjectId) {
      checks.push({ id: 'QUALIFIED', status: 'na', label: 'Le professeur enseigne cette matière à ce niveau', detail: 'Aucune matière choisie' });
    } else {
      const ok = isQualified(data, lesson.teacherId, lesson.subjectId, lesson.classId);
      checks.push({
        id: 'QUALIFIED',
        status: ok ? 'ok' : 'fail',
        label: 'Le professeur enseigne cette matière à ce niveau',
        detail: ok ? undefined : `${teacher.name} n'est pas habilité(e) à enseigner ${subject?.name ?? 'cette matière'} en ${klass?.level ?? 'ce niveau'}`,
      });
    }
    const windows = data.availability.get(lesson.teacherId);
    const available = !wellFormed || isAvailable(data, lesson.teacherId, lesson.dayOfWeek, lesson.startTime, lesson.endTime);
    checks.push({
      id: 'AVAILABLE',
      status: available ? 'ok' : 'fail',
      label: 'Le professeur est disponible sur ce créneau',
      detail: !windows?.length
        ? 'Aucune restriction de disponibilité déclarée'
        : available
          ? undefined
          : `${teacher.name} n'est pas disponible ${when(lesson)}` + availabilityHint(windows, lesson.dayOfWeek),
    });
    const busy = clashing.find((s) => s.teacherId === lesson.teacherId);
    checks.push({
      id: 'TEACHER_FREE',
      status: busy ? 'fail' : 'ok',
      label: "Le professeur n'a pas déjà cours à ce moment",
      detail: busy ? `${teacher.name} a déjà cours en ${data.classes.get(busy.classId)?.name ?? 'une autre classe'} ${when(busy)}` : undefined,
    });
  }

  // Class rule
  const classBusy = clashing.find((s) => s.classId === lesson.classId);
  checks.push({
    id: 'CLASS_FREE',
    status: classBusy ? 'fail' : 'ok',
    label: "La classe n'a pas déjà cours à ce moment",
    detail: classBusy ? `${className} a déjà ${data.subjects.get(classBusy.subjectId ?? '')?.name ?? 'une séance'} ${when(classBusy)}` : undefined,
  });

  // Room rule
  if (lesson.roomId) {
    const mismatch = roomMismatch(data, lesson.roomId, lesson.subjectId);
    const taken = clashing.find((s) => s.roomId === lesson.roomId);
    const roomName = data.rooms.get(lesson.roomId)?.name ?? 'La salle';
    checks.push({
      id: 'ROOM',
      status: mismatch || taken ? 'fail' : 'ok',
      label: 'La salle est libre et adaptée à la matière',
      detail: mismatch ?? (taken ? `${roomName} est occupée par ${data.classes.get(taken.classId)?.name ?? 'une autre classe'} ${when(taken)}` : undefined),
    });
  } else {
    const required = requiredRoomIds(data, lesson.subjectId);
    checks.push({
      id: 'ROOM',
      status: required.length ? 'fail' : 'na',
      label: 'La salle est libre et adaptée à la matière',
      detail: required.length
        ? `${subject?.name} doit avoir lieu en ${required.map((id) => data.rooms.get(id)?.name).join(' ou ')}`
        : 'Aucune salle choisie',
    });
  }

  // Volumes
  const duration = wellFormed ? lessonHours(lesson.startTime, lesson.endTime, grid) : 0;
  const volume = volumeFor(data, lesson.classId, lesson.subjectId);
  if (!lesson.subjectId) {
    checks.push({ id: 'CLASS_VOLUME', status: 'na', label: "Le volume hebdomadaire de la matière n'est pas dépassé", detail: 'Aucune matière choisie' });
  } else if (!volume) {
    checks.push({
      id: 'CLASS_VOLUME',
      status: 'na',
      label: "Le volume hebdomadaire de la matière n'est pas dépassé",
      detail: `Aucun volume officiel pour ${subject?.name ?? 'cette matière'} en ${klass?.level ?? 'ce niveau'}`,
    });
    warnings.push({ id: 'NO_VOLUME', message: `Pas de volume officiel défini pour ${subject?.name ?? 'cette matière'} en ${klass?.level ?? 'ce niveau'}` });
  } else {
    const planned =
      others.filter((s) => s.classId === lesson.classId && s.subjectId === lesson.subjectId).reduce((sum, s) => sum + lessonHours(s.startTime, s.endTime, grid), 0) +
      duration;
    const official = volume.minutesPerWeek / 60;
    checks.push({
      id: 'CLASS_VOLUME',
      status: planned <= official + 1e-6 ? 'ok' : 'fail',
      label: "Le volume hebdomadaire de la matière n'est pas dépassé",
      detail: `${formatHours(planned)} planifiées / ${formatHours(official)} officielles`,
    });
  }

  if (!teacher || !lesson.teacherId) {
    checks.push({ id: 'TEACHER_MAX', status: 'na', label: "Le volume max du professeur n'est pas dépassé", detail: 'Aucun professeur choisi' });
  } else if (teacher.weeklyMaxMinutes == null) {
    checks.push({ id: 'TEACHER_MAX', status: 'na', label: "Le volume max du professeur n'est pas dépassé", detail: 'Aucun volume maximum défini' });
  } else {
    const load = others.filter((s) => s.teacherId === lesson.teacherId).reduce((sum, s) => sum + lessonHours(s.startTime, s.endTime, grid), 0) + duration;
    const max = teacher.weeklyMaxMinutes / 60;
    checks.push({
      id: 'TEACHER_MAX',
      status: load <= max + 1e-6 ? 'ok' : 'fail',
      label: "Le volume max du professeur n'est pas dépassé",
      detail: `${formatHours(load)} / ${formatHours(max)} par semaine`,
    });
  }

  // Daily maximums
  if (grid.maxClassMinutesPerDay == null && grid.maxTeacherMinutesPerDay == null) {
    checks.push({ id: 'DAY_MAX', status: 'na', label: "Le maximum d'heures par jour est respecté", detail: 'Aucun maximum journalier défini' });
  } else {
    const dur = wellFormed ? minutes(lesson) : 0;
    const classDay = sameDay.filter((s) => s.classId === lesson.classId).reduce((sum, s) => sum + minutes(s), 0) + dur;
    const teacherDay = lesson.teacherId ? sameDay.filter((s) => s.teacherId === lesson.teacherId).reduce((sum, s) => sum + minutes(s), 0) + dur : 0;
    const problems: string[] = [];
    const unit = hourUnit(grid);
    if (grid.maxClassMinutesPerDay != null && classDay > grid.maxClassMinutesPerDay) {
      problems.push(`${className} : ${formatHours(classDay / unit)} ce jour (max ${formatHours(grid.maxClassMinutesPerDay / unit)})`);
    }
    if (teacher && grid.maxTeacherMinutesPerDay != null && teacherDay > grid.maxTeacherMinutesPerDay) {
      problems.push(`${teacher.name} : ${formatHours(teacherDay / unit)} ce jour (max ${formatHours(grid.maxTeacherMinutesPerDay / unit)})`);
    }
    checks.push({ id: 'DAY_MAX', status: problems.length ? 'fail' : 'ok', label: "Le maximum d'heures par jour est respecté", detail: problems.join(' · ') || undefined });
  }

  // Soft rules
  if (wellFormed && lesson.subjectId) {
    const sameSubject = sameDay.filter((s) => s.classId === lesson.classId && s.subjectId === lesson.subjectId);
    if (sameSubject.length) {
      const total = sameSubject.reduce((sum, s) => sum + lessonHours(s.startTime, s.endTime, grid), 0) + duration;
      warnings.push({
        id: 'SPREAD',
        message: `${subject?.name} : ${formatHours(total)} le même jour pour ${className}, mieux vaut répartir sur plusieurs jours`,
      });
    }
    if (volume?.maxSessionMinutes && duration > volume.maxSessionMinutes / 60 + 1e-6) {
      warnings.push({ id: 'SESSION_LENGTH', message: `Séance de ${formatHours(duration)} : la durée maximale conseillée est ${formatHours(volume.maxSessionMinutes / 60)}` });
    }
    const coef = coefficientFor(data, lesson.classId, lesson.subjectId);
    if (coef >= HIGH_COEFFICIENT && lesson.startTime >= grid.halfDaySplit) {
      warnings.push({ id: 'AFTERNOON', message: `${subject?.name} (coef. ${coef}) est placée l'après-midi ; les matières à fort coefficient vont plutôt le matin` });
    }
  }
  if (wellFormed) {
    const classDay = sameDay.filter((s) => s.classId === lesson.classId);
    const added = gapMinutes([...classDay, lesson], grid) - gapMinutes(classDay, grid);
    if (classDay.length && added > 0) warnings.push({ id: 'GAP', message: `Crée un trou de ${formatGap(added)} dans la journée de ${className}` });
    if (teacher && lesson.teacherId) {
      const teacherDay = sameDay.filter((s) => s.teacherId === lesson.teacherId);
      const addedT = gapMinutes([...teacherDay, lesson], grid) - gapMinutes(teacherDay, grid);
      if (teacherDay.length && addedT > 0) warnings.push({ id: 'GAP', message: `Crée un trou de ${formatGap(addedT)} dans la journée de ${teacher.name}` });
    }
  }

  return { ok: !checks.some((c) => c.status === 'fail'), checks, warnings };
}

/** Real minutes of free time: "55 min", "2h", "1h30". */
function formatGap(minutes: number) {
  return minutes < 60 ? `${Math.round(minutes)} min` : formatHours(minutes / 60);
}

function availabilityHint(windows: TimeWindow[], day: number) {
  const today = windows.filter((w) => w.day === day);
  if (!today.length) return ` (aucune disponibilité le ${DAY_NAMES[day]?.toLowerCase()})`;
  return ` (disponible ${today.map((w) => `${w.start}–${w.end}`).join(', ')})`;
}

/** Messages of the failed checks, for refusals. */
export function failureMessages(report: LessonReport): string[] {
  return report.checks.filter((c) => c.status === 'fail').map((c) => c.detail ?? c.label);
}
