/**
 * Demo planning data for DEMO-001 (7 levels, 14 classes, 21 teachers): a 55-minute grid with recess,
 * lunch and a free Wednesday afternoon, official volumes per level, teacher staff numbers, loads,
 * qualifications and availabilities (a few part-time teachers), specialised rooms, then a generated
 * timetable for every class. Idempotent unless `--force` is passed (it then replaces the timetable).
 * Standalone: `npx ts-node prisma/seed-planning.ts [--force]`; also called at the end of the main seed.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { generateTimetable } from '../src/timetable/domain/generator';
import { gridFromStrings, formatHours } from '../src/timetable/domain/grid';
import { mergeWindows, volumeKey, PlanningData } from '../src/timetable/domain/rules';

const GRID = {
  days: '1,2,3,4,5',
  start: '07:30',
  end: '17:30',
  slotMinutes: 55,
  breaks: '09:20-09:35,12:20-14:30',
  freeHalfDays: '3:PM',
  halfDaySplit: '12:20',
  maxClassMinutesPerDay: 7 * 55,
  maxTeacherMinutesPerDay: 6 * 55,
};

const COLLEGE = ['6ème', '5ème', '4ème', '3ème'];
const LYCEE = ['2nde', '1ère'];

/** [hours, max session hours, coefficient] per subject code and level. */
function volumesFor(level: string): Record<string, [number, number, number]> {
  if (COLLEGE.includes(level)) {
    const upper = level === '4ème' || level === '3ème';
    return {
      FR: [5, 2, 4],
      MATH: [4, 2, 4],
      ANG: [3, 2, 2],
      HG: [3, 2, 2],
      // 1-hour lab sessions in middle school leave the 2-hour lab slots to the lycée.
      SVT: [2, 1, 2],
      ...(upper ? { PC: [2, 1, 2] as [number, number, number] } : {}),
      EPS: [2, 2, 1],
      EDHC: [1, 1, 1],
    };
  }
  if (LYCEE.includes(level)) {
    return {
      FR: [4, 2, 3],
      MATH: [5, 2, 4],
      ANG: [3, 2, 2],
      HG: [3, 2, 2],
      SVT: [2, 2, 2],
      PC: [4, 2, 3],
      EPS: [2, 2, 1],
      EDHC: [1, 1, 1],
      ...(level === '1ère' ? { PHILO: [2, 2, 2] as [number, number, number] } : {}),
    };
  }
  // Terminale
  return { PHILO: [4, 2, 3], FR: [3, 2, 2], MATH: [5, 2, 5], ANG: [3, 2, 2], HG: [3, 2, 2], SVT: [2, 2, 2], PC: [4, 2, 4], EPS: [2, 2, 1] };
}

/** Part-time teachers (by last name + first name): days they come, and their load. */
const PART_TIME: Record<string, { days: number[]; mornings?: boolean; max: number }> = {
  'Dosso Kadiatou': { days: [1, 2, 4], max: 10 },
  'Guéi Clarisse': { days: [1, 2, 3, 4, 5], mornings: true, max: 14 },
  'Yao Josiane': { days: [2, 3, 4, 5], max: 14 },
  'Sangaré Larissa': { days: [1, 3, 5], max: 8 },
};

