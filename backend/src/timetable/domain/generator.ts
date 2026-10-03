/**
 * Automatic timetable generation.
 *
 * Why not a CP-SAT solver: the API runs on Node and OR-Tools has no supported Node binding; adding a
 * Python service is out of reach on the target servers. Instead this is a classic constraint search:
 *
 *  1. Volumes → blocks: each official volume (minus locked lessons) is split into lessons no longer
 *     than the maximum session length, all taught by one qualified teacher with enough capacity.
 *  2. Backtracking with the "most constrained first" heuristic (MRV) and forward checking: the block
 *     with the fewest valid positions is placed first, on its cheapest position (soft score). Domains
 *     are cached and only recomputed for blocks sharing a class, teacher or room with a change.
 *  3. When the search budget runs out (or the problem is infeasible), it switches to best effort:
 *     blocks without any position are left aside and the rest is still placed.
 *  4. Repair: an unplaced block may move one generated lesson out of its way, or the volume may be
 *     handed to another qualified teacher.
 *  5. Local improvement: lessons are moved to cheaper positions while the soft score decreases.
 *
 * Hard rules are never relaxed; whatever cannot be placed is reported with its cause. The result is
 * deterministic for a given input.
 */
import { fromMinutes, toMinutes } from './time';
import { buildPeriods, contiguous, formatHours, gapMinutes, hourUnit, lessonHours, periodsPerHour } from './grid';
import { HIGH_COEFFICIENT, PlanningData, StoredLesson, coefficientFor, isAvailable, qualifiedTeacherIds, requiredRoomIds } from './rules';

export interface GenerateOptions {
  /** Classes to (re)generate. Their unlocked lessons must already be excluded from `fixed`. */
  classIds: string[];
  /** Preferred teacher per "classId|subjectId" (e.g. the teacher assigned to the class subject). */
  preferredTeachers?: Map<string, string>;
  maxNodes?: number;
  timeLimitMs?: number;
  improveMs?: number;
}

