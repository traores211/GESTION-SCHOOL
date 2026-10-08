import { YearGrid } from './grid';
import { PlanningData, Qualification, TimeWindow, mergeWindows, volumeKey } from './rules';

/** Small school used by the rules and generator tests. */
export function makeGrid(overrides: Partial<YearGrid> = {}): YearGrid {
  return {
    days: [1, 2, 3, 4, 5],
    start: '08:00',
    end: '17:00',
    slotMinutes: 60,
    breaks: [
      { start: '10:00', end: '10:15' },
      { start: '12:15', end: '14:00' },
    ],
    freeHalfDays: [{ day: 3, half: 'PM' }],
    halfDaySplit: '12:15',
    maxClassMinutesPerDay: null,
    maxTeacherMinutesPerDay: null,
    ...overrides,
  };
}

export interface FixtureInput {
  grid?: Partial<YearGrid>;
  classes?: { id: string; name: string; level: string }[];
  subjects?: { id: string; name: string; coefficient?: number }[];
  teachers?: { id: string; name: string; max?: number | null }[];
  rooms?: { id: string; name: string; subjectIds?: string[] }[];
  qualifications?: Qualification[];
  availability?: Record<string, TimeWindow[]>;
  volumes?: { level: string; subjectId: string; hours: number; maxSession?: number | null; coefficient?: number | null }[];
}

export function makeData(input: FixtureInput = {}): PlanningData {
  const classes = input.classes ?? [
    { id: 'c6a', name: '6e A', level: '6ème' },
    { id: 'c6b', name: '6e B', level: '6ème' },
  ];
  const subjects = input.subjects ?? [
    { id: 'math', name: 'Mathématiques', coefficient: 4 },
    { id: 'fr', name: 'Français', coefficient: 3 },
    { id: 'svt', name: 'SVT', coefficient: 2 },
  ];
  const teachers = input.teachers ?? [
    { id: 'kouassi', name: 'M. KOUASSI', max: 18 * 60 },
    { id: 'traore', name: 'Mme TRAORÉ', max: 18 * 60 },
    { id: 'bamba', name: 'M. BAMBA', max: null },
  ];
  const rooms = input.rooms ?? [
    { id: 's1', name: 'Salle 1' },
    { id: 's2', name: 'Salle 2' },
    { id: 'lab', name: 'Labo SVT', subjectIds: ['svt'] },
  ];
  const qualifications = input.qualifications ?? [
    { teacherId: 'kouassi', subjectId: 'math', level: '6ème', classId: null },
    { teacherId: 'traore', subjectId: 'fr', level: '6ème', classId: null },
    { teacherId: 'bamba', subjectId: 'svt', level: '6ème', classId: null },
  ];
  const volumes = input.volumes ?? [
    { level: '6ème', subjectId: 'math', hours: 4, maxSession: 120, coefficient: 4 },
    { level: '6ème', subjectId: 'fr', hours: 4, maxSession: 120, coefficient: 3 },
    { level: '6ème', subjectId: 'svt', hours: 2, maxSession: 120, coefficient: 2 },
  ];
  return {
    grid: makeGrid(input.grid),
    classes: new Map(classes.map((c) => [c.id, c])),
    subjects: new Map(subjects.map((s) => [s.id, { ...s, coefficient: s.coefficient ?? 1 }])),
    teachers: new Map(teachers.map((t) => [t.id, { id: t.id, name: t.name, weeklyMaxMinutes: t.max ?? null }])),
    rooms: new Map(rooms.map((r) => [r.id, { ...r, subjectIds: r.subjectIds ?? [] }])),
    qualifications,
    availability: new Map(Object.entries(input.availability ?? {}).map(([k, v]) => [k, mergeWindows(v)])),
    volumes: new Map(
      volumes.map((v) => [volumeKey(v.level, v.subjectId), { minutesPerWeek: v.hours * 60, maxSessionMinutes: v.maxSession ?? null, coefficient: v.coefficient ?? null }]),
    ),
  };
}