export async function seedPlanning(prisma: PrismaClient, force = false) {
  const school = await prisma.school.findFirst({ where: { code: 'DEMO-001' } });
  if (!school) return;
  const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true } });
  if (!year) return;
  if (!force && (await prisma.officialVolume.count({ where: { academicYearId: year.id } }))) {
    console.log('Planning already present: skipped');
    return;
  }

  // ---------- grid
  await prisma.timetableGrid.upsert({ where: { academicYearId: year.id }, update: GRID, create: { ...GRID, academicYearId: year.id } });

  // ---------- subjects, classes
  const subjects = await prisma.subject.findMany({ where: { schoolId: school.id } });
  const byCode = new Map(subjects.map((s) => [s.code, s]));
  const classes = await prisma.class.findMany({ where: { academicYearId: year.id }, include: { classSubjects: true }, orderBy: [{ level: 'asc' }, { name: 'asc' }] });
  const levels = [...new Set(classes.map((c) => c.level))];

  // ---------- official volumes
  await prisma.officialVolume.deleteMany({ where: { academicYearId: year.id } });
  const volumeRows = levels.flatMap((level) =>
    Object.entries(volumesFor(level))
      .filter(([code]) => byCode.has(code))
      .map(([code, [hours, max, coef]]) => ({
        schoolId: school.id,
        academicYearId: year.id,
        level,
        subjectId: byCode.get(code)!.id,
        minutesPerWeek: hours * 60,
        maxSessionMinutes: max * 60,
        coefficient: coef,
      })),
  );
  await prisma.officialVolume.createMany({ data: volumeRows });

  // ---------- rooms (ordinary + specialised)
  const room = async (name: string, type: string, capacity: number, subjectCodes: string[] = []) => {
    const ids = subjectCodes.map((c) => byCode.get(c)?.id).filter((x): x is string => !!x).map((id) => ({ id }));
    return prisma.room.upsert({
      where: { schoolId_name: { schoolId: school.id, name } },
      update: { type, capacity, subjects: { set: ids } },
      create: { schoolId: school.id, name, type, capacity, subjects: { connect: ids } },
    });
  };
  for (let i = 1; i <= classes.length; i++) await room(`Salle ${i}`, 'Salle de classe', 50);
  await room('Labo SVT', 'Laboratoire', 30, ['SVT']);
  await room('Labo Physique-Chimie', 'Laboratoire', 30, ['PC']);
  await room('Terrain de sport', 'Terrain', 200, ['EPS']);
  await room('Plateau EPS', 'Terrain', 120, ['EPS']);

  // ---------- teachers: staff numbers, loads, qualifications, availability
  const teachers = await prisma.staffMember.findMany({
    where: { user: { schoolId: school.id, role: 'ENSEIGNANT' } },
    include: { user: { select: { firstName: true, lastName: true } }, classSubjects: { include: { subject: true, class: true } } },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
  });
  await prisma.teacherQualification.deleteMany({ where: { staffMemberId: { in: teachers.map((t) => t.id) } } });
  await prisma.teacherAvailability.deleteMany({ where: { academicYearId: year.id, staffMemberId: { in: teachers.map((t) => t.id) } } });

  const volumeLevels = new Map<string, string[]>();
  for (const v of volumeRows) volumeLevels.set(v.subjectId, [...(volumeLevels.get(v.subjectId) ?? []), v.level]);

  const qualifications: { staffMemberId: string; subjectId: string; level: string; classId: null }[] = [];
  const availability: { staffMemberId: string; academicYearId: string; dayOfWeek: number; startTime: string; endTime: string }[] = [];
  for (const [i, t] of teachers.entries()) {
    const key = `${t.user.lastName} ${t.user.firstName}`;
    const part = PART_TIME[key];
    // Main subject = the one named in the position; teachers keep the other subjects they teach today
    // only for the levels where they teach them.
    const main = subjects.find((s) => t.position.toLowerCase().includes(s.name.toLowerCase()));
    const mainLevels = main ? volumeLevels.get(main.id) ?? [] : [];
    const isMathsCollege = key === 'Aya Kouassi';
    for (const level of mainLevels) {
      if (isMathsCollege && !COLLEGE.includes(level)) continue;
      qualifications.push({ staffMemberId: t.id, subjectId: main!.id, level, classId: null });
    }
    for (const cs of t.classSubjects) {
      if (cs.subjectId === main?.id) continue;
      if (!qualifications.some((q) => q.staffMemberId === t.id && q.subjectId === cs.subjectId && q.level === cs.class.level)) {
        qualifications.push({ staffMemberId: t.id, subjectId: cs.subjectId, level: cs.class.level, classId: null });
      }
    }
    const days = part?.days ?? [1, 2, 3, 4, 5];
    for (const day of days) {
      availability.push({ staffMemberId: t.id, academicYearId: year.id, dayOfWeek: day, startTime: '07:30', endTime: '12:20' });
      if (!part?.mornings && day !== 3) availability.push({ staffMemberId: t.id, academicYearId: year.id, dayOfWeek: day, startTime: '14:30', endTime: '17:30' });
    }
    // Service of 21 h; 24 h (with overtime) in the subjects with the biggest volumes.
    const heavy = main && ['MATH', 'FR', 'HG'].includes(main.code);
    await prisma.staffMember.update({
      where: { id: t.id },
      data: { matricule: `ENS-${String(i + 1).padStart(3, '0')}`, weeklyMaxMinutes: (part?.max ?? (heavy ? 24 : 21)) * 60 },
    });
  }
  await prisma.teacherQualification.createMany({ data: qualifications });
  await prisma.teacherAvailability.createMany({ data: availability });

  // ---------- generate the whole timetable (replaces the old demo week)
  await prisma.timetableSession.deleteMany({ where: { schoolId: school.id, academicYearId: year.id } });
  await prisma.timetableChange.deleteMany({ where: { schoolId: school.id, academicYearId: year.id } });
  const rooms = await prisma.room.findMany({ where: { schoolId: school.id }, include: { subjects: { select: { id: true } } } });
  const windows = new Map<string, { day: number; start: string; end: string }[]>();
  for (const a of availability) windows.set(a.staffMemberId, [...(windows.get(a.staffMemberId) ?? []), { day: a.dayOfWeek, start: a.startTime, end: a.endTime }]);
  const staff = await prisma.staffMember.findMany({ where: { id: { in: teachers.map((t) => t.id) } }, include: { user: true } });
  const data: PlanningData = {
    grid: gridFromStrings(GRID),
    classes: new Map(classes.map((c) => [c.id, { id: c.id, name: c.name, level: c.level }])),
    subjects: new Map(subjects.map((s) => [s.id, { id: s.id, name: s.name, coefficient: s.coefficient }])),
    teachers: new Map(staff.map((t) => [t.id, { id: t.id, name: `${t.user.firstName} ${t.user.lastName}`, weeklyMaxMinutes: t.weeklyMaxMinutes }])),
    rooms: new Map(rooms.map((r) => [r.id, { id: r.id, name: r.name, subjectIds: r.subjects.map((s) => s.id) }])),
    qualifications: qualifications.map((q) => ({ teacherId: q.staffMemberId, subjectId: q.subjectId, level: q.level, classId: null })),
    availability: new Map([...windows].map(([k, v]) => [k, mergeWindows(v)])),
    volumes: new Map(volumeRows.map((v) => [volumeKey(v.level, v.subjectId), { minutesPerWeek: v.minutesPerWeek, maxSessionMinutes: v.maxSessionMinutes, coefficient: v.coefficient }])),
  };
  const preferred = new Map(classes.flatMap((c) => c.classSubjects.filter((cs) => cs.teacherId).map((cs) => [`${c.id}|${cs.subjectId}`, cs.teacherId!] as [string, string])));
  const result = generateTimetable(data, [], { classIds: classes.map((c) => c.id), preferredTeachers: preferred, timeLimitMs: 15_000, improveMs: 4_000 });
  await prisma.timetableSession.createMany({
    data: result.lessons.map((l) => ({ id: randomUUID(), ...l, schoolId: school.id, academicYearId: year.id })),
  });
  // Two locked lessons show the feature (kept by later generations).
  const firstClass = classes[0];
  const toLock = await prisma.timetableSession.findMany({ where: { classId: firstClass.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }], take: 2 });
  await prisma.timetableSession.updateMany({ where: { id: { in: toLock.map((s) => s.id) } }, data: { locked: true } });

  console.log(
    `Planning: ${volumeRows.length} volumes, ${qualifications.length} habilitations, ${availability.length} disponibilités · ` +
      `emploi du temps ${result.lessons.length} cours, ${formatHours(result.stats.placedHours)} / ${formatHours(result.stats.requiredHours)} ` +
      `(${result.stats.mode}, ${result.stats.ms} ms, score ${result.score.total})`,
  );
  for (const u of result.unplaced) console.log(`  non placé : ${u.message}`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedPlanning(prisma, process.argv.includes('--force'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
