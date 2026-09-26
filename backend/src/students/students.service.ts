import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { can } from '../authz/permissions';
import { AuditService } from '../common/audit.service';
import { SequenceService } from '../common/sequence.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateStudentDto) {
    if (!user.schoolId) {
      throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    }
    const { classId, ...data } = dto;
    if (classId) {
      const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId: user.schoolId } });
      if (!klass) throw new NotFoundException('Classe introuvable');
    }
    const matricule = await this.sequences.matricule(user.schoolId);

    return this.prisma.student.create({
      data: {
        ...data,
        dateOfBirth: new Date(dto.dateOfBirth),
        schoolId: user.schoolId,
        matricule,
        ...(classId
          ? { enrollments: { create: { classId } } }
          : {}),
      },
      include: {
        enrollments: { include: { class: true }, orderBy: { enrollmentDate: 'desc' }, take: 1 },
      },
    });
  }

  /** Paginated (max 500 per page); the total is exposed by the controller in X-Total-Count. */
  async findAll(user: AuthUser, search?: string, classId?: string, page = 1, pageSize = 500) {
    if (!user.schoolId) return { items: [], total: 0 };
    const where = this.listWhere(user.schoolId, search, classId);
    const take = Math.min(Math.max(pageSize, 1), 500);
    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: {
          enrollments: { where: { withdrawalDate: null }, include: { class: true }, orderBy: { enrollmentDate: 'desc' }, take: 1 },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (Math.max(page, 1) - 1) * take,
        take,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { items, total };
  }

  private listWhere(schoolId: string, search?: string, classId?: string) {
    return {
      schoolId,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { matricule: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(classId ? { enrollments: { some: { classId, withdrawalDate: null } } } : {}),
    };
  }

  async findOne(user: AuthUser, id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        parents: true,
        enrollments: { include: { class: true }, orderBy: { enrollmentDate: 'desc' } },
        attendance: { orderBy: { date: 'desc' }, take: 20 },
        grades: { include: { subject: true, term: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        invoices: { include: { items: true, payments: true }, orderBy: { createdAt: 'desc' } },
        documents: true,
      },
    });

    if (!student) throw new NotFoundException('Élève introuvable');
    if (student.schoolId !== user.schoolId) throw new ForbiddenException();

    const attendanceStats = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { studentId: id },
      _count: true,
    });

    const gradeAgg = await this.prisma.grade.aggregate({
      where: { studentId: id },
      _avg: { score: true },
    });

    // Field-level authorization: keep the payload shape (empty arrays) so the 360° page still renders.
    const canSeeGrades = can(user, 'grades:read');
    return {
      ...student,
      grades: canSeeGrades ? student.grades : [],
      invoices: can(user, 'billing:read') ? student.invoices : [],
      attendanceStats,
      averageScore: canSeeGrades ? gradeAgg._avg.score : null,
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateStudentDto) {
    const existing = await this.prisma.student.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Élève introuvable');
    if (existing.schoolId !== user.schoolId) throw new ForbiddenException();

    const { classId, dateOfBirth, status, ...rest } = dto;
    return this.prisma.student.update({
      where: { id },
      data: {
        ...rest,
        ...(status ? { status: status as any } : {}),
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.student.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Élève introuvable');
    if (existing.schoolId !== user.schoolId) throw new ForbiddenException();

    await this.prisma.student.delete({ where: { id } });
    await this.audit.record(user, 'DELETE', 'Student', id, { before: { matricule: existing.matricule } });
    return { success: true };
  }
}
