import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateSubjectDto } from './dto/create-subject.dto';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: AuthUser, dto: CreateSubjectDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return this.prisma.subject.create({
      data: { ...dto, schoolId: user.schoolId },
    });
  }

  findAll(user: AuthUser) {
    if (!user.schoolId) return [];
    return this.prisma.subject.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: 'asc' },
    });
  }

  async assignToClass(user: AuthUser, subjectId: string, classId: string, teacherId?: string, coefficient?: number) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject || subject.schoolId !== user.schoolId) throw new NotFoundException('Matière introuvable');
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');

    return this.prisma.classSubject.upsert({
      where: { classId_subjectId: { classId, subjectId } },
      update: { teacherId, coefficient: coefficient ?? subject.coefficient },
      create: { classId, subjectId, teacherId, coefficient: coefficient ?? subject.coefficient },
      include: { subject: true, teacher: { include: { user: true } } },
    });
  }

  async remove(user: AuthUser, id: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id } });
    if (!subject || subject.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.prisma.subject.delete({ where: { id } });
    return { success: true };
  }
}
