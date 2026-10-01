import { detectAllConflicts, findConflicts, GridSettings, hasBlockingConflict, NameLookup, SlotLike, validateSlot } from './conflicts';
import { overlaps, parseDays, parseRanges } from './time';

const names: NameLookup = {
  className: (id) => ({ c1: '6e A', c2: '5e B' })[id] ?? id,
  teacherName: (id) => ({ t1: 'Kouassi Aya', t2: 'Diallo Yacouba' })[id] ?? id,
  roomName: (id) => ({ r1: 'Salle 12', r2: 'Labo' })[id] ?? id,
};

const settings: GridSettings = { days: [1, 2, 3, 4, 5], start: '07:30', end: '17:00', breaks: [{ start: '12:00', end: '14:00' }] };

const slot = (over: Partial<SlotLike>): SlotLike => ({
  id: 's',
  classId: 'c1',
  teacherId: 't1',
  roomId: 'r1',
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '10:00',
  ...over,
});

describe('time helpers', () => {
  it('treats intervals as half-open', () => {
    expect(overlaps('08:00', '10:00', '10:00', '11:00')).toBe(false);
    expect(overlaps('08:00', '10:00', '09:59', '11:00')).toBe(true);
  });

  it('parses ranges and days defensively', () => {
    expect(parseRanges('12:00-14:00, 10:00 - 10:15, bad, 15:00-14:00')).toEqual([
      { start: '12:00', end: '14:00' },
      { start: '10:00', end: '10:15' },
    ]);
    expect(parseDays('5,1,1,9,x,3')).toEqual([1, 3, 5]);
  });
});

describe('validateSlot', () => {
  it('rejects reversed or malformed times', () => {
    expect(validateSlot(slot({ startTime: '10:00', endTime: '09:00' }))[0].kind).toBe('INVALID');
    expect(validateSlot(slot({ startTime: '8h', endTime: '09:00' }))[0].kind).toBe('INVALID');
    expect(validateSlot(slot({ dayOfWeek: 8 }))[0].kind).toBe('INVALID');
  });

  it('warns (without blocking) about closed days, school hours and breaks', () => {
    const issues = validateSlot(slot({ dayOfWeek: 6, startTime: '11:00', endTime: '18:00' }), settings);
    expect(issues.map((i) => i.kind).sort()).toEqual(['BREAK', 'CLOSED_DAY', 'OUTSIDE_HOURS']);
    expect(hasBlockingConflict(issues)).toBe(false);
  });

  it('accepts a normal lesson', () => {
    expect(validateSlot(slot({}), settings)).toEqual([]);
  });
});

describe('findConflicts', () => {
  it('detects busy teacher, room and class with readable messages', () => {
    const other = slot({ id: 'o', classId: 'c2', startTime: '09:00', endTime: '11:00' });
    const conflicts = findConflicts(slot({ classId: 'c1' }), [other], names);
    expect(conflicts.map((c) => c.kind).sort()).toEqual(['ROOM', 'TEACHER']);
    expect(conflicts.find((c) => c.kind === 'TEACHER')!.message).toBe('Kouassi Aya enseigne déjà en 5e B Lundi 09:00–11:00');
    expect(conflicts.find((c) => c.kind === 'ROOM')!.message).toContain('Salle 12 est déjà occupée par 5e B');
  });

  it('detects a class double-booked with other resources', () => {
    const other = slot({ id: 'o', teacherId: 't2', roomId: 'r2' });
    expect(findConflicts(slot({}), [other], names).map((c) => c.kind)).toEqual(['CLASS']);
  });

  it('ignores the session itself, other days, adjacent slots and different terms', () => {
    const self = slot({ id: 's' });
    expect(findConflicts(self, [self], names)).toEqual([]);
    expect(findConflicts(self, [slot({ id: 'o', dayOfWeek: 2 })], names)).toEqual([]);
    expect(findConflicts(self, [slot({ id: 'o', startTime: '10:00', endTime: '11:00' })], names)).toEqual([]);
    expect(findConflicts(slot({ termId: 'T1' }), [slot({ id: 'o', termId: 'T2' })], names)).toEqual([]);
  });

  it('considers a whole-year session as clashing with any term', () => {
    expect(findConflicts(slot({ termId: 'T1' }), [slot({ id: 'o', termId: null, classId: 'c2', roomId: null })], names)).toHaveLength(1);
  });

  it('does not treat missing teachers or rooms as shared resources', () => {
    const a = slot({ teacherId: null, roomId: null });
    const b = slot({ id: 'o', classId: 'c2', teacherId: null, roomId: null });
    expect(findConflicts(a, [b], names)).toEqual([]);
  });
});

describe('detectAllConflicts', () => {
  it('flags both sessions of a clash and leaves the others alone', () => {
    const sessions = [
      slot({ id: 'a', classId: 'c1', startTime: '08:00', endTime: '10:00' }),
      slot({ id: 'b', classId: 'c2', startTime: '09:00', endTime: '10:00' }), // same teacher and room
      slot({ id: 'c', classId: 'c2', teacherId: 't2', roomId: 'r2', startTime: '10:00', endTime: '11:00' }),
    ];
    const result = detectAllConflicts(sessions, names, settings);
    expect(result.get('a')!.map((c) => c.otherSessionId)).toEqual(['b', 'b']);
    expect(result.get('b')!.map((c) => c.kind).sort()).toEqual(['ROOM', 'TEACHER']);
    expect(result.has('c')).toBe(false);
  });

  it('scales to a full school week', () => {
    const sessions: SlotLike[] = [];
    for (let c = 0; c < 40; c++)
      for (let d = 1; d <= 5; d++)
        for (let h = 8; h < 16; h++)
          sessions.push({ id: `${c}-${d}-${h}`, classId: `c${c}`, teacherId: `t${c}`, roomId: `r${c}`, dayOfWeek: d, startTime: `${String(h).padStart(2, '0')}:00`, endTime: `${String(h + 1).padStart(2, '0')}:00` });
    const started = Date.now();
    expect(detectAllConflicts(sessions, names).size).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
