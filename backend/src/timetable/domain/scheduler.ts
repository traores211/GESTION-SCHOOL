import { SlotLike, GridSettings } from './conflicts';
import { fromMinutes, overlaps, toMinutes } from './time';

/** "5ème A needs 4 h of Maths per week with M. Kouassi" — a lesson volume still to be placed. */
export interface Requirement {
  key: string;
  classId: string;
  subjectId?: string | null;
  teacherId?: string | null;
  roomId?: string | null;
  termId?: string | null;
  minutesPerWeek: number;
  /** Preferred lesson length; defaults to 2 h blocks for big volumes, 1 h otherwise. */
  blockMinutes?: number;
}

export interface PlacedSlot extends SlotLike {
  requirementKey: string;
}

export interface UnplacedBlock {
  requirementKey: string;
  minutes: number;
  reason: string;
}

export interface ScheduleResult {
  placed: PlacedSlot[];
  unplaced: UnplacedBlock[];
}

function splitIntoBlocks(req: Requirement): number[] {
  const block = req.blockMinutes ?? (req.minutesPerWeek >= 180 ? 120 : 60);
  const blocks: number[] = [];
  let left = req.minutesPerWeek;
  while (left >= block) {
    blocks.push(block);
    left -= block;
  }
  if (left >= 30) blocks.push(left);
  return blocks;
}

function busy(slot: SlotLike, taken: SlotLike[]) {
  return taken.some(
    (t) =>
      t.dayOfWeek === slot.dayOfWeek &&
      (!t.termId || !slot.termId || t.termId === slot.termId) &&
      overlaps(slot.startTime, slot.endTime, t.startTime, t.endTime) &&
      (t.classId === slot.classId ||
        (!!slot.teacherId && t.teacherId === slot.teacherId) ||
        (!!slot.roomId && t.roomId === slot.roomId)),
  );
}

/**
 * Greedy placement of lesson volumes into the free cells of the week. It never moves existing
 * sessions and never creates a class/teacher/room conflict: what does not fit is reported as
 * unplaced with the reason, for the user to arbitrate. Deterministic for a given input.
 */
export function scheduleRequirements(
  requirements: Requirement[],
  existing: SlotLike[],
  settings: GridSettings & { slotMinutes: number },
): ScheduleResult {
  const taken: SlotLike[] = [...existing];
  const placed: PlacedSlot[] = [];
  const unplaced: UnplacedBlock[] = [];
  const days = settings.days.length ? settings.days : [1, 2, 3, 4, 5];
  const step = Math.max(5, settings.slotMinutes || 30);
  const dayStart = toMinutes(settings.start);
  const dayEnd = toMinutes(settings.end);

  // Hardest first: long blocks and busy teachers have the fewest possible cells.
  const teacherLoad = new Map<string, number>();
  for (const r of requirements) if (r.teacherId) teacherLoad.set(r.teacherId, (teacherLoad.get(r.teacherId) ?? 0) + r.minutesPerWeek);
  const ordered = [...requirements].sort(
    (a, b) =>
      (teacherLoad.get(b.teacherId ?? '') ?? 0) - (teacherLoad.get(a.teacherId ?? '') ?? 0) ||
      b.minutesPerWeek - a.minutesPerWeek ||
      a.key.localeCompare(b.key),
  );

  for (const req of ordered) {
    const usedDays = new Set<number>();
    for (const minutes of splitIntoBlocks(req)) {
      if (minutes > dayEnd - dayStart) {
        unplaced.push({ requirementKey: req.key, minutes, reason: 'Séance plus longue que la journée de cours' });
        continue;
      }
      // Spread a subject over the week: days without this subject first, then the least loaded days.
      const classLoad = (day: number) =>
        taken.filter((t) => t.classId === req.classId && t.dayOfWeek === day).reduce((sum, t) => sum + toMinutes(t.endTime) - toMinutes(t.startTime), 0);
      const dayOrder = [...days].sort(
        (a, b) => Number(usedDays.has(a)) - Number(usedDays.has(b)) || classLoad(a) - classLoad(b) || a - b,
      );

      let slot: PlacedSlot | null = null;
      for (const day of dayOrder) {
        for (let start = dayStart; start + minutes <= dayEnd; start += step) {
          const candidate: PlacedSlot = {
            requirementKey: req.key,
            classId: req.classId,
            teacherId: req.teacherId ?? null,
            roomId: req.roomId ?? null,
            termId: req.termId ?? null,
            dayOfWeek: day,
            startTime: fromMinutes(start),
            endTime: fromMinutes(start + minutes),
          };
          if (settings.breaks.some((b) => overlaps(candidate.startTime, candidate.endTime, b.start, b.end))) continue;
          if (busy(candidate, taken)) continue;
          slot = candidate;
          break;
        }
        if (slot) break;
      }

      if (slot) {
        placed.push(slot);
        taken.push(slot);
        usedDays.add(slot.dayOfWeek);
      } else {
        unplaced.push({
          requirementKey: req.key,
          minutes,
          reason: "Aucun créneau libre commun à la classe, à l'enseignant et à la salle",
        });
      }
    }
  }
  return { placed, unplaced };
}
