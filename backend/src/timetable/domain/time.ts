/** Time helpers for the weekly timetable. Times are "HH:MM" strings, days 1 (Monday) … 7 (Sunday). */

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DAY_NAMES = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Half-open intervals [start, end): a lesson ending at 10:00 does not overlap one starting at 10:00. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface TimeRange {
  start: string;
  end: string;
}

/** Parses "12:00-14:00, 10:00-10:15" into ranges, silently skipping malformed parts. */
export function parseRanges(value: string | null | undefined): TimeRange[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim().split('-').map((t) => t.trim()))
    .filter(([start, end]) => TIME_PATTERN.test(start ?? '') && TIME_PATTERN.test(end ?? '') && start < end)
    .map(([start, end]) => ({ start, end }));
}

export function parseDays(value: string | null | undefined): number[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((d) => Number(d.trim()))
        .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7),
    ),
  ].sort((a, b) => a - b);
}

export function formatSlot(day: number, start: string, end: string): string {
  return `${DAY_NAMES[day] ?? `Jour ${day}`} ${start}–${end}`;
}
