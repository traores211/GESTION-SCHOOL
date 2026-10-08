import { DAY_NAMES, TIME_PATTERN, TimeRange, fromMinutes, overlaps, parseDays, parseRanges, toMinutes } from './time';

export type Half = 'AM' | 'PM';

/** Timetable grid of one academic year. */
export interface YearGrid {
  days: number[];
  start: string;
  end: string;
  /** Length of one period ("1 h" lessons may last 55 min). */
  slotMinutes: number;
  breaks: TimeRange[];
  freeHalfDays: { day: number; half: Half }[];
  /** Mornings end and afternoons start here. */
  halfDaySplit: string;
  maxClassMinutesPerDay: number | null;
  maxTeacherMinutesPerDay: number | null;
}

/** One teachable period of the week. */
export interface Period {
  day: number;
  index: number;
  start: string;
  end: string;
}

export const SLOT_OPTIONS = [15, 20, 30, 45, 50, 55, 60];

export function parseHalfDays(value: string | null | undefined): { day: number; half: Half }[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: { day: number; half: Half }[] = [];
  for (const part of value.split(',')) {
    const [d, h] = part.trim().toUpperCase().split(':');
    const day = Number(d);
    if (!Number.isInteger(day) || day < 1 || day > 7 || (h !== 'AM' && h !== 'PM')) continue;
    const key = `${day}:${h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day, half: h });
  }
  return out.sort((a, b) => a.day - b.day || a.half.localeCompare(b.half));
}

export function formatHalfDays(list: { day: number; half: Half }[]): string {
  return parseHalfDays(list.map((h) => `${h.day}:${h.half}`).join(',')).map((h) => `${h.day}:${h.half}`).join(',');
}

export function gridFromStrings(raw: {
  days: string;
  start: string;
  end: string;
  slotMinutes: number;
  breaks: string;
  freeHalfDays?: string | null;
  halfDaySplit?: string | null;
  maxClassMinutesPerDay?: number | null;
  maxTeacherMinutesPerDay?: number | null;
}): YearGrid {
  return {
    days: parseDays(raw.days),
    start: raw.start,
    end: raw.end,
    slotMinutes: raw.slotMinutes,
    breaks: parseRanges(raw.breaks),
    freeHalfDays: parseHalfDays(raw.freeHalfDays),
    halfDaySplit: raw.halfDaySplit && TIME_PATTERN.test(raw.halfDaySplit) ? raw.halfDaySplit : '12:00',
    maxClassMinutesPerDay: raw.maxClassMinutesPerDay ?? null,
    maxTeacherMinutesPerDay: raw.maxTeacherMinutesPerDay ?? null,
  };
}

/**
 * Minutes that count as one teaching "hour". With 45–60 min periods, one period is one hour of the
 * official volume (a 55 min lesson counts as 1 h); with shorter periods, an hour is 60 minutes.
 */
export function hourUnit(grid: Pick<YearGrid, 'slotMinutes'>): number {
  return grid.slotMinutes >= 45 && grid.slotMinutes <= 60 ? grid.slotMinutes : 60;
}

export function periodsPerHour(grid: Pick<YearGrid, 'slotMinutes'>): number {
  return Math.max(1, Math.round(hourUnit(grid) / grid.slotMinutes));
}

/** Lesson length in official hours. */
export function lessonHours(startTime: string, endTime: string, grid: Pick<YearGrid, 'slotMinutes'>): number {
  return (toMinutes(endTime) - toMinutes(startTime)) / hourUnit(grid);
}

/** "3h", "1h30" for official hours. */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 60) / 60;
  const h = Math.floor(rounded + 1e-9);
  const m = Math.round((rounded - h) * 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function halfOf(grid: Pick<YearGrid, 'start' | 'end' | 'halfDaySplit'>, half: Half): TimeRange {
  return half === 'AM' ? { start: grid.start, end: grid.halfDaySplit } : { start: grid.halfDaySplit, end: grid.end };
}

/** Why a slot does not fit the grid (closed day, hours, break, free half-day), or null when it fits. */
export function gridIssue(day: number, start: string, end: string, grid: YearGrid): string | null {
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) return 'Horaire invalide (format attendu HH:MM)';
  if (start >= end) return "L'heure de fin doit être après l'heure de début";
  if (grid.days.length && !grid.days.includes(day)) return `${DAY_NAMES[day] ?? 'Ce jour'} n'est pas un jour de cours`;
  if (start < grid.start || end > grid.end) return `En dehors des horaires de la journée (${grid.start}–${grid.end})`;
  for (const b of grid.breaks) if (overlaps(start, end, b.start, b.end)) return `Empiète sur la pause ${b.start}–${b.end}`;
  for (const h of grid.freeHalfDays) {
    if (h.day !== day) continue;
    const range = halfOf(grid, h.half);
    if (overlaps(start, end, range.start, range.end)) {
      return `${DAY_NAMES[day]} ${h.half === 'AM' ? 'matin' : 'après-midi'} est une demi-journée libre`;
    }
  }
  return null;
}

/**
 * Teachable periods of each open day: periods of `slotMinutes` from the start of the day, restarting
 * after each break, skipping free half-days.
 */
export function buildPeriods(grid: YearGrid): Map<number, Period[]> {
  const result = new Map<number, Period[]>();
  const step = grid.slotMinutes;
  const endMin = toMinutes(grid.end);
  const breaks = [...grid.breaks].sort((a, b) => a.start.localeCompare(b.start));
  for (const day of grid.days) {
    const periods: Period[] = [];
    let t = toMinutes(grid.start);
    while (t + step <= endMin) {
      const start = fromMinutes(t);
      const end = fromMinutes(t + step);
      const pause = breaks.find((b) => overlaps(start, end, b.start, b.end));
      if (pause) {
        t = Math.max(t + 1, toMinutes(pause.end));
        continue;
      }
      if (!gridIssue(day, start, end, grid)) periods.push({ day, index: periods.length, start, end });
      t += step;
    }
    result.set(day, periods);
  }
  return result;
}

/** Periods i..i+k-1 follow each other with no break in between. */
export function contiguous(periods: Period[], i: number, k: number): boolean {
  if (i + k > periods.length) return false;
  for (let j = i; j < i + k - 1; j++) if (periods[j].end !== periods[j + 1].start) return false;
  return true;
}

/** Minutes of empty time between lessons of one day, breaks excluded. */
export function gapMinutes(intervals: { startTime: string; endTime: string }[], grid: Pick<YearGrid, 'breaks'>): number {
  const sorted = [...intervals].sort((a, b) => a.startTime.localeCompare(b.startTime));
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1].endTime;
    const to = sorted[i].startTime;
    if (from >= to) continue;
    let gap = toMinutes(to) - toMinutes(from);
    for (const b of grid.breaks) {
      const s = Math.max(toMinutes(from), toMinutes(b.start));
      const e = Math.min(toMinutes(to), toMinutes(b.end));
      if (e > s) gap -= e - s;
    }
    total += Math.max(0, gap);
  }
  return total;
}
