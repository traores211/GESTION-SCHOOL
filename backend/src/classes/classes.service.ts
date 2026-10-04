import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherScopeService } from '../common/teacher-scope.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { assertYearOpen } from '../common/year-guard';
import { PUBLIC_USER } from '../common/sensitive-fields.interceptor';

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TeacherScopeService,
  ) {}

  private async resolveAcademicYearId(schoolId: string, academicYearId?: string) {
    if (academicYearId) return academicYearId;
    const current = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
    });
    if (!current) {
      throw new BadRequestException("Aucune année scolaire courante n'est configurée pour cet établissement");
    }
    return current.id;
  }

  async create(user: AuthUser, dto: CreateClassDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const academicYearId = await this.resolveAcademicYearId(user.schoolId, dto.academicYearId);

    return this.prisma.class.create({
      data: {
        schoolId: user.schoolId,
        academicYearId,
        name: dto.name,
        code: dto.code,
        level: dto.level,
        capacity: dto.capacity ?? 50,
        teacherId: dto.teacherId,
        series: dto.series,
        roomId: await this.roomOf(user.schoolId, dto.roomId),
      },
      include: { teacher: { include: { user: PUBLIC_USER } }, academicYear: true },
    });
  }

  private async roomOf(schoolId: string, roomId?: string | null) {
    if (!roomId) return roomId === null ? null : undefined;
    const room = await this.prisma.room.findFirst({ where: { id: roomId, schoolId }, select: { id: true } });
    if (!room) throw new BadRequestException('Salle introuvable');
    return room.id;
  }

  async findAll(user: AuthUser, academicYearId?: string, archived = false) {
    if (!user.schoolId) return [];
    const resolvedYearId = await this.resolveAcademicYearId(user.schoolId, academicYearId).catch(() => undefined);
    // A teacher only sees the classes he teaches in
    const own = await this.scope.classIds(user);

    return this.prisma.class.findMany({
      where: {
        schoolId: user.schoolId,
        archivedAt: archived ? { not: null } : null,
        ...(own ? { id: { in: own } } : {}),
        ...(resolvedYearId ? { academicYearId: resolvedYearId } : {}),
      },
      include: {
        teacher: { include: { user: PUBLIC_USER } },
        academicYear: true,
        room: { select: { id: true, name: true } },
        _count: { select: { enrollments: { where: { withdrawalDate: null } } } },
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(user: AuthUser, id: string) {
    const klass = await this.prisma.class.findUnique({
      where: { id },
      include: {
        teacher: { include: { user: PUBLIC_USER } },
        academicYear: true,
        enrollments: {
          where: { withdrawalDate: null },
          include: { student: true },
          orderBy: { student: { lastName: 'asc' } },
        },
        classSubjects: { include: { subject: true, teacher: { include: { user: PUBLIC_USER } } } },
      },
    });
    if (!klass) throw new NotFoundException('Classe introuvable');
    if (klass.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.scope.assertClass(user, id);
    return klass;
  }

  async update(user: AuthUser, id: string, dto: UpdateClassDto) {
    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Classe introuvable');
    if (existing.schoolId !== user.schoolId) throw new ForbiddenException();
    const { roomId, academicYearId: _year, ...data } = dto;
    void _year;
    return this.prisma.class.update({ where: { id }, data: { ...data, ...(roomId !== undefined ? { roomId: await this.roomOf(existing.schoolId, roomId) } : {}) } });
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Classe introuvable');
    if (existing.schoolId !== user.schoolId) throw new ForbiddenException();
    // Deleting a class would cascade to enrolments, marks, attendance and lessons: refused once used.
    const [enrollments, grades, attendance, sessions] = await Promise.all([
      this.prisma.enrollment.count({ where: { classId: id } }),
      this.prisma.grade.count({ where: { classId: id } }),
      this.prisma.attendance.count({ where: { classId: id } }),
      this.prisma.timetableSession.count({ where: { classId: id } }),
    ]);
    if (enrollments + grades + attendance + sessions > 0) {
      throw new BadRequestException(
        `Cette classe a un historique (${enrollments} inscription(s), ${grades} note(s), ${attendance} appel(s), ${sessions} cours) : elle ne peut pas être supprimée.`,
      );
    }
    await this.prisma.class.delete({ where: { id } });
    return { success: true };
  }

  /** An archived class leaves the lists and takes no new pupil; everything recorded in it is kept. */
  async setArchived(user: AuthUser, id: string, archived: boolean) {
    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing || existing.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');
    return this.prisma.class.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  }

  /** Moves a pupil to another class of the same year: the former enrolment is closed, not erased. */
  async move(user: AuthUser, classId: string, studentId: string, toClassId: string) {
    const [from, to] = await Promise.all([this.prisma.class.findUnique({ where: { id: classId } }), this.prisma.class.findUnique({ where: { id: toClassId } })]);
    if (!from || from.schoolId !== user.schoolId || !to || to.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');
    if (from.id === to.id) throw new BadRequestException("L'élève est déjà dans cette classe");
    if (from.academicYearId !== to.academicYearId) throw new BadRequestException('Les deux classes doivent être de la même année scolaire : utilisez le passage en classe supérieure');
    if (to.archivedAt) throw new BadRequestException('La classe de destination est archivée');
    await assertYearOpen(this.prisma, from.academicYearId);
    const current = await this.prisma.enrollment.findUnique({ where: { classId_studentId: { classId, studentId } } });
    if (!current || current.withdrawalDate) throw new NotFoundException("Cet élève n'est pas inscrit dans cette classe");
    const size = await this.prisma.enrollment.count({ where: { classId: to.id, withdrawalDate: null } });
    if (size >= to.capacity) throw new BadRequestException(`${to.name} est complète (${to.capacity} places)`);
    const now = new Date();
    const [, enrollment] = await this.prisma.$transaction([
      this.prisma.enrollment.update({ where: { id: current.id }, data: { withdrawalDate: now, outcome: 'TRANSFERE', outcomeAt: now } }),
      this.prisma.enrollment.upsert({ where: { classId_studentId: { classId: to.id, studentId } }, update: { withdrawalDate: null, outcome: null, outcomeAt: null, enrollmentDate: now }, create: { classId: to.id, studentId, enrollmentDate: now } }),
    ]);
    return { ...enrollment, from: from.name, to: to.name };
  }

  async enroll(user: AuthUser, classId: string, studentId: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');
    if (klass.archivedAt) throw new BadRequestException('Cette classe est archivée');
    await assertYearOpen(this.prisma, klass.academicYearId);
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== user.schoolId) throw new NotFoundException('Élève introuvable');

    return this.prisma.enrollment.upsert({
      where: { classId_studentId: { classId, studentId } },
      update: { withdrawalDate: null },
      create: { classId, studentId },
    });
  }

  async unenroll(user: AuthUser, classId: string, studentId: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');

    return this.prisma.enrollment.update({
      where: { classId_studentId: { classId, studentId } },
      data: { withdrawalDate: new Date() },
    });
  }
}
