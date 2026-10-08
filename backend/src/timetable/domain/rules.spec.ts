import { buildPeriods, gapMinutes, gridIssue, hourUnit, lessonHours, parseHalfDays } from './grid';
import { StoredLesson, checkLesson, isAvailable, isQualified, mergeWindows, roomMismatch } from './rules';
import { makeData, makeGrid } from './planning.fixtures';

const lesson = (over: Partial<StoredLesson> = {}): StoredLesson => ({
  id: 'new',
  classId: 'c6a',
  subjectId: 'math',
  teacherId: 'kouassi',
  roomId: 's1',
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '09:00',
  ...over,
});

const status = (report: ReturnType<typeof checkLesson>, id: string) => report.checks.find((c) => c.id === id)!;

describe('grid', () => {
  it('builds periods that restart after breaks and skip free half-days', () => {
    const periods = buildPeriods(makeGrid());
    expect(periods.get(1)!.map((p) => p.start)).toEqual(['08:00', '09:00', '10:15', '11:15', '14:00', '15:00', '16:00']);
    // Wednesday afternoon is free.
    expect(periods.get(3)!.map((p) => p.start)).toEqual(['08:00', '09:00', '10:15', '11:15']);
  });

  it('flags closed days, hours, breaks and free half-days', () => {
    const grid = makeGrid();
    expect(gridIssue(6, '08:00', '09:00', grid)).toMatch(/pas un jour de cours/);
    expect(gridIssue(1, '07:00', '08:00', grid)).toMatch(/En dehors/);
    expect(gridIssue(1, '09:30', '10:30', grid)).toMatch(/pause 10:00/);
    expect(gridIssue(3, '14:00', '15:00', grid)).toMatch(/demi-journée libre/);
    expect(gridIssue(1, '09:00', '08:00', grid)).toMatch(/fin doit être après/);
    expect(gridIssue(1, '08:00', '09:00', grid)).toBeNull();
  });

  it('counts a 55 min period as one official hour', () => {
    expect(hourUnit({ slotMinutes: 55 })).toBe(55);
    expect(lessonHours('08:00', '09:50', { slotMinutes: 55 })).toBe(2);
    expect(lessonHours('08:00', '09:30', { slotMinutes: 30 })).toBe(1.5);
  });

  it('parses half-days and measures gaps without counting breaks', () => {
    expect(parseHalfDays('3:pm, 6:AM, 3:PM, 9:PM')).toEqual([{ day: 3, half: 'PM' }, { day: 6, half: 'AM' }]);
    const grid = makeGrid();
    expect(gapMinutes([{ startTime: '08:00', endTime: '09:00' }, { startTime: '11:15', endTime: '12:15' }], grid)).toBe(135 - 15);
    expect(gapMinutes([{ startTime: '11:15', endTime: '12:15' }, { startTime: '14:00', endTime: '15:00' }], grid)).toBe(0);
  });
});

describe('primitive rules', () => {
  const data = makeData({ availability: { kouassi: [{ day: 1, start: '08:00', end: '10:00' }, { day: 1, start: '10:00', end: '12:15' }] } });

  it('merges touching availability windows', () => {
    expect(mergeWindows([{ day: 1, start: '10:00', end: '12:00' }, { day: 1, start: '08:00', end: '10:00' }])).toEqual([{ day: 1, start: '08:00', end: '12:00' }]);
    expect(isAvailable(data, 'kouassi', 1, '09:00', '11:00')).toBe(true);
    expect(isAvailable(data, 'kouassi', 2, '09:00', '10:00')).toBe(false);
    expect(isAvailable(data, 'traore', 4, '15:00', '16:00')).toBe(true); // no window declared = no restriction
  });

  it('accepts a qualification by level or by class only', () => {
    const d = makeData({ qualifications: [{ teacherId: 'kouassi', subjectId: 'math', level: '6ème', classId: 'c6b' }] });
    expect(isQualified(d, 'kouassi', 'math', 'c6b')).toBe(true);
    expect(isQualified(d, 'kouassi', 'math', 'c6a')).toBe(false);
    expect(isQualified(data, 'kouassi', 'fr', 'c6a')).toBe(false);
  });

  it('keeps specialised rooms for their subjects and their subjects in them', () => {
    expect(roomMismatch(data, 'lab', 'math')).toMatch(/réservée à : SVT/);
    expect(roomMismatch(data, 's1', 'svt')).toMatch(/doit avoir lieu en Labo SVT/);
    expect(roomMismatch(data, 'lab', 'svt')).toBeNull();
    expect(roomMismatch(data, 's1', 'math')).toBeNull();
  });
});

