import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherScopeService } from '../common/teacher-scope.service';
import { AuthUser } from '../common/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingService } from '../messaging/messaging.service';
import { assertYearOpen } from '../common/year-guard';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
    private readonly scope: TeacherScopeService,
  ) {}

  async mark(user: AuthUser, dto: MarkAttendanceDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const klass = await this.prisma.class.findUnique({ where: { id: dto.classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');
    await this.scope.assertClass(user, klass.id);
    await assertYearOpen(this.prisma, klass.academicYearId);

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const results = await this.prisma.$transaction(
      dto.records.map((record) =>
        this.prisma.attendance.upsert({
          where: { classId_studentId_date: { classId: dto.classId, studentId: record.studentId, date } },
          update: { status: record.status as any, reason: record.reason },
          create: {
            classId: dto.classId,
            studentId: record.studentId,
            schoolId: user.schoolId!,
            date,
            status: record.status as any,
            reason: record.reason,
          },
        }),
      ),
    );

    const toNotify = dto.records.filter((r) => r.status === 'ABSENT' || r.status === 'RETARD');
    if (toNotify.length > 0) {
      const students = await this.prisma.student.findMany({
        where: { id: { in: toNotify.map((r) => r.studentId) } },
        include: { parents: { where: { userId: { not: null } } } },
      });
      for (const record of toNotify) {
        const student = students.find((s) => s.id === record.studentId);
        if (!student) continue;
        const label = record.status === 'ABSENT' ? 'est absent(e)' : 'est arrivé(e) en retard';
        for (const parent of student.parents) {
          await this.notifications.notify(
            parent.userId,
            'Présence',
            `Votre enfant ${student.firstName} ${student.lastName} ${label} aujourd'hui.`,
          );
        }
        // SMS for recent absences only (one per pupil, day and guardian); a sending problem never blocks the roll call.
        if (record.status === 'ABSENT' && Date.now() - date.getTime() < 2 * 86400000) await this.messaging.absence(student.id, date).catch(() => undefined);
      }
    }

    return results;
  }

  async findByClassAndDate(user: AuthUser, classId: string, date: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.scope.assertClass(user, classId);

    const day = new Date(date);
    day.setHours(0, 0, 0, 0);

    return this.prisma.attendance.findMany({
      where: { classId, date: day },
      include: { student: true },
      orderBy: { student: { lastName: 'asc' } },
    });
  }

  async findByStudent(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.scope.assertStudent(user, studentId);

    return this.prisma.attendance.findMany({
      where: { studentId },
      orderBy: { date: 'desc' },
    });
  }

  async justify(user: AuthUser, id: string, justification: string) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record || record.schoolId !== user.schoolId) throw new NotFoundException('Enregistrement introuvable');
    await this.scope.assertClass(user, record.classId);

    return this.prisma.attendance.update({
      where: { id },
      data: { isJustified: true, justification, status: 'ABSENCE_JUSTIFIEE', justificationRequest: null, justificationRequestedAt: null },
    });
  }

  /** Reasons sent by parents from the portal, waiting for a decision of the office. */
  async pendingJustifications(user: AuthUser) {
    if (!user.schoolId) return [];
    const classIds = await this.scope.classIds(user);
    return this.prisma.attendance.findMany({
      where: { schoolId: user.schoolId, status: 'ABSENT', justificationRequest: { not: null }, ...(classIds ? { classId: { in: classIds } } : {}) },
      include: { student: { select: { id: true, firstName: true, lastName: true, matricule: true } }, class: { select: { name: true } } },
      orderBy: { justificationRequestedAt: 'asc' },
      take: 200,
    });
  }

  /** Refuses the reason sent by a parent: the absence stays unjustified and the parents are told. */
  async refuseJustification(user: AuthUser, id: string) {
    const record = await this.prisma.attendance.findUnique({ where: { id }, include: { student: { include: { parents: { where: { userId: { not: null } } } } } } });
    if (!record || record.schoolId !== user.schoolId) throw new NotFoundException('Enregistrement introuvable');
    await this.scope.assertClass(user, record.classId);
    if (!record.justificationRequest) throw new BadRequestException('Aucun justificatif en attente pour cette absence');
    await this.prisma.attendance.update({ where: { id }, data: { justificationRequest: null, justificationRequestedAt: null } });
    for (const parent of record.student.parents) {
      await this.notifications.notify(parent.userId, 'Justificatif refusé', `Le justificatif de l'absence de ${record.student.firstName} du ${record.date.toLocaleDateString('fr-FR')} n'a pas été retenu. Contactez l'établissement pour plus de précisions.`);
    }
    return { success: true };
  }

  async todayStats(user: AuthUser) {
    if (!user.schoolId) return { present: 0, absent: 0, late: 0, rate: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const grouped = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { schoolId: user.schoolId, date: today },
      _count: true,
    });

    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
    const present = counts.PRESENT || 0;
    const absent = counts.ABSENT || 0;
    const late = counts.RETARD || 0;
    const justified = counts.ABSENCE_JUSTIFIEE || 0;
    const total = present + absent + late + justified;

    return {
      present,
      absent,
      late,
      justified,
      total,
      rate: total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 0,
    };
  }
}
