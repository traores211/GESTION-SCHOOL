import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthUser) {
    if (!user.schoolId) return [];
    return this.prisma.academicYear.findMany({
      where: { schoolId: user.schoolId },
      include: { terms: { orderBy: { order: 'asc' } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async create(user: AuthUser, dto: CreateAcademicYearDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const isFirst = (await this.prisma.academicYear.count({ where: { schoolId: user.schoolId } })) === 0;
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException("La fin de l'année doit suivre son début");
    // Three terms of equal length; the school adjusts the dates afterwards
    const third = (end.getTime() - start.getTime()) / 3;
    const cut = (n: number) => new Date(start.getTime() + Math.round(third * n));

    return this.prisma.academicYear.create({
      data: {
        schoolId: user.schoolId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: isFirst,
        // A year added beside the current one is prepared first, then opened
        status: isFirst ? 'OUVERTE' : 'PREPARATION',
        terms: {
          create: [
            { name: 'Trimestre 1', order: 1, startDate: start, endDate: cut(1) },
            { name: 'Trimestre 2', order: 2, startDate: cut(1), endDate: cut(2) },
            { name: 'Trimestre 3', order: 3, startDate: cut(2), endDate: end },
          ],
        },
      },
      include: { terms: true },
    });
  }

  async setCurrent(user: AuthUser, id: string) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    // The year must be one of this school's, and still open
    const year = await this.prisma.academicYear.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!year) throw new NotFoundException('Année scolaire introuvable');
    if (year.status === 'CLOTUREE' || year.status === 'ARCHIVEE') throw new BadRequestException('Une année clôturée ne peut pas redevenir l’année en cours : rouvrez-la d’abord');
    const [, current] = await this.prisma.$transaction([
      this.prisma.academicYear.updateMany({ where: { schoolId: user.schoolId }, data: { isCurrent: false } }),
      this.prisma.academicYear.update({ where: { id }, data: { isCurrent: true, status: 'OUVERTE' } }),
      this.prisma.school.update({ where: { id: user.schoolId }, data: { currentAcademicYear: year.name } }),
    ]);
    return current;
  }
}
