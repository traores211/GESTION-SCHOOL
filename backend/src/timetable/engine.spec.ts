import { generate, validate, Grid } from './engine';

const grid: Grid = { days: [1, 2, 3, 4, 5], periodsPerDay: 6 };

describe('timetable engine', () => {
  const classes = [
    { classId: '6A', demands: [
      { subjectId: 'MATH', teacherId: 'T1', hours: 5 },
      { subjectId: 'FR', teacherId: 'T2', hours: 5 },
      { subjectId: 'ANG', teacherId: 'T3', hours: 3 },
    ] },
    { classId: '5A', demands: [
      { subjectId: 'MATH', teacherId: 'T1', hours: 5 },
      { subjectId: 'FR', teacherId: 'T2', hours: 4 },
    ] },
  ];

  it('places every requested hour without any hard conflict', () => {
    const { entries, unplaced } = generate({ grid, classes, rooms: ['R1', 'R2'] });
    expect(unplaced).toEqual([]);
    expect(entries).toHaveLength(22);
    const errors = validate({ grid, entries, demands: classes }).filter((c) => c.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('never books a teacher in two classes at the same time', () => {
    const { entries } = generate({ grid, classes });
    const seen = new Set<string>();
    for (const e of entries.filter((x) => x.teacherId)) {
      const k = `${e.teacherId}|${e.day}|${e.period}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('respects teacher unavailability and blocked slots', () => {
    const unavailable = { T1: [1, 2, 3, 4, 5, 6].map((period) => ({ day: 1, period })) };
    const blockedSlots = [4, 5, 6].map((period) => ({ day: 3, period }));
    const { entries } = generate({ grid, classes, unavailable, constraints: { blockedSlots } });
    expect(entries.some((e) => e.teacherId === 'T1' && e.day === 1)).toBe(false);
    expect(entries.some((e) => e.day === 3 && e.period >= 4)).toBe(false);
  });

  it('reports unplaceable hours instead of inventing slots', () => {
    const tiny: Grid = { days: [1], periodsPerDay: 2 };
    const { unplaced } = generate({ grid: tiny, classes: [{ classId: 'X', demands: [{ subjectId: 'MATH', teacherId: 'T1', hours: 5 }] }] });
    expect(unplaced).toEqual([{ classId: 'X', subjectId: 'MATH', missing: 3 }]);
  });

  it('detects every conflict type in a hand-edited timetable', () => {
    const entries = [
      { classId: '6A', day: 1, period: 1, subjectId: 'MATH', teacherId: 'T1', roomId: 'R1' },
      { classId: '5A', day: 1, period: 1, subjectId: 'MATH', teacherId: 'T1', roomId: 'R1' }, // teacher + room clash
      { classId: '6A', day: 1, period: 1, subjectId: 'FR', teacherId: 'T2', roomId: null }, // class overlap
      { classId: '6A', day: 7, period: 1, subjectId: 'FR', teacherId: 'T2', roomId: null }, // invalid day
      { classId: '6A', day: 2, period: 2, subjectId: 'ANG', teacherId: 'T3', roomId: null }, // unavailable
    ];
    const types = validate({
      grid,
      entries,
      demands: [{ classId: '6A', demands: [{ subjectId: 'MATH', teacherId: 'T1', hours: 3 }] }],
      unavailable: { T3: [{ day: 2, period: 2 }] },
    }).map((c) => c.type);
    expect(types).toEqual(
      expect.arrayContaining(['TEACHER_DOUBLE_BOOKED', 'ROOM_DOUBLE_BOOKED', 'CLASS_OVERLAP', 'INVALID_SLOT', 'TEACHER_UNAVAILABLE', 'INSUFFICIENT_HOURS']),
    );
  });

  it('keeps already published timetables of other classes untouched (fixed slots)', () => {
    const fixed = [{ classId: '4A', day: 1, period: 1, subjectId: 'MATH', teacherId: 'T1', roomId: null }];
    const { entries } = generate({ grid, classes: [classes[0]], fixed });
    expect(entries.some((e) => e.teacherId === 'T1' && e.day === 1 && e.period === 1)).toBe(false);
  });
});
