import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateAdmissionDto } from './dto/create-admission.dto';

export const ADMISSION_WORKFLOW = [
  'CANDIDATURE',
  'DOSSIER_INCOMPLET',
  'DOSSIER_COMPLET',
  'ETUDE',
  'TEST',
  'ENTRETIEN',
  'ADMIS',
  'REJETE',
  'INSCRIPTION',
  'CONFIRME',
] as const;

@Injectable()
export class AdmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCurrentYear(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    if (!year) throw new BadRequestException("Aucune année scolaire courante n'est configurée");
    return year.id;
  }

  async create(user: AuthUser, dto: CreateAdmissionDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const academicYearId = await this.resolveCurrentYear(user.schoolId);

    return this.prisma.admission.create({
      data: {
        schoolId: user.schoolId,
        academicYearId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender ?? 'M',
      },
    });
  }

  findAll(user: AuthUser, status?: string) {
    if (!user.schoolId) return [];
    return this.prisma.admission.findMany({
      where: { schoolId: user.schoolId, ...(status ? { status: status as any } : {}) },
      include: { student: true },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const admission = await this.prisma.admission.findUnique({ where: { id }, include: { student: true } });
    if (!admission) throw new NotFoundException('Candidature introuvable');
    if (admission.schoolId !== user.schoolId) throw new ForbiddenException();
    return admission;
  }

  async updateStatus(user: AuthUser, id: string, status: string) {
    if (!ADMISSION_WORKFLOW.includes(status as any)) {
      throw new BadRequestException('Statut de candidature invalide');
    }
    const admission = await this.findOne(user, id);

    let studentId = admission.studentId;

    if (status === 'INSCRIPTION' && !studentId && user.schoolId) {
      const year = new Date().getFullYear();
      const count = await this.prisma.student.count({ where: { schoolId: user.schoolId } });
      const student = await this.prisma.student.create({
        data: {
          schoolId: user.schoolId,
          firstName: admission.firstName,
          lastName: admission.lastName,
          matricule: `${year}-${String(count + 1).padStart(4, '0')}`,
          dateOfBirth: admission.dateOfBirth ?? new Date(),
          gender: admission.gender,
          phone: admission.phone,
        },
      });
      studentId = student.id;
    }

    return this.prisma.admission.update({
      where: { id },
      data: { status: status as any, studentId },
      include: { student: true },
    });
  }
}
