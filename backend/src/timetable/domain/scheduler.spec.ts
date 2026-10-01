import { findConflicts, SlotLike } from './conflicts';
import { scheduleRequirements } from './scheduler';

const settings = { days: [1, 2, 3, 4, 5], start: '08:00', end: '12:00', breaks: [{ start: '10:00', end: '10:30' }], slotMinutes: 30 };
const names = { className: (id: string) => id, teacherName: (id: string) => id, roomName: (id: string) => id };

describe('scheduleRequirements', () => {
  it('places volumes in blocks, spread over different days, avoiding breaks', () => {
    const { placed, unplaced } = scheduleRequirements([{ key: 'maths', classId: 'c1', teacherId: 't1', minutesPerWeek: 180 }], [], settings);
    expect(unplaced).toEqual([]);
    expect(placed.map((p) => p.endTime > p.startTime)).toEqual([true, true]);
    expect(placed.reduce((s, p) => s + (Number(p.endTime.slice(0, 2)) * 60 + Number(p.endTime.slice(3)) - Number(p.startTime.slice(0, 2)) * 60 - Number(p.startTime.slice(3))), 0)).toBe(180);
    expect(new Set(placed.map((p) => p.dayOfWeek)).size).toBe(2);
    for (const p of placed) expect(p.startTime >= '10:30' || p.endTime <= '10:00').toBe(true);
  });

  it('never creates a conflict with existing sessions or with itself', () => {
    const existing: SlotLike[] = [1, 2, 3, 4, 5].map((d) => ({ id: `e${d}`, classId: 'c2', teacherId: 't1', dayOfWeek: d, startTime: '08:00', endTime: '10:00' }));
    const { placed } = scheduleRequirements(
      [
        { key: 'a', classId: 'c1', teacherId: 't1', minutesPerWeek: 120 },
        { key: 'b', classId: 'c1', teacherId: 't2', roomId: 'r1', minutesPerWeek: 240 },
        { key: 'c', classId: 'c3', teacherId: 't2', roomId: 'r1', minutesPerWeek: 60 },
      ],
      existing,
      settings,
    );
    const all = [...existing, ...placed.map((p, i) => ({ ...p, id: `p${i}` }))];
    for (const s of all) expect(findConflicts(s, all, names)).toEqual([]);
  });

  it('reports what cannot fit instead of forcing it', () => {
    const { placed, unplaced } = scheduleRequirements([{ key: 'x', classId: 'c1', minutesPerWeek: 60 * 30 }], [], settings);
    expect(placed.length).toBeGreaterThan(0);
    expect(unplaced.length).toBeGreaterThan(0);
    expect(unplaced[0].reason).toMatch(/Aucun créneau libre/);
  });

  it('is deterministic', () => {
    const reqs = [
      { key: 'a', classId: 'c1', teacherId: 't1', minutesPerWeek: 120 },
      { key: 'b', classId: 'c1', teacherId: 't2', minutesPerWeek: 90 },
    ];
    expect(scheduleRequirements(reqs, [], settings)).toEqual(scheduleRequirements(reqs, [], settings));
  });
});
