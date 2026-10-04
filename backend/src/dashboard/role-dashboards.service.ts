import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';

/** Day of the week as the timetable stores it: 1 = Monday … 7 = Sunday. */
export const timetableDay = (date: Date) => ((date.getDay() + 6) % 7) + 1;

/**
 * Dashboards of the roles that do not manage the school: the teacher sees his own classes and day,
 * the platform administrator sees the whole platform. The school dashboard stays in DashboardService.
 */
@Injectable()
export class RoleDashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A teacher's day: his classes, today's lessons, the roll calls still to take, his marks of the term. */
  async teacher(user: AuthUser) {
    const empty = { classes: [], today: [], rollCallsToTake: [], totals: { classes: 0, pupils: 0, lessonsToday: 0, marksThisTerm: 0, homeworkToCome: 0 } };
    if (!user.schoolId) return empty;
    const staff = await this.prisma.staffMember.findUnique({ where: { userId: user.userId }, select: { id: true } });
    if (!staff) return empty;
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId: user.schoolId, isCurrent: true }, include: { terms: { orderBy: { order: 'asc' } } } });
    if (!year) return empty;

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const term = year.terms.find((t) => t.startDate <= now && t.endDate >= now) ?? null;
    const classes = await this.prisma.class.findMany({
      where: { schoolId: user.schoolId, academicYearId: year.id, archivedAt: null, OR: [{ teacherId: staff.id }, { classSubjects: { some: { teacherId: staff.id } } }] },
      select: {
        id: true, name: true, level: true, teacherId: true,
        _count: { select: { enrollments: { where: { withdrawalDate: null } } } },
        classSubjects: { where: { teacherId: staff.id }, select: { subject: { select: { id: true, name: true } } } },
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    const classIds = classes.map((c) => c.id);
    const [lessons, called, marks, homework] = await Promise.all([
      this.prisma.timetableSession.findMany({
        where: { schoolId: user.schoolId, academicYearId: year.id, teacherId: staff.id, dayOfWeek: timetableDay(now), OR: [{ termId: null }, ...(term ? [{ termId: term.id }] : [])] },
        select: { id: true, startTime: true, endTime: true, label: true, classId: true, class: { select: { name: true } }, subject: { select: { name: true } }, room: { select: { name: true } } },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.attendance.findMany({ where: { classId: { in: classIds }, date: dayStart }, select: { classId: true }, distinct: ['classId'] }),
      term ? this.prisma.grade.count({ where: { classId: { in: classIds }, termId: term.id, enteredById: user.userId } }) : Promise.resolve(0),
      this.prisma.homework.count({ where: { classId: { in: classIds }, createdById: user.userId, dueDate: { gte: dayStart } } }),
    ]);
    const done = new Set(called.map((a) => a.classId));
    const today = lessons.map((l) => ({ id: l.id, start: l.startTime, end: l.endTime, classId: l.classId, class: l.class.name, subject: l.subject?.name ?? l.label ?? 'Cours', room: l.room?.name ?? null, rollCallTaken: done.has(l.classId) }));
    const toTake = [...new Map(today.filter((l) => !l.rollCallTaken).map((l) => [l.classId, { classId: l.classId, class: l.class }])).values()];

    return {
      term: term ? { id: term.id, name: term.name } : null,
      classes: classes.map((c) => ({ id: c.id, name: c.name, level: c.level, pupils: c._count.enrollments, mainTeacher: c.teacherId === staff.id, subjects: c.classSubjects.map((s) => s.subject.name) })),
      today,
      rollCallsToTake: toTake,
      totals: { classes: classes.length, pupils: classes.reduce((n, c) => n + c._count.enrollments, 0), lessonsToday: today.length, marksThisTerm: marks, homeworkToCome: homework },
    };
  }

  /** The whole platform, for its administrator: schools, people, applications. */
  async platform() {
    const [schools, activeSchools, organisations, bySubscription, students, parents, teachers, admissions] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.school.count({ where: { isActive: true } }),
      this.prisma.organisation.count(),
      this.prisma.organisation.groupBy({ by: ['subscriptionStatus'], _count: true }),
      this.prisma.student.count({ where: { archivedAt: null } }),
      this.prisma.parent.count({ where: { archivedAt: null } }),
      this.prisma.user.count({ where: { role: 'ENSEIGNANT', status: 'ACTIVE' } }),
      this.prisma.admission.count({ where: { status: { notIn: ['CONFIRME', 'REJETE'] } } }),
    ]);
    return {
      organisations,
      schools,
      activeSchools,
      students,
      parents,
      teachers,
      admissionsInProgress: admissions,
      subscriptions: Object.fromEntries(bySubscription.map((s) => [s.subscriptionStatus, s._count])),
    };
  }
}
