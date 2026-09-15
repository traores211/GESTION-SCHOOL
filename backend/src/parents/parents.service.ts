import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStudentsInSchool(studentIds: string[], schoolId: string) {
    if (studentIds.length === 0) return;
    const count = await this.prisma.student.count({ where: { id: { in: studentIds }, schoolId } });
    if (count !== studentIds.length) {
      throw new BadRequestException("Un ou plusieurs élèves n'appartiennent pas à votre établissement");
    }
  }

  async create(user: AuthUser, dto: CreateParentDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const { studentIds = [], ...data } = dto;
    await this.assertStudentsInSchool(studentIds, user.schoolId);

    return this.prisma.parent.create({
      data: {
        ...data,
        students: { connect: studentIds.map((id) => ({ id })) },
      },
      include: { students: true },
    });
  }

  findAll(user: AuthUser, search?: string) {
    if (!user.schoolId) return [];
    return this.prisma.parent.findMany({
      where: {
        students: { some: { schoolId: user.schoolId } },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { students: { select: { id: true, firstName: true, lastName: true, matricule: true } } },
      orderBy: [{ lastName: 'asc' }],
    });
  }

  async findOne(user: AuthUser, id: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { id },
      include: { students: { include: { school: true } } },
    });
    if (!parent) throw new NotFoundException('Parent introuvable');
    if (!parent.students.some((s) => s.schoolId === user.schoolId)) throw new ForbiddenException();
    return parent;
  }

  async update(user: AuthUser, id: string, dto: UpdateParentDto) {
    await this.findOne(user, id);
    const { studentIds, ...data } = dto;
    if (studentIds && user.schoolId) {
      await this.assertStudentsInSchool(studentIds, user.schoolId);
    }
    return this.prisma.parent.update({
      where: { id },
      data: {
        ...data,
        ...(studentIds ? { students: { set: studentIds.map((sid) => ({ id: sid })) } } : {}),
      },
      include: { students: true },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.parent.delete({ where: { id } });
    return { success: true };
  }
}
