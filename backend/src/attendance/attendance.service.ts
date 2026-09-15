import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async mark(user: AuthUser, dto: MarkAttendanceDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const klass = await this.prisma.class.findUnique({ where: { id: dto.classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');

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
      }
    }

    return results;
  }

  async findByClassAndDate(user: AuthUser, classId: string, date: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new ForbiddenException();

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

    return this.prisma.attendance.findMany({
      where: { studentId },
      orderBy: { date: 'desc' },
    });
  }

  async justify(user: AuthUser, id: string, justification: string) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record || record.schoolId !== user.schoolId) throw new NotFoundException('Enregistrement introuvable');

    return this.prisma.attendance.update({
      where: { id },
      data: { isJustified: true, justification, status: 'ABSENCE_JUSTIFIEE' },
    });
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
