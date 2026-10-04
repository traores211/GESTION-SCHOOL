/**
 * Rules of the school gate: which way a pupil is going, whether he is late or leaving early, and what
 * the family is told. Pure functions: no database, tested on their own.
 */
export type GateKind = 'ENTREE' | 'SORTIE';
export const GATE_METHODS = ['MANUEL', 'QR', 'BADGE'] as const;

/** Minutes after the start of the school day from which an arrival counts as late. */
export const LATE_TOLERANCE_MINUTES = 15;
/** Two scans of the same card within this delay are one passage (card shown twice). */
export const DOUBLE_SCAN_SECONDS = 120;

/** A pupil who came in goes out next, and the other way round; the first passage of a day is an arrival. */
export function nextKind(last: { kind: string; occurredAt: Date } | null, now: Date): GateKind {
  if (!last || !sameDay(last.occurredAt, now)) return 'ENTREE';
  return last.kind === 'ENTREE' ? 'SORTIE' : 'ENTREE';
}

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "07:30" → minutes since midnight; null when the text is not a time. */
export function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
const minutesOfDate = (d: Date) => d.getHours() * 60 + d.getMinutes();

export function isLate(at: Date, dayStart: string, tolerance = LATE_TOLERANCE_MINUTES): boolean {
  const start = minutesOf(dayStart);
  return start !== null && minutesOfDate(at) > start + tolerance;
}

/** Leaving before the end of the school day: needs a reason and an authorised adult. */
export function isEarlyExit(at: Date, dayEnd: string): boolean {
  const end = minutesOf(dayEnd);
  return end !== null && minutesOfDate(at) < end;
}

export const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** "Votre enfant Alice est arrivée à 07:32." / "Votre enfant Paul a quitté l'établissement à 17:04." */
export function gateMessage(student: { firstName: string; gender?: string | null }, kind: GateKind, at: Date, pickedUpBy?: string | null): string {
  const e = student.gender === 'F' ? 'e' : '';
  if (kind === 'ENTREE') return `Votre enfant ${student.firstName} est arrivé${e} à ${clock(at)}.`;
  return `Votre enfant ${student.firstName} a quitté l'établissement à ${clock(at)}${pickedUpBy ? `, accompagné${e} de ${pickedUpBy}` : ''}.`;
}
