import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { OFFICE } from '../common/roles';
import { BulletinsService } from '../bulletins/bulletins.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ParentPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bulletinsService: BulletinsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getParent(user: AuthUser) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId: user.userId },
      include: { students: true },
    });
    if (!parent) throw new NotFoundException('Aucun profil parent associé à ce compte');
    return parent;
  }

  /** The child when it belongs to the signed-in parent, with the school the staff services work on. */
  private async child(user: AuthUser, studentId: string) {
    const parent = await this.getParent(user);
    const student = parent.students.find((s) => s.id === studentId);
    if (!student) throw new ForbiddenException();
    return { student, parent, staffView: { ...user, schoolId: student.schoolId } as AuthUser };
  }

  private async currentClass(studentId: string, schoolId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, withdrawalDate: null, class: { schoolId, academicYear: { isCurrent: true } } },
      include: { class: { include: { academicYear: { include: { terms: { orderBy: { order: 'asc' } } } } } } },
    });
    return enrollment?.class ?? null;
  }

  async children(user: AuthUser) {
    const parent = await this.getParent(user);
    return this.prisma.student.findMany({
      where: { id: { in: parent.students.map((s) => s.id) } },
      include: {
        enrollments: { where: { withdrawalDate: null }, include: { class: true }, orderBy: { enrollmentDate: 'desc' }, take: 1 },
        school: true,
      },
    });
  }

  async childDetail(user: AuthUser, studentId: string) {
    await this.child(user, studentId);

    return this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: { where: { withdrawalDate: null }, include: { class: true }, orderBy: { enrollmentDate: 'desc' }, take: 1 },
        attendance: { orderBy: { date: 'desc' }, take: 30 },
        grades: { include: { subject: true, term: true }, orderBy: { createdAt: 'desc' }, take: 30 },
        invoices: { include: { items: true, payments: true }, orderBy: { createdAt: 'desc' } },
        school: true,
      },
    });
  }

  /** Report cards of the year: a term's card is released to families once the term is over. */
  async bulletins(user: AuthUser, studentId: string) {
    const { student, staffView } = await this.child(user, studentId);
    const klass = await this.currentClass(studentId, student.schoolId);
    if (!klass) return [];
    const now = new Date();
    const result = [];
    for (const term of klass.academicYear.terms) {
      const published = term.endDate < now;
      if (!published) {
        result.push({ termId: term.id, name: term.name, published, availableOn: term.endDate, average: null, rankLabel: null, classSize: null, distinction: null, councilAppreciation: null, decisionLabel: null });
        continue;
      }
      const card = await this.bulletinsService.bulletin(staffView, studentId, term.id);
      result.push({
        termId: term.id,
        name: term.name,
        published,
        availableOn: term.endDate,
        average: card.student.average,
        rankLabel: card.student.rankLabel,
        classSize: card.stats.ranked,
        distinction: card.student.distinction?.label ?? null,
        councilAppreciation: card.student.councilAppreciation,
        decisionLabel: card.decisionLabel,
      });
    }
    return result;
  }

  async bulletinCard(user: AuthUser, studentId: string, termId: string) {
    const { staffView } = await this.child(user, studentId);
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new NotFoundException('Période introuvable');
    if (term.endDate >= new Date()) throw new ForbiddenException("Ce bulletin n'est pas encore disponible");
    return this.bulletinsService.bulletin(staffView, studentId, termId);
  }

  /** Weekly timetable of the child's class. */
  async timetable(user: AuthUser, studentId: string) {
    const { student } = await this.child(user, studentId);
    const klass = await this.currentClass(studentId, student.schoolId);
    if (!klass) return { class: null, sessions: [] };
    const sessions = await this.prisma.timetableSession.findMany({
      where: { classId: klass.id, academicYearId: klass.academicYearId },
      include: { subject: { select: { name: true, color: true } }, teacher: { include: { user: { select: { firstName: true, lastName: true } } } }, room: { select: { name: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return {
      class: klass.name,
      sessions: sessions.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        subject: s.subject?.name ?? s.label ?? 'Cours',
        color: s.subject?.color ?? null,
        teacher: s.teacher ? `${s.teacher.user.firstName} ${s.teacher.user.lastName}` : null,
        room: s.room?.name ?? null,
      })),
    };
  }

  /** School life record of the child (what the school chose to share with the family). */
  async discipline(user: AuthUser, studentId: string) {
    await this.child(user, studentId);
    return this.prisma.disciplineRecord.findMany({
      where: { studentId, visibleToParents: true },
      select: { id: true, date: true, kind: true, reason: true, sanction: true },
      orderBy: { date: 'desc' },
      take: 50,
    });
  }

  /** A parent explains an absence; the office then accepts or refuses the reason. */
  async requestJustification(user: AuthUser, studentId: string, attendanceId: string, reason: string) {
    const { student, parent } = await this.child(user, studentId);
    const record = await this.prisma.attendance.findUnique({ where: { id: attendanceId } });
    if (!record || record.studentId !== studentId) throw new NotFoundException('Absence introuvable');
    if (record.status !== 'ABSENT') throw new BadRequestException(record.status === 'ABSENCE_JUSTIFIEE' ? 'Cette absence est déjà justifiée' : "Seule une absence peut être justifiée");
    const updated = await this.prisma.attendance.update({ where: { id: attendanceId }, data: { justificationRequest: reason.trim().slice(0, 500), justificationRequestedAt: new Date() } });
    const office = await this.prisma.user.findMany({ where: { schoolId: student.schoolId, status: 'ACTIVE', role: { in: [...OFFICE] as never } }, select: { id: true }, take: 20 });
    for (const staff of office) {
      await this.notifications.notify(staff.id, 'Justificatif à traiter', `${parent.firstName} ${parent.lastName} a justifié l'absence de ${student.firstName} ${student.lastName} du ${record.date.toLocaleDateString('fr-FR')}.`);
    }
    return updated;
  }
}
