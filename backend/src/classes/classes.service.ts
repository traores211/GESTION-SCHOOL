import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

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
      },
      include: { teacher: { include: { user: true } }, academicYear: true },
    });
  }

  async findAll(user: AuthUser, academicYearId?: string) {
    if (!user.schoolId) return [];
    const resolvedYearId = await this.resolveAcademicYearId(user.schoolId, academicYearId).catch(() => undefined);

    return this.prisma.class.findMany({
      where: {
        schoolId: user.schoolId,
        ...(resolvedYearId ? { academicYearId: resolvedYearId } : {}),
      },
      include: {
        teacher: { include: { user: true } },
        academicYear: true,
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(user: AuthUser, id: string) {
    const klass = await this.prisma.class.findUnique({
      where: { id },
      include: {
        teacher: { include: { user: true } },
        academicYear: true,
        enrollments: {
          where: { withdrawalDate: null },
          include: { student: true },
          orderBy: { student: { lastName: 'asc' } },
        },
        classSubjects: { include: { subject: true, teacher: { include: { user: true } } } },
      },
    });
    if (!klass) throw new NotFoundException('Classe introuvable');
    if (klass.schoolId !== user.schoolId) throw new ForbiddenException();
    return klass;
  }

  async update(user: AuthUser, id: string, dto: UpdateClassDto) {
    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Classe introuvable');
    if (existing.schoolId !== user.schoolId) throw new ForbiddenException();
    return this.prisma.class.update({ where: { id }, data: dto });
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

  async enroll(user: AuthUser, classId: string, studentId: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');
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
