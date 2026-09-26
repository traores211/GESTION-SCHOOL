import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { MessagingService } from '../messaging/messaging.service';
import { DEFAULT_SECTIONS } from '../school-settings/branding';
import { enabledFeatures, FEATURES, PLAN_FEATURES } from './features';
import { CreateSchoolDto, UpdateSchoolDto } from './platform.dto';

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  catalogue() {
    return { features: FEATURES, plans: PLAN_FEATURES };
  }

  async listSchools() {
    const schools = await this.prisma.school.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { students: true, users: true, classes: true } } },
    });
    return schools.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      city: s.city,
      plan: s.plan,
      isActive: s.isActive,
      customDomain: s.customDomain,
      featureOverrides: s.featureOverrides ?? {},
      features: enabledFeatures(s),
      counts: s._count,
      createdAt: s.createdAt,
    }));
  }

  async stats() {
    const [schools, activeSchools, students, users, aiActions, documents] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.school.count({ where: { isActive: true } }),
      this.prisma.student.count(),
      this.prisma.user.count(),
      this.prisma.auditLog.count({ where: { resource: 'AI' } }),
      this.prisma.generatedDocument.count(),
    ]);
    const byPlan = await this.prisma.school.groupBy({ by: ['plan'], _count: true });
    return { schools, activeSchools, students, users, aiActions, documents, byPlan };
  }

  /** Creates a tenant: organisation, school, current academic year and the director's account. */
  async createSchool(admin: AuthUser, dto: CreateSchoolDto) {
    const code = dto.code.toLowerCase();
    if (await this.prisma.school.findUnique({ where: { code } })) throw new ConflictException('Ce code est déjà utilisé');
    if (await this.prisma.user.findUnique({ where: { email: dto.directorEmail.toLowerCase() } })) {
      throw new ConflictException('Un compte existe déjà avec cet email de directeur');
    }
    const temporaryPassword = randomBytes(9).toString('base64url');
    const now = new Date();
    const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

    const school = await this.prisma.$transaction(async (tx) => {
      const organisation = await tx.organisation.create({
        data: { name: `${dto.name} (${code})`, slug: code, email: dto.email.toLowerCase() },
      });
      const created = await tx.school.create({
        data: {
          organisationId: organisation.id,
          name: dto.name,
          code,
          email: dto.email.toLowerCase(),
          city: dto.city,
          phone: dto.phone,
          plan: dto.plan ?? 'PROFESSIONAL',
          showcaseSections: DEFAULT_SECTIONS as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.academicYear.create({
        data: {
          schoolId: created.id,
          name: `${startYear}-${startYear + 1}`,
          startDate: new Date(`${startYear}-09-01`),
          endDate: new Date(`${startYear + 1}-07-31`),
          isCurrent: true,
          terms: {
            create: [1, 2, 3].map((order) => ({
              name: `Trimestre ${order}`,
              order,
              startDate: new Date(`${order === 1 ? startYear : startYear + 1}-${['09', '01', '04'][order - 1]}-01`),
              endDate: new Date(`${startYear + 1}-${['12', '03', '07'][order - 1]}-${order === 1 ? '20' : '31'}`),
            })),
          },
        },
      });
      await tx.user.create({
        data: {
          email: dto.directorEmail.toLowerCase(),
          password: await bcrypt.hash(temporaryPassword, 10),
          firstName: dto.directorFirstName,
          lastName: dto.directorLastName,
          role: 'DIRECTOR',
          schoolId: created.id,
          staffMember: { create: { position: 'Directeur', hireDate: now } },
        },
      });
      return created;
    });

    await this.messaging.send(
      school.id,
      'EMAIL',
      dto.directorEmail,
      `Bienvenue sur GESTION SCHOOL.\nVotre espace ${dto.name} est prêt.\nIdentifiant : ${dto.directorEmail}\nMot de passe provisoire : ${temporaryPassword}\nChangez-le dès votre première connexion (Mot de passe oublié).`,
      'Votre espace GESTION SCHOOL est prêt',
    );
    await this.audit.record({ userId: admin.userId, schoolId: school.id }, 'CREATE', 'School', school.id, {
      after: { code, plan: school.plan },
    });
    return { id: school.id, code, temporaryPassword };
  }

  async updateSchool(admin: AuthUser, id: string, dto: UpdateSchoolDto) {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException('École introuvable');
    if (dto.featureOverrides) {
      const unknown = Object.keys(dto.featureOverrides).filter((k) => !(FEATURES as readonly string[]).includes(k));
      if (unknown.length) throw new BadRequestException(`Fonctionnalités inconnues : ${unknown.join(', ')}`);
    }
    const updated = await this.prisma.school.update({
      where: { id },
      data: {
        plan: dto.plan,
        isActive: dto.isActive,
        customDomain: dto.customDomain === '' ? null : dto.customDomain?.toLowerCase(),
        featureOverrides: dto.featureOverrides as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.record({ userId: admin.userId, schoolId: id }, 'UPDATE', 'School', id, {
      before: { plan: school.plan, isActive: school.isActive, featureOverrides: school.featureOverrides },
      after: dto,
    });
    return { id: updated.id, plan: updated.plan, isActive: updated.isActive, features: enabledFeatures(updated) };
  }
}