export interface GeneratedLesson {
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface UnplacedReport {
  classId: string;
  subjectId: string;
  className: string;
  subjectName: string;
  teacherId: string | null;
  missingHours: number;
  reason: string;
  message: string;
}

export interface GenerateResult {
  lessons: GeneratedLesson[];
  unplaced: UnplacedReport[];
  score: { total: number; spread: number; gapHours: number; afternoon: number };
  stats: { classes: number; requiredHours: number; placedHours: number; lockedHours: number; complete: boolean; mode: 'exact' | 'best-effort'; nodes: number; ms: number };
  notes: string[];
}

interface Requirement {
  key: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  candidates: string[];
  blocks: Block[];
  failure: string | null;
}

interface Block {
  id: number;
  req: Requirement;
  periods: number;
  placed: Position | null;
  domain: Position[] | null;
}

interface Position {
  day: number;
  index: number;
  start: string;
  end: string;
  roomId: string | null;
  cost: number;
}

type Interval = [number, number];

export function generateTimetable(data: PlanningData, fixed: StoredLesson[], options: GenerateOptions): GenerateResult {
  const t0 = Date.now();
  const grid = data.grid;
  const periodsByDay = buildPeriods(grid);
  const pph = periodsPerHour(grid);
  const step = grid.slotMinutes;
  const maxNodes = options.maxNodes ?? 50_000;
  const deadline = t0 + (options.timeLimitMs ?? 6_000);
  const notes: string[] = [];

  // ---------------------------------------------------------------- occupancy
  const busy = new Map<string, Interval[]>();
  const dayLoad = new Map<string, number>();
  const weekLoad = new Map<string, number>();
  const subjectDay = new Map<string, number>();

  const occupy = (classId: string, teacherId: string | null, roomId: string | null, subjectId: string | null, day: number, s: number, e: number, sign: 1 | -1) => {
    const keys = [`c:${classId}:${day}`, teacherId ? `t:${teacherId}:${day}` : null, roomId ? `r:${roomId}:${day}` : null].filter(Boolean) as string[];
    for (const k of keys) {
      const list = busy.get(k) ?? [];
      if (sign === 1) list.push([s, e]);
      else {
        const i = list.findIndex(([a, b]) => a === s && b === e);
        if (i >= 0) list.splice(i, 1);
      }
      busy.set(k, list);
      if (!k.startsWith('r:')) dayLoad.set(k, (dayLoad.get(k) ?? 0) + sign * (e - s));
    }
    if (teacherId) weekLoad.set(teacherId, (weekLoad.get(teacherId) ?? 0) + sign * (e - s));
    if (subjectId) {
      const k = `${classId}|${subjectId}|${day}`;
      subjectDay.set(k, (subjectDay.get(k) ?? 0) + sign);
    }
  };
  const isFree = (key: string, s: number, e: number) => !(busy.get(key) ?? []).some(([a, b]) => a < e && s < b);

  for (const l of fixed) {
    occupy(l.classId, l.teacherId ?? null, l.roomId ?? null, l.subjectId ?? null, l.dayOfWeek, toMinutes(l.startTime), toMinutes(l.endTime), 1);
  }

  // ---------------------------------------------------------------- rooms
  const generalRooms = [...data.rooms.values()].filter((r) => r.subjectIds.length === 0).map((r) => r.id).sort();
  const homeRoom = new Map<string, string>();
  const scopeClasses = options.classIds.filter((id) => data.classes.has(id));
  scopeClasses.forEach((id, i) => {
    const used = fixed.filter((l) => l.classId === id && l.roomId && generalRooms.includes(l.roomId));
    homeRoom.set(id, used[0]?.roomId ?? generalRooms[i % Math.max(1, generalRooms.length)]);
  });

  // ---------------------------------------------------------------- requirements
  const requirements: Requirement[] = [];
  let requiredHours = 0;
  let lockedHours = 0;
  for (const classId of scopeClasses) {
    const klass = data.classes.get(classId)!;
    const volumes = [...data.volumes.entries()].filter(([k]) => k.startsWith(`${klass.level}|`));
    if (!volumes.length) {
      notes.push(`${klass.name} : aucun volume horaire officiel pour le niveau ${klass.level}`);
      continue;
    }
    for (const [key, vol] of volumes) {
      const subjectId = key.slice(klass.level.length + 1);
      if (!data.subjects.has(subjectId)) continue;
      const official = vol.minutesPerWeek / 60;
      const locked = fixed.filter((l) => l.classId === classId && l.subjectId === subjectId).reduce((s, l) => s + lessonHours(l.startTime, l.endTime, grid), 0);
      requiredHours += official;
      lockedHours += Math.min(locked, official);
      const total = Math.round((official - locked) * pph);
      if (total <= 0) continue;
      const maxBlock = vol.maxSessionMinutes ? Math.max(1, Math.floor((vol.maxSessionMinutes / 60) * pph + 1e-9)) : 2 * pph;
      const n = Math.ceil(total / maxBlock);
      const sizes = Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));
      const req: Requirement = {
        key: `${classId}|${subjectId}`,
        classId,
        subjectId,
        teacherId: null,
        candidates: qualifiedTeacherIds(data, subjectId, classId).sort(),
        blocks: [],
        failure: null,
      };
      req.blocks = sizes.map((periods) => ({ id: 0, req, periods, placed: null, domain: null }));
      requirements.push(req);
    }
  }

  // ---------------------------------------------------------------- teacher assignment (capacity reserved)
  // Loads are counted in minutes of class time; the maximum is in official hours (a 55 min lesson
  // counts as one hour), so it is converted to class time first.
  const unit = hourUnit(grid);
  const maxClassTime = (t: string) => {
    const max = data.teachers.get(t)?.weeklyMaxMinutes;
    return max == null ? null : (max / 60) * unit;
  };
  const reserved = new Map<string, number>();
  const capacityLeft = (t: string) => {
    const max = maxClassTime(t);
    return max == null ? Infinity : max - (weekLoad.get(t) ?? 0) - (reserved.get(t) ?? 0) + 1e-6;
  };
  const reqMinutes = (r: Requirement) => r.blocks.reduce((s, b) => s + b.periods * step, 0);
  const lockedTeacher = new Map<string, string>();
  for (const l of fixed) if (l.subjectId && l.teacherId) lockedTeacher.set(`${l.classId}|${l.subjectId}`, l.teacherId);

  const byScarcity = [...requirements].sort((a, b) => a.candidates.length - b.candidates.length || reqMinutes(b) - reqMinutes(a) || a.key.localeCompare(b.key));
  for (const req of byScarcity) {
    if (!req.candidates.length) {
      req.failure = `aucun professeur n'est habilité à enseigner ${data.subjects.get(req.subjectId)?.name} en ${data.classes.get(req.classId)?.level}`;
      continue;
    }
    const preferred = [lockedTeacher.get(req.key), options.preferredTeachers?.get(req.key)].filter((t): t is string => !!t && req.candidates.includes(t));
    const need = reqMinutes(req);
    const ranked = [...req.candidates].sort((a, b) => {
      const pa = preferred.includes(a) ? 0 : 1;
      const pb = preferred.includes(b) ? 0 : 1;
      return pa - pb || availableMinutes(b) - availableMinutes(a) || a.localeCompare(b);
    });
    const chosen = ranked.find((t) => capacityLeft(t) >= need);
    if (!chosen) {
      const names = req.candidates.map((t) => data.teachers.get(t)?.name).join(', ');
      req.failure = `${names} ${req.candidates.length > 1 ? 'ont' : 'a'} atteint ${req.candidates.length > 1 ? 'leur' : 'son'} volume horaire maximum`;
      continue;
    }
    req.teacherId = chosen;
    reserved.set(chosen, (reserved.get(chosen) ?? 0) + need);
  }

  function availableMinutes(teacherId: string) {
    const max = maxClassTime(teacherId);
    return max == null ? 1e9 : max - (weekLoad.get(teacherId) ?? 0) - (reserved.get(teacherId) ?? 0);
  }

  const blocks: Block[] = [];
  for (const r of requirements) if (r.teacherId) for (const b of r.blocks) blocks.push(b);
  blocks.forEach((b, i) => (b.id = i));

  // ---------------------------------------------------------------- positions
  const dayStartMin = toMinutes(grid.start);

  function roomFor(req: Requirement, day: number, s: number, e: number): string | null | undefined {
    const required = requiredRoomIds(data, req.subjectId);
    if (required.length) return [...required].sort().find((r) => isFree(`r:${r}:${day}`, s, e));
    const home = homeRoom.get(req.classId);
    if (home && isFree(`r:${home}:${day}`, s, e)) return home;
    return generalRooms.find((r) => isFree(`r:${r}:${day}`, s, e)) ?? null;
  }

  function feasibleAt(block: Block, day: number, i: number, withCost: boolean): Position | null {
    const req = block.req;
    const periods = periodsByDay.get(day) ?? [];
    if (!contiguous(periods, i, block.periods)) return null;
    const startS = periods[i].start;
    const endS = periods[i + block.periods - 1].end;
    const s = toMinutes(startS);
    const e = toMinutes(endS);
    const teacherId = req.teacherId!;
    if (!isFree(`c:${req.classId}:${day}`, s, e)) return null;
    if (!isFree(`t:${teacherId}:${day}`, s, e)) return null;
    if (!isAvailable(data, teacherId, day, startS, endS)) return null;
    if (grid.maxClassMinutesPerDay != null && (dayLoad.get(`c:${req.classId}:${day}`) ?? 0) + (e - s) > grid.maxClassMinutesPerDay) return null;
    if (grid.maxTeacherMinutesPerDay != null && (dayLoad.get(`t:${teacherId}:${day}`) ?? 0) + (e - s) > grid.maxTeacherMinutesPerDay) return null;
    const roomId = roomFor(req, day, s, e);
    if (roomId === undefined) return null;
    return { day, index: i, start: startS, end: endS, roomId, cost: withCost ? costAt(req, day, s, e) : 0 };
  }

  function intervalsOf(key: string): { startTime: string; endTime: string }[] {
    return (busy.get(key) ?? []).map(([a, b]) => ({ startTime: fromMinutes(a), endTime: fromMinutes(b) }));
  }

  function costAt(req: Requirement, day: number, s: number, e: number): number {
    let cost = 0;
    if ((subjectDay.get(`${req.classId}|${req.subjectId}|${day}`) ?? 0) > 0) cost += 40;
    const coef = coefficientFor(data, req.classId, req.subjectId);
    const startS = fromMinutes(s);
    if (coef >= HIGH_COEFFICIENT && startS >= grid.halfDaySplit) cost += coef * 4;
    const added = { startTime: startS, endTime: fromMinutes(e) };
    for (const key of [`c:${req.classId}:${day}`, `t:${req.teacherId}:${day}`]) {
      const current = intervalsOf(key);
      if (!current.length) continue;
      const delta = gapMinutes([...current, added], grid) - gapMinutes(current, grid);
      cost += (delta / step) * 6;
    }
    // Slight pull towards the start of the day keeps days compact.
    cost += (s - dayStartMin) / 600;
    return cost;
  }

  function domainOf(block: Block, withCost = false): Position[] {
    const out: Position[] = [];
    for (const day of grid.days) {
      const periods = periodsByDay.get(day) ?? [];
      for (let i = 0; i + block.periods <= periods.length; i++) {
        const p = feasibleAt(block, day, i, withCost);
        if (p) out.push(p);
      }
    }
    return out;
  }

  // Blocks whose positions depend on each other: same class, same teacher or same specialised room.
  // Ordinary rooms never block a position (the lesson simply gets no room), so they don't count.
  const related = new Map<number, Block[]>();
  const roomsOf = new Map(requirements.map((r) => [r.key, requiredRoomIds(data, r.subjectId)]));
  function rebuildRelated() {
    for (const b of blocks) {
      const mine = roomsOf.get(b.req.key) ?? [];
      related.set(
        b.id,
        blocks.filter(
          (o) =>
            o !== b &&
            (o.req.classId === b.req.classId || o.req.teacherId === b.req.teacherId || (roomsOf.get(o.req.key) ?? []).some((r) => mine.includes(r))),
        ),
      );
    }
  }
  rebuildRelated();

  function place(block: Block, pos: Position) {
    block.placed = pos;
    occupy(block.req.classId, block.req.teacherId, pos.roomId, block.req.subjectId, pos.day, toMinutes(pos.start), toMinutes(pos.end), 1);
    invalidate(block);
  }
  function unplace(block: Block) {
    const pos = block.placed!;
    occupy(block.req.classId, block.req.teacherId, pos.roomId, block.req.subjectId, pos.day, toMinutes(pos.start), toMinutes(pos.end), -1);
    block.placed = null;
    invalidate(block);
  }
  function invalidate(block: Block) {
    block.domain = null;
    for (const o of related.get(block.id) ?? []) o.domain = null;
  }

  // ---------------------------------------------------------------- search
  let nodes = 0;
  let mode: 'exact' | 'best-effort' = 'exact';
  const skipped = new Set<number>();

  function pickMostConstrained(): Block | null {
    let best: Block | null = null;
    let bestSize = Infinity;
    for (const b of blocks) {
      if (b.placed || skipped.has(b.id)) continue;
      if (!b.domain) b.domain = domainOf(b);
      const size = b.domain.length;
      if (size < bestSize || (size === bestSize && best && b.periods > best.periods)) {
        best = b;
        bestSize = size;
      }
      if (size === 0) break;
    }
    return best;
  }

  function search(): boolean {
    if (++nodes > maxNodes || Date.now() > deadline) mode = 'best-effort';
    const block = pickMostConstrained();
    if (!block) return true;
    const options = domainOf(block, true).sort((a, b) => a.cost - b.cost || a.day - b.day || a.index - b.index);
    if (!options.length) {
      if (mode === 'exact') return false;
      skipped.add(block.id);
      return search();
    }
    for (const pos of options) {
      place(block, pos);
      if (search()) return true;
      unplace(block);
      if (mode === 'best-effort') break;
    }
    if (mode === 'best-effort') {
      skipped.add(block.id);
      return search();
    }
    return false;
  }

  if (!search()) {
    // Proven infeasible as a whole: restart in best-effort mode to place as much as possible.
    for (const b of blocks) if (b.placed) unplace(b);
    skipped.clear();
    mode = 'best-effort';
    search();
  }

  // ---------------------------------------------------------------- repair
  const generated = () => blocks.filter((b) => b.placed);
  for (const block of blocks.filter((b) => !b.placed)) tryEject(block);
  for (const req of requirements.filter((r) => r.teacherId && r.blocks.some((b) => !b.placed))) tryOtherTeacher(req);
  // Room may have been freed by the repairs above: one last pass on what is still unplaced.
  for (const block of blocks.filter((b) => !b.placed)) {
    const best = domainOf(block, true).sort((a, b) => a.cost - b.cost)[0];
    if (best) place(block, best);
    else tryEject(block);
  }

  function tryEject(block: Block) {
    for (const day of grid.days) {
      const periods = periodsByDay.get(day) ?? [];
      for (let i = 0; i + block.periods <= periods.length; i++) {
        if (!contiguous(periods, i, block.periods)) continue;
        const s = toMinutes(periods[i].start);
        const e = toMinutes(periods[i + block.periods - 1].end);
        if (!isAvailable(data, block.req.teacherId!, day, periods[i].start, periods[i + block.periods - 1].end)) continue;
        const blockers = generated().filter(
          (o) =>
            o.placed!.day === day &&
            toMinutes(o.placed!.start) < e &&
            s < toMinutes(o.placed!.end) &&
            (o.req.classId === block.req.classId || o.req.teacherId === block.req.teacherId),
        );
        if (blockers.length !== 1) continue;
        const other = blockers[0];
        const back = other.placed!;
        unplace(other);
        const here = feasibleAt(block, day, i, true);
        if (here) {
          place(block, here);
          const moves = domainOf(other, true).sort((a, b) => a.cost - b.cost);
          if (moves.length) {
            place(other, moves[0]);
            return true;
          }
          unplace(block);
        }
        place(other, back);
      }
    }
    return false;
  }

  function tryOtherTeacher(req: Requirement) {
    const missingBefore = req.blocks.filter((b) => !b.placed).length;
    const need = reqMinutes(req);
    for (const alt of req.candidates) {
      if (alt === req.teacherId) continue;
      if (capacityLeft(alt) < need) continue;
      const previous = req.teacherId!;
      const snapshot = req.blocks.map((b) => b.placed);
      for (const b of req.blocks) if (b.placed) unplace(b);
      req.teacherId = alt;
      for (const b of [...req.blocks].sort((x, y) => y.periods - x.periods)) {
        const opts = domainOf(b, true).sort((x, y) => x.cost - y.cost);
        if (opts.length) place(b, opts[0]);
      }
      const missingAfter = req.blocks.filter((b) => !b.placed).length;
      if (missingAfter < missingBefore) {
        reserved.set(previous, (reserved.get(previous) ?? 0) - need);
        reserved.set(alt, (reserved.get(alt) ?? 0) + need);
        rebuildRelated();
        return;
      }
      for (const b of req.blocks) if (b.placed) unplace(b);
      req.teacherId = previous;
      req.blocks.forEach((b, i) => snapshot[i] && place(b, snapshot[i]!));
    }
  }

  // ---------------------------------------------------------------- local improvement
  const improveUntil = Date.now() + (options.improveMs ?? 1_500);
  let improved = true;
  while (improved && Date.now() < improveUntil) {
    improved = false;
    for (const block of generated()) {
      if (Date.now() >= improveUntil) break;
      const current = block.placed!;
      unplace(block);
      const currentCost = costAt(block.req, current.day, toMinutes(current.start), toMinutes(current.end));
      const best = domainOf(block, true).sort((a, b) => a.cost - b.cost)[0];
      if (best && best.cost < currentCost - 0.5) {
        place(block, best);
        improved = true;
      } else place(block, current);
    }
  }

  // ---------------------------------------------------------------- report
  const lessons: GeneratedLesson[] = generated()
    .map((b) => ({
      classId: b.req.classId,
      subjectId: b.req.subjectId,
      teacherId: b.req.teacherId!,
      roomId: b.placed!.roomId,
      dayOfWeek: b.placed!.day,
      startTime: b.placed!.start,
      endTime: b.placed!.end,
    }))
    .sort((a, b) => a.classId.localeCompare(b.classId) || a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

  const unplaced: UnplacedReport[] = [];
  for (const req of requirements) {
    const missing = req.teacherId ? req.blocks.filter((b) => !b.placed) : req.blocks;
    if (!missing.length) continue;
    const missingHours = missing.reduce((s, b) => s + b.periods, 0) / pph;
    const reason = req.failure ?? diagnose(missing[0]);
    const className = data.classes.get(req.classId)?.name ?? '?';
    const subjectName = data.subjects.get(req.subjectId)?.name ?? '?';
    unplaced.push({
      classId: req.classId,
      subjectId: req.subjectId,
      className,
      subjectName,
      teacherId: req.teacherId,
      missingHours,
      reason,
      message: `${subjectName} ${className} : ${formatHours(missingHours)} manquante${missingHours > 1 ? 's' : ''}, ${reason}`,
    });
  }

  /** Finds the first rule that leaves the block without any position. */
  function diagnose(block: Block): string {
    const req = block.req;
    const t = data.teachers.get(req.teacherId!)?.name ?? 'le professeur';
    const c = data.classes.get(req.classId)?.name ?? 'la classe';
    let grid0 = 0;
    let classFree = 0;
    let available = 0;
    let teacherFree = 0;
    let dayOk = 0;
    for (const day of data.grid.days) {
      const periods = periodsByDay.get(day) ?? [];
      for (let i = 0; i + block.periods <= periods.length; i++) {
        if (!contiguous(periods, i, block.periods)) continue;
        grid0++;
        const startS = periods[i].start;
        const endS = periods[i + block.periods - 1].end;
        const s = toMinutes(startS);
        const e = toMinutes(endS);
        if (!isFree(`c:${req.classId}:${day}`, s, e)) continue;
        classFree++;
        if (!isAvailable(data, req.teacherId!, day, startS, endS)) continue;
        available++;
        if (!isFree(`t:${req.teacherId}:${day}`, s, e)) continue;
        teacherFree++;
        const cd = grid.maxClassMinutesPerDay != null && (dayLoad.get(`c:${req.classId}:${day}`) ?? 0) + (e - s) > grid.maxClassMinutesPerDay;
        const td = grid.maxTeacherMinutesPerDay != null && (dayLoad.get(`t:${req.teacherId}:${day}`) ?? 0) + (e - s) > grid.maxTeacherMinutesPerDay;
        if (cd || td) continue;
        dayOk++;
      }
    }
    const hours = formatHours(block.periods / pph);
    if (!grid0) return `aucune plage continue de ${hours} dans la grille horaire`;
    if (!classFree) return `${c} n'a plus de créneau libre de ${hours}`;
    if (!available) return `${t} n'a plus de disponibilité compatible`;
    if (!teacherFree) return `${t} a déjà cours sur tous ses créneaux disponibles compatibles`;
    if (!dayOk) return `le maximum d'heures par jour est atteint sur les créneaux compatibles`;
    const rooms = requiredRoomIds(data, req.subjectId).map((r) => data.rooms.get(r)?.name);
    if (rooms.length) return `${rooms.join(' / ')} n'est libre sur aucun créneau compatible`;
    return 'les contraintes combinées ne laissent aucun créneau';
  }

  // Score of the scope (lower is better).
  const scopeLessons = [...fixed.filter((l) => scopeClasses.includes(l.classId)), ...lessons];
  let spread = 0;
  let afternoon = 0;
  const perSubjectDay = new Map<string, number>();
  for (const l of scopeLessons) {
    if (!l.subjectId) continue;
    const k = `${l.classId}|${l.subjectId}|${l.dayOfWeek}`;
    perSubjectDay.set(k, (perSubjectDay.get(k) ?? 0) + 1);
    if (coefficientFor(data, l.classId, l.subjectId) >= HIGH_COEFFICIENT && l.startTime >= grid.halfDaySplit) afternoon++;
  }
  for (const n of perSubjectDay.values()) if (n > 1) spread += n - 1;
  let gapMin = 0;
  const teacherIds = new Set(lessons.map((l) => l.teacherId));
  for (const day of grid.days) {
    for (const c of scopeClasses) gapMin += gapMinutes(scopeLessons.filter((l) => l.classId === c && l.dayOfWeek === day), grid);
    for (const t of teacherIds) gapMin += gapMinutes([...fixed, ...lessons].filter((l) => l.teacherId === t && l.dayOfWeek === day), grid);
  }
  const gapHours = Math.round((gapMin / 60) * 10) / 10;
  const placedHours = lessons.reduce((s, l) => s + lessonHours(l.startTime, l.endTime, grid), 0);

  return {
    lessons,
    unplaced: unplaced.sort((a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName)),
    score: { total: Math.round(spread * 10 + gapHours * 3 + afternoon * 2), spread, gapHours, afternoon },
    stats: {
      classes: scopeClasses.length,
      requiredHours,
      placedHours,
      lockedHours,
      complete: unplaced.length === 0,
      mode,
      nodes,
      ms: Date.now() - t0,
    },
    notes,
  };
}