describe('checkLesson', () => {
  const data = makeData();

  it('passes every check for a valid lesson and reports the planned volume', () => {
    const report = checkLesson(lesson(), data, []);
    expect(report.ok).toBe(true);
    expect(status(report, 'CLASS_VOLUME')).toMatchObject({ status: 'ok', detail: '1h planifiées / 4h officielles' });
    expect(status(report, 'TEACHER_MAX')).toMatchObject({ status: 'ok', detail: '1h / 18h par semaine' });
  });

  it('refuses an unqualified teacher', () => {
    const report = checkLesson(lesson({ teacherId: 'traore' }), data, []);
    expect(report.ok).toBe(false);
    expect(status(report, 'QUALIFIED').detail).toMatch(/Mme TRAORÉ n'est pas habilité\(e\) à enseigner Mathématiques en 6ème/);
  });

  it('refuses a slot outside the teacher availability', () => {
    const d = makeData({ availability: { kouassi: [{ day: 2, start: '08:00', end: '12:15' }] } });
    const report = checkLesson(lesson(), d, []);
    expect(status(report, 'AVAILABLE')).toMatchObject({ status: 'fail' });
    expect(status(report, 'AVAILABLE').detail).toMatch(/aucune disponibilité le lundi/);
  });

  it('detects teacher, class and room double bookings', () => {
    const existing: StoredLesson[] = [
      lesson({ id: 'a', classId: 'c6b', roomId: 's2' }), // same teacher
      lesson({ id: 'b', subjectId: 'fr', teacherId: 'traore', roomId: 's2', startTime: '08:30', endTime: '09:30' }), // same class
      lesson({ id: 'c', classId: 'c6b', subjectId: 'fr', teacherId: 'traore', roomId: 's1' }), // same room
    ];
    const report = checkLesson(lesson(), data, existing);
    expect(status(report, 'TEACHER_FREE').detail).toMatch(/M. KOUASSI a déjà cours en 6e B Lundi 08:00–09:00/);
    expect(status(report, 'CLASS_FREE').detail).toMatch(/6e A a déjà Français/);
    expect(status(report, 'ROOM').detail).toMatch(/Salle 1 est occupée par 6e B/);
  });

  it('ignores the lesson itself when it is being moved', () => {
    const report = checkLesson(lesson({ id: 'a', startTime: '09:00', endTime: '10:00' }), data, [lesson({ id: 'a' })]);
    expect(report.ok).toBe(true);
  });

  it('lessons of different terms never collide', () => {
    const report = checkLesson(lesson({ termId: 't1' }), data, [lesson({ id: 'x', classId: 'c6b', termId: 't2' })]);
    expect(status(report, 'TEACHER_FREE').status).toBe('ok');
  });

  it('refuses to exceed the official weekly volume', () => {
    const existing = [1, 2, 4].map((day, i) => lesson({ id: `m${i}`, dayOfWeek: day }));
    const ok = checkLesson(lesson({ dayOfWeek: 5 }), data, existing);
    expect(status(ok, 'CLASS_VOLUME')).toMatchObject({ status: 'ok', detail: '4h planifiées / 4h officielles' });
    const over = checkLesson(lesson({ dayOfWeek: 5, startTime: '08:00', endTime: '10:00' }), data, existing);
    expect(status(over, 'CLASS_VOLUME')).toMatchObject({ status: 'fail', detail: '5h planifiées / 4h officielles' });
  });

  it("refuses to exceed the teacher's weekly maximum", () => {
    const d = makeData({ teachers: [{ id: 'kouassi', name: 'M. KOUASSI', max: 120 }, { id: 'traore', name: 'Mme TRAORÉ' }, { id: 'bamba', name: 'M. BAMBA' }] });
    const report = checkLesson(lesson({ startTime: '08:00', endTime: '10:00' }), d, [lesson({ id: 'x', classId: 'c6b', dayOfWeek: 2 })]);
    expect(status(report, 'TEACHER_MAX')).toMatchObject({ status: 'fail', detail: '3h / 2h par semaine' });
  });

  it('refuses breaks and free half-days', () => {
    expect(status(checkLesson(lesson({ dayOfWeek: 3, startTime: '14:00', endTime: '15:00' }), data, []), 'GRID').status).toBe('fail');
    expect(status(checkLesson(lesson({ startTime: '09:30', endTime: '10:30' }), data, []), 'GRID').status).toBe('fail');
  });

  it('requires the specialised room of a subject', () => {
    const report = checkLesson(lesson({ subjectId: 'svt', teacherId: 'bamba', roomId: null }), data, []);
    expect(status(report, 'ROOM')).toMatchObject({ status: 'fail' });
  });

  it('enforces the daily maximums', () => {
    const d = makeData({ grid: { maxClassMinutesPerDay: 120 } });
    const report = checkLesson(lesson({ startTime: '10:15', endTime: '11:15' }), d, [lesson({ id: 'x', subjectId: 'fr', teacherId: 'traore', startTime: '08:00', endTime: '10:00' })]);
    expect(status(report, 'DAY_MAX')).toMatchObject({ status: 'fail' });
  });

  it('marks checks without a teacher as not applicable instead of failing', () => {
    const report = checkLesson(lesson({ teacherId: null }), data, []);
    expect(['QUALIFIED', 'AVAILABLE', 'TEACHER_FREE', 'TEACHER_MAX'].map((id) => status(report, id).status)).toEqual(['na', 'na', 'na', 'na']);
    expect(report.ok).toBe(true);
  });

  it('raises soft warnings without blocking', () => {
    const existing = [lesson({ id: 'x', startTime: '08:00', endTime: '09:00' })];
    const report = checkLesson(lesson({ startTime: '14:00', endTime: '17:00', roomId: 's2' }), data, existing);
    const ids = report.warnings.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(['SPREAD', 'SESSION_LENGTH', 'AFTERNOON']));
    const gap = checkLesson(lesson({ subjectId: 'fr', teacherId: 'traore', roomId: 's2', startTime: '11:15', endTime: '12:15' }), data, existing);
    expect(gap.warnings.find((w) => w.id === 'GAP')?.message).toMatch(/trou de 2h/);
  });
});
