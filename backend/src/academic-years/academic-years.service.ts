import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { assertAcademicYearInSchool } from '../common/tenant-ownership';
import { AuditService } from '../common/audit.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

    return this.prisma.academicYear.create({
      data: {
        schoolId: user.schoolId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: isFirst,
        terms: {
          create: [
            { name: 'Trimestre 1', order: 1, startDate: new Date(dto.startDate), endDate: new Date(dto.startDate) },
            { name: 'Trimestre 2', order: 2, startDate: new Date(dto.startDate), endDate: new Date(dto.startDate) },
            { name: 'Trimestre 3', order: 3, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
          ],
        },
      },
      include: { terms: true },
    });
  }

  async setCurrent(user: AuthUser, id: string) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    // Check ownership before touching anything: otherwise another school's year could be switched.
    await assertAcademicYearInSchool(this.prisma, id, user.schoolId);
    const [, current] = await this.prisma.$transaction([
      this.prisma.academicYear.updateMany({ where: { schoolId: user.schoolId }, data: { isCurrent: false } }),
      this.prisma.academicYear.update({ where: { id }, data: { isCurrent: true } }),
    ]);
    await this.audit.record(user, 'SET_CURRENT', 'AcademicYear', id);
    return current;
  }
}
