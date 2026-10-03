import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { Prisma } from '@prisma/client';
import { PageQueryDto, pageArgs, pageResult } from '../common/pagination';
import { SequenceService } from '../infra/sequence.service';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
  ) {}

  /** Platform-wide unique student number from an atomic counter (safe with simultaneous entries). */
  private generateMatricule(): Promise<string> {
    return this.sequences.matricule();
  }

  async create(user: AuthUser, dto: CreateStudentDto) {
    if (!user.schoolId) {
      throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    }
    const { classId, ...data } = dto;
    const matricule = await this.generateMatricule();

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

  /**
   * Students of the school. Archived students are hidden unless `archived` is true. Paged when
   * `page.page` is given ({ items, total, … }), otherwise a capped array (former response shape).
   */
  async findAll(user: AuthUser, search?: string, classId?: string, page?: PageQueryDto, archived = false) {
    if (!user.schoolId) return [];
    const text = page?.q ?? search;
    const where: Prisma.StudentWhereInput = {
      schoolId: user.schoolId,
      archivedAt: archived ? { not: null } : null,
      ...(text
        ? {
            OR: [
              { firstName: { contains: text, mode: 'insensitive' } },
              { lastName: { contains: text, mode: 'insensitive' } },
              { matricule: { contains: text, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(classId ? { enrollments: { some: { classId, withdrawalDate: null } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: { enrollments: { where: { withdrawalDate: null }, include: { class: true }, orderBy: { enrollmentDate: 'desc' }, take: 1 } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...pageArgs(page),
      }),
      page?.page ? this.prisma.student.count({ where }) : Promise.resolve(0),
    ]);
    return pageResult(page, items, total);
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

    return { ...student, attendanceStats, averageScore: gradeAgg._avg.score };
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

  /**
   * "Delete" archives: the student leaves the lists and their class, but grades, invoices, payments
   * and attendance are kept (school records and accounts must not disappear).
   */
  async remove(user: AuthUser, id: string, reason?: string) {
    const existing = await this.prisma.student.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Élève introuvable');
    if (existing.schoolId !== user.schoolId) throw new ForbiddenException();
    if (existing.archivedAt) return { success: true, archived: true };
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.enrollment.updateMany({ where: { studentId: id, withdrawalDate: null }, data: { withdrawalDate: now } }),
      this.prisma.student.update({ where: { id }, data: { archivedAt: now, archiveReason: reason?.trim() || null, status: 'RETIRE' } }),
    ]);
    return { success: true, archived: true };
  }

  async restore(user: AuthUser, id: string) {
    const existing = await this.prisma.student.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Élève introuvable');
    if (existing.schoolId !== user.schoolId) throw new ForbiddenException();
    return this.prisma.student.update({ where: { id }, data: { archivedAt: null, archiveReason: null, status: 'INSCRIT' } });
  }
}
