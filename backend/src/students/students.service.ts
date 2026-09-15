import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateMatricule(schoolId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.student.count({ where: { schoolId } });
    return `${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(user: AuthUser, dto: CreateStudentDto) {
    if (!user.schoolId) {
      throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    }
    const { classId, ...data } = dto;
    const matricule = await this.generateMatricule(user.schoolId);

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

  async findAll(user: AuthUser, search?: string, classId?: string) {
    if (!user.schoolId) return [];

    return this.prisma.student.findMany({
      where: {
        schoolId: user.schoolId,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { matricule: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(classId ? { enrollments: { some: { classId, withdrawalDate: null } } } : {}),
      },
      include: {
        enrollments: {
          where: { withdrawalDate: null },
          include: { class: true },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
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

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.student.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Élève introuvable');
    if (existing.schoolId !== user.schoolId) throw new ForbiddenException();

    await this.prisma.student.delete({ where: { id } });
    return { success: true };
  }
}
