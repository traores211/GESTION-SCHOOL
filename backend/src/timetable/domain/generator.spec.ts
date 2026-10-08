import { generateTimetable } from './generator';
import { lessonHours } from './grid';
import { PlanningData, StoredLesson, checkLesson } from './rules';
import { makeData } from './planning.fixtures';

/** Every generated lesson must pass every hard rule against the final timetable. */
function expectValid(data: PlanningData, fixed: StoredLesson[], lessons: ReturnType<typeof generateTimetable>['lessons']) {
  const all: StoredLesson[] = [...fixed, ...lessons.map((l, i) => ({ ...l, id: `g${i}` }))];
  for (const l of all.filter((x) => x.id.startsWith('g'))) {
    const report = checkLesson(l, data, all);
    const failed = report.checks.filter((c) => c.status === 'fail');
    expect(failed).toEqual([]);
  }
}

const hoursOf = (data: PlanningData, lessons: { classId: string; subjectId?: string | null; startTime: string; endTime: string }[], classId: string, subjectId: string) =>
  lessons.filter((l) => l.classId === classId && l.subjectId === subjectId).reduce((s, l) => s + lessonHours(l.startTime, l.endTime, data.grid), 0);

describe('generateTimetable', () => {
  it('places every official volume exactly, without breaking any hard rule', () => {
    const data = makeData();
    const result = generateTimetable(data, [], { classIds: ['c6a', 'c6b'], improveMs: 300 });
    expect(result.unplaced).toEqual([]);
    expect(result.stats.complete).toBe(true);
    for (const c of ['c6a', 'c6b']) {
      expect(hoursOf(data, result.lessons, c, 'math')).toBe(4);
      expect(hoursOf(data, result.lessons, c, 'fr')).toBe(4);
      expect(hoursOf(data, result.lessons, c, 'svt')).toBe(2);
    }
    expectValid(data, [], result.lessons);
    // SVT always in the lab, never on Wednesday afternoon.
    expect(result.lessons.filter((l) => l.subjectId === 'svt').every((l) => l.roomId === 'lab')).toBe(true);
    expect(result.lessons.some((l) => l.dayOfWeek === 3 && l.startTime >= '12:15')).toBe(false);
  });

  it('respects the maximum session length and spreads a subject over several days', () => {
    const data = makeData();
    const result = generateTimetable(data, [], { classIds: ['c6a'], improveMs: 300 });
    const maths = result.lessons.filter((l) => l.subjectId === 'math');
    expect(maths.every((l) => lessonHours(l.startTime, l.endTime, data.grid) <= 2)).toBe(true);
    expect(new Set(maths.map((l) => l.dayOfWeek)).size).toBe(maths.length);
    expect(result.score.spread).toBe(0);
  });

  it('keeps high-coefficient subjects in the morning when possible', () => {
    const data = makeData();
    const result = generateTimetable(data, [], { classIds: ['c6a'], improveMs: 300 });
    expect(result.lessons.filter((l) => l.subjectId === 'math').every((l) => l.startTime < data.grid.halfDaySplit)).toBe(true);
  });

  it('is deterministic', () => {
    const data = makeData();
    const a = generateTimetable(data, [], { classIds: ['c6a', 'c6b'], improveMs: 200 });
    const b = generateTimetable(data, [], { classIds: ['c6a', 'c6b'], improveMs: 200 });
    expect(a.lessons).toEqual(b.lessons);
  });

  it('counts locked lessons in the volume and never moves them', () => {
    const data = makeData();
    const locked: StoredLesson = { id: 'L', classId: 'c6a', subjectId: 'math', teacherId: 'kouassi', roomId: 's1', dayOfWeek: 5, startTime: '14:00', endTime: '16:00', locked: true };
    const result = generateTimetable(data, [locked], { classIds: ['c6a'], improveMs: 200 });
    expect(hoursOf(data, result.lessons, 'c6a', 'math')).toBe(2);
    expect(result.stats.lockedHours).toBe(2);
    expectValid(data, [locked], result.lessons);
  });

  it('works around lessons of other classes (teacher already busy)', () => {
    const data = makeData();
    // M. KOUASSI already teaches 6e B every morning: 6e A maths must go in the afternoon.
    const fixed: StoredLesson[] = [1, 2, 3, 4, 5].flatMap((day) => [
      { id: `k${day}a`, classId: 'c6b', subjectId: 'math', teacherId: 'kouassi', roomId: 's2', dayOfWeek: day, startTime: '08:00', endTime: '10:00' },
      { id: `k${day}b`, classId: 'c6b', subjectId: 'math', teacherId: 'kouassi', roomId: 's2', dayOfWeek: day, startTime: '10:15', endTime: '12:15' },
    ]);
    const data2 = makeData({ teachers: [{ id: 'kouassi', name: 'M. KOUASSI', max: null }, { id: 'traore', name: 'Mme TRAORÉ' }, { id: 'bamba', name: 'M. BAMBA' }] });
    const result = generateTimetable(data2, fixed, { classIds: ['c6a'], improveMs: 200 });
    expect(hoursOf(data, result.lessons, 'c6a', 'math')).toBe(4);
    expect(result.lessons.filter((l) => l.subjectId === 'math').every((l) => l.startTime >= '14:00')).toBe(true);
    expectValid(data2, fixed, result.lessons);
  });

  it('reports what cannot be placed with the cause (no compatible availability)', () => {
    const data = makeData({ availability: { kouassi: [{ day: 1, start: '08:00', end: '10:00' }] } });
    const result = generateTimetable(data, [], { classIds: ['c6a'], improveMs: 100 });
    expect(result.stats.complete).toBe(false);
    expect(hoursOf(data, result.lessons, 'c6a', 'math')).toBe(2);
    const report = result.unplaced.find((u) => u.subjectId === 'math')!;
    expect(report.missingHours).toBe(2);
    expect(report.message).toBe("Mathématiques 6e A : 2h manquantes, M. KOUASSI n'a plus de disponibilité compatible");
    // Everything else is still placed.
    expect(hoursOf(data, result.lessons, 'c6a', 'fr')).toBe(4);
    expectValid(data, [], result.lessons);
  });

  it('reports a missing qualified teacher and a reached teaching load', () => {
    const noTeacher = makeData({ qualifications: [{ teacherId: 'traore', subjectId: 'fr', level: '6ème', classId: null }, { teacherId: 'bamba', subjectId: 'svt', level: '6ème', classId: null }] });
    const r1 = generateTimetable(noTeacher, [], { classIds: ['c6a'], improveMs: 100 });
    expect(r1.unplaced.find((u) => u.subjectId === 'math')?.reason).toBe("aucun professeur n'est habilité à enseigner Mathématiques en 6ème");

    const tired = makeData({ teachers: [{ id: 'kouassi', name: 'M. KOUASSI', max: 6 * 60 }, { id: 'traore', name: 'Mme TRAORÉ' }, { id: 'bamba', name: 'M. BAMBA' }] });
    const r2 = generateTimetable(tired, [], { classIds: ['c6a', 'c6b'], improveMs: 100 });
    const missing = r2.unplaced.filter((u) => u.subjectId === 'math');
    expect(missing).toHaveLength(1);
    expect(missing[0].reason).toMatch(/M. KOUASSI a atteint son volume horaire maximum/);
    expect(hoursOf(tired, r2.lessons, 'c6a', 'math') + hoursOf(tired, r2.lessons, 'c6b', 'math')).toBe(4);
  });

  it('counts the teacher maximum in official hours with 55-minute periods', () => {
    const data = makeData({
      grid: { slotMinutes: 55, breaks: [], freeHalfDays: [], halfDaySplit: '12:00' },
      teachers: [{ id: 'kouassi', name: 'M. KOUASSI', max: 4 * 60 }, { id: 'traore', name: 'Mme TRAORÉ' }, { id: 'bamba', name: 'M. BAMBA' }],
    });
    const result = generateTimetable(data, [], { classIds: ['c6a', 'c6b'], improveMs: 100 });
    const load = result.lessons.filter((l) => l.teacherId === 'kouassi').reduce((s, l) => s + lessonHours(l.startTime, l.endTime, data.grid), 0);
    expect(load).toBe(4);
    expect(result.unplaced.filter((u) => u.subjectId === 'math')).toHaveLength(1);
    expectValid(data, [], result.lessons);
  });

  it('hands a volume to another qualified teacher when the first one is fully booked', () => {
    const data = makeData({
      teachers: [{ id: 'kouassi', name: 'M. KOUASSI', max: 4 * 60 }, { id: 'yao', name: 'Mme YAO', max: null }, { id: 'traore', name: 'Mme TRAORÉ' }, { id: 'bamba', name: 'M. BAMBA' }],
      qualifications: [
        { teacherId: 'kouassi', subjectId: 'math', level: '6ème', classId: null },
        { teacherId: 'yao', subjectId: 'math', level: '6ème', classId: null },
        { teacherId: 'traore', subjectId: 'fr', level: '6ème', classId: null },
        { teacherId: 'bamba', subjectId: 'svt', level: '6ème', classId: null },
      ],
      // Mme YAO only comes on Monday morning: she cannot take both classes.
      availability: { yao: [{ day: 1, start: '08:00', end: '12:15' }] },
    });
    const result = generateTimetable(data, [], { classIds: ['c6a', 'c6b'], improveMs: 100 });
    expect(result.unplaced).toEqual([]);
    const teachersOfMath = new Set(result.lessons.filter((l) => l.subjectId === 'math').map((l) => l.teacherId));
    expect(teachersOfMath).toEqual(new Set(['kouassi', 'yao']));
    expectValid(data, [], result.lessons);
  });

  it('notes classes whose level has no official volume', () => {
    const data = makeData({ classes: [{ id: 'c6a', name: '6e A', level: '6ème' }, { id: 'c5a', name: '5e A', level: '5ème' }] });
    const result = generateTimetable(data, [], { classIds: ['c6a', 'c5a'], improveMs: 100 });
    expect(result.notes).toEqual(['5e A : aucun volume horaire officiel pour le niveau 5ème']);
  });

  it('stays fast on a full school (12 classes, 9 subjects)', () => {
    const levels = ['6ème', '5ème', '4ème', '3ème'];
    const classes = levels.flatMap((level, i) => ['A', 'B', 'C'].map((x) => ({ id: `c${i}${x}`, name: `${level} ${x}`, level })));
    const subj = ['math', 'fr', 'ang', 'hg', 'svt', 'pc', 'eps', 'art', 'mus'];
    const hours: Record<string, number> = { math: 4, fr: 5, ang: 3, hg: 3, svt: 2, pc: 2, eps: 2, art: 1, mus: 1 };
    const teachers = subj.flatMap((s) => [1, 2, 3].map((n) => ({ id: `${s}${n}`, name: `Prof ${s} ${n}`, max: 21 * 60 })));
    const data = makeData({
      classes,
      subjects: subj.map((s) => ({ id: s, name: s.toUpperCase(), coefficient: s === 'math' || s === 'fr' ? 4 : 1 })),
      teachers,
      rooms: [...Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `Salle ${i}` })), { id: 'lab', name: 'Labo SVT', subjectIds: ['svt'] }, { id: 'lab2', name: 'Labo PC', subjectIds: ['pc'] }, { id: 'gym', name: 'Terrain', subjectIds: ['eps'] }],
      qualifications: teachers.flatMap((t) => levels.map((level) => ({ teacherId: t.id, subjectId: t.id.replace(/\d$/, ''), level, classId: null }))),
      volumes: levels.flatMap((level) => subj.map((s) => ({ level, subjectId: s, hours: hours[s], maxSession: 120, coefficient: null }))),
    });
    const result = generateTimetable(data, [], { classIds: classes.map((c) => c.id), improveMs: 500 });
    expect(result.stats.ms).toBeLessThan(15_000);
    expect(result.stats.placedHours / result.stats.requiredHours).toBeGreaterThan(0.95);
    expectValid(data, [], result.lessons);
  });
});
