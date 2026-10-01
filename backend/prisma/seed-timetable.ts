/**
 * Demo timetable: rooms, subject colours and a conflict-free week for every class of the current year,
 * built with the same scheduler as the import. Idempotent: does nothing if sessions already exist.
 * Standalone: `npm run seed:timetable`; also called at the end of the main seed.
 */
import { PrismaClient } from '@prisma/client';
import { Requirement, scheduleRequirements } from '../src/timetable/domain/scheduler';
import { parseDays, parseRanges } from '../src/timetable/domain/time';

const WEEKLY_HOURS: Record<string, number> = { MATH: 4, FR: 4, ANG: 3, SVT: 2, HG: 2, EPS: 2 };
const COLORS: Record<string, string> = { MATH: '#2563eb', FR: '#db2777', ANG: '#7c3aed', SVT: '#059669', HG: '#d97706', EPS: '#0891b2' };

export async function seedTimetable(prisma: PrismaClient) {
  const school = await prisma.school.findFirst({ where: { code: 'DEMO-001' } });
  if (!school) return;
  const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true } });
  if (!year) return;
  if (await prisma.timetableSession.count({ where: { schoolId: school.id, academicYearId: year.id } })) {
    console.log('Timetable already present: skipped');
    return;
  }

  const subjects = await prisma.subject.findMany({ where: { schoolId: school.id } });
  for (const s of subjects) if (!s.color && COLORS[s.code]) await prisma.subject.update({ where: { id: s.id }, data: { color: COLORS[s.code] } });

  const classes = await prisma.class.findMany({ where: { academicYearId: year.id }, include: { classSubjects: true }, orderBy: { name: 'asc' } });
  const room = (name: string, type: string, capacity: number) =>
    prisma.room.upsert({ where: { schoolId_name: { schoolId: school.id, name } }, update: {}, create: { schoolId: school.id, name, type, capacity } });
  const homeRooms = await Promise.all(classes.map((_, i) => room(`Salle ${i + 1}`, 'Salle de classe', 50)));
  const lab = await room('Labo SVT', 'Laboratoire', 30);
  const field = await room('Terrain de sport', 'Terrain', 200);

  const byCode = new Map(subjects.map((s) => [s.id, s.code]));
  const requirements: (Requirement & { subjectId: string })[] = [];
  classes.forEach((klass, i) => {
    for (const cs of klass.classSubjects) {
      const code = byCode.get(cs.subjectId) ?? '';
      if (!WEEKLY_HOURS[code]) continue;
      requirements.push({
        key: `${klass.id}:${cs.subjectId}`,
        classId: klass.id,
        subjectId: cs.subjectId,
        teacherId: cs.teacherId,
        roomId: code === 'SVT' ? lab.id : code === 'EPS' ? field.id : homeRooms[i].id,
        minutesPerWeek: WEEKLY_HOURS[code] * 60,
        blockMinutes: code === 'EPS' ? 120 : 60,
      });
    }
  });

  const settings = {
    days: parseDays(school.timetableDays).filter((d) => d <= 5),
    start: '07:30',
    end: '17:30',
    breaks: parseRanges(school.timetableBreaks),
    slotMinutes: 30,
  };
  const { placed, unplaced } = scheduleRequirements(requirements, [], settings);
  const subjectOf = new Map(requirements.map((r) => [r.key, r.subjectId]));
  await prisma.timetableSession.createMany({
    data: placed.map((p) => ({
      schoolId: school.id,
      academicYearId: year.id,
      classId: p.classId,
      subjectId: subjectOf.get(p.requirementKey)!,
      teacherId: p.teacherId ?? null,
      roomId: p.roomId ?? null,
      dayOfWeek: p.dayOfWeek,
      startTime: p.startTime,
      endTime: p.endTime,
    })),
  });
  console.log(`Timetable: ${placed.length} séances créées, ${unplaced.length} non placées`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedTimetable(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
