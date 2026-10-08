import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { RedisService } from '../infra/redis.service';
import { schoolCode, schoolYear } from './subscription-rules';
import { QuotaService } from './quota.service';

/** Roles that reach every school of their group (or of the platform) without a membership. */
const GROUP_ADMINS = ['SUPER_ADMIN', 'ADMIN_ORGANISATION'];
/** Roles a group administrator may give in a school. */
export const MEMBER_ROLES = ['DIRECTOR', 'SECRETARY', 'COMPTABLE', 'ENSEIGNANT', 'SURVEILLANT', 'EDUCATEUR'] as const;

export interface SchoolInput {
  name: string;
  city?: string;
  phone?: string;
  email?: string;
}

/** Accounts working in a school: the one they have open, or one they are a member of. */
export const inSchool = (schoolId: string): Prisma.UserWhereInput => ({ OR: [{ schoolId }, { memberships: { some: { schoolId } } }] });

/**
 * School groups: an organisation holds one or several schools ("Groupe scolaire ABC": primary, collège,
 * lycée). Each school keeps its own pupils, classes and accounts; an account works in one school at a
 * time (User.schoolId) and may switch to another school it is a member of.
 */
@Injectable()
export class GroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisService,
    @Inject(forwardRef(() => QuotaService)) private readonly quota: QuotaService,
  ) {}

  private async account(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, role: true, schoolId: true, school: { select: { organisationId: true } }, memberships: { select: { schoolId: true, role: true } } },
    });
  }

  private async organisationOf(user: AuthUser) {
    const account = await this.account(user.userId);
    if (!account.school) throw new BadRequestException("Votre compte n'est rattaché à aucun établissement");
    return account.school.organisationId;
  }

  /** Schools the account may open, the current one flagged. */
  async reachable(userId: string) {
    const account = await this.account(userId);
    const memberIds = [...new Set([...account.memberships.map((m) => m.schoolId), ...(account.schoolId ? [account.schoolId] : [])])];
    const where: Prisma.SchoolWhereInput =
      account.role === 'SUPER_ADMIN'
        ? {}
        : account.role === 'ADMIN_ORGANISATION' && account.school
          ? { organisationId: account.school.organisationId }
          : { id: { in: memberIds }, OR: [{ isActive: true }, { id: account.schoolId ?? '-' }] };
    const schools = await this.prisma.school.findMany({
      where,
      select: { id: true, name: true, code: true, city: true, isActive: true, organisation: { select: { name: true } } },
      orderBy: [{ organisation: { name: 'asc' } }, { name: 'asc' }],
      take: 500,
    });
    return schools.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      city: s.city,
      isActive: s.isActive,
      group: s.organisation.name,
      current: s.id === account.schoolId,
      role: GROUP_ADMINS.includes(account.role) ? account.role : (account.memberships.find((m) => m.schoolId === s.id)?.role ?? account.role),
    }));
  }

  /** Opens another school: from then on every request of the account works on that school. */
  async switchSchool(userId: string, schoolId: string) {
    const account = await this.account(userId);
    const target = (await this.reachable(userId)).find((s) => s.id === schoolId);
    if (!target) throw new ForbiddenException("Vous n'avez pas accès à cet établissement");
    const admin = GROUP_ADMINS.includes(account.role);
    if (!target.isActive && !admin) throw new ForbiddenException('Cet établissement est désactivé');
    if (target.current) return target;
    await this.prisma.$transaction(async (tx) => {
      // The school being left stays reachable: its membership is recorded before moving.
      if (account.schoolId && !admin) {
        await tx.schoolMembership.upsert({ where: { userId_schoolId: { userId, schoolId: account.schoolId } }, create: { userId, schoolId: account.schoolId, role: account.role }, update: {} });
      }
      await tx.user.update({ where: { id: userId }, data: { schoolId, ...(admin ? {} : { role: target.role as UserRole }) } });
    });
    await this.cache.del(`auth:user:${userId}`);
    return { ...target, current: true };
  }

  // ---------------------------------------------------------------- group administration

  async schools(user: AuthUser) {
    const organisationId = await this.organisationOf(user);
    const schools = await this.prisma.school.findMany({
      where: { organisationId },
      select: { id: true, name: true, code: true, city: true, phone: true, email: true, isActive: true, createdAt: true, _count: { select: { students: true, classes: true, memberships: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return schools.map(({ _count, ...s }) => ({ ...s, current: s.id === user.schoolId, students: _count.students, classes: _count.classes, members: _count.memberships }));
  }

  private async owned(user: AuthUser, schoolId: string) {
    const organisationId = await this.organisationOf(user);
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school || school.organisationId !== organisationId) throw new NotFoundException('Établissement introuvable');
    return school;
  }

  /** A new school in the group, ready to use: current school year with three terms. */
  async createSchool(user: AuthUser, dto: SchoolInput) {
    await this.quota.assertCanCreate(user, 'schools');
    const organisationId = await this.organisationOf(user);
    const name = dto.name.trim();
    if (await this.prisma.school.findFirst({ where: { organisationId, name: { equals: name, mode: 'insensitive' } } })) throw new ConflictException('Un établissement du groupe porte déjà ce nom');
    const organisation = await this.prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } });
    const year = schoolYear(new Date());
    const school = await this.prisma.$transaction(async (tx) => {
      let number = (await tx.school.count()) + 1;
      while (await tx.school.findUnique({ where: { code: schoolCode(name, number) } })) number++;
      const created = await tx.school.create({
        data: { organisationId, name, code: schoolCode(name, number), email: dto.email?.trim().toLowerCase() || organisation.email, phone: dto.phone?.trim() || null, city: dto.city?.trim() || null, currentAcademicYear: year.name },
      });
      await tx.academicYear.create({ data: { schoolId: created.id, name: year.name, startDate: year.startDate, endDate: year.endDate, isCurrent: true, terms: { create: year.terms } } });
      return created;
    });
    await this.quota.invalidate(organisationId);
    return { id: school.id, name: school.name, code: school.code, city: school.city, isActive: school.isActive };
  }

  async updateSchool(user: AuthUser, schoolId: string, dto: Partial<SchoolInput> & { isActive?: boolean }) {
    const school = await this.owned(user, schoolId);
    if (dto.isActive === false && school.id === user.schoolId) throw new BadRequestException("Ouvrez un autre établissement avant de désactiver celui-ci");
    const updated = await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    if (dto.isActive !== undefined) {
      // Accounts of the school are let in or shut out at once (the sign-in state is cached)
      const users = await this.prisma.user.findMany({ where: { schoolId }, select: { id: true } });
      if (users.length) await this.cache.del(...users.map((u) => `auth:user:${u.id}`));
    }
    return { id: updated.id, name: updated.name, code: updated.code, city: updated.city, isActive: updated.isActive };
  }

  async members(user: AuthUser, schoolId: string) {
    await this.owned(user, schoolId);
    const rows = await this.prisma.schoolMembership.findMany({
      where: { schoolId },
      select: { role: true, createdAt: true, user: { select: { id: true, firstName: true, lastName: true, email: true, status: true, schoolId: true } } },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      take: 1000,
    });
    return rows.map((m) => ({ userId: m.user.id, name: `${m.user.lastName} ${m.user.firstName}`, email: m.user.email, status: m.user.status, role: m.role, since: m.createdAt, open: m.user.schoolId === schoolId }));
  }

  /** Gives an account of the group access to another school of the group, with a role there. */
  async addMember(user: AuthUser, schoolId: string, dto: { email: string; role: (typeof MEMBER_ROLES)[number] }) {
    const school = await this.owned(user, schoolId);
    const target = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email.trim(), mode: 'insensitive' } },
      select: { id: true, role: true, schoolId: true, school: { select: { organisationId: true } }, memberships: { select: { school: { select: { organisationId: true } } } } },
    });
    const inGroup = target && (target.school?.organisationId === school.organisationId || target.memberships.some((m) => m.school.organisationId === school.organisationId));
    // Same answer for an unknown address and for an account of another group: nothing leaks.
    if (!target || !inGroup) throw new NotFoundException("Aucun compte du groupe ne correspond à cette adresse");
    if (['PARENT', 'ELEVE', ...GROUP_ADMINS].includes(target.role)) throw new BadRequestException("Ce type de compte ne se rattache pas à un établissement de cette façon");
    await this.prisma.$transaction(async (tx) => {
      if (target.schoolId) await tx.schoolMembership.upsert({ where: { userId_schoolId: { userId: target.id, schoolId: target.schoolId } }, create: { userId: target.id, schoolId: target.schoolId, role: target.role }, update: {} });
      await tx.schoolMembership.upsert({ where: { userId_schoolId: { userId: target.id, schoolId } }, create: { userId: target.id, schoolId, role: dto.role }, update: { role: dto.role } });
      // The role applies at once when the account has that school open
      if (target.schoolId === schoolId) await tx.user.update({ where: { id: target.id }, data: { role: dto.role } });
    });
    await this.cache.del(`auth:user:${target.id}`);
    return this.members(user, schoolId);
  }

  async removeMember(user: AuthUser, schoolId: string, userId: string) {
    await this.owned(user, schoolId);
    if (userId === user.userId) throw new BadRequestException('Vous ne pouvez pas retirer votre propre accès');
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { schoolId: true, memberships: { select: { schoolId: true, role: true } } } });
    if (!target || !target.memberships.some((m) => m.schoolId === schoolId)) throw new NotFoundException('Ce compte ne fait pas partie de cet établissement');
    const other = target.memberships.find((m) => m.schoolId !== schoolId);
    if (!other) throw new BadRequestException("Ce compte n'a pas d'autre établissement : désactivez-le depuis « Personnel » plutôt que de le retirer");
    await this.prisma.$transaction(async (tx) => {
      await tx.schoolMembership.delete({ where: { userId_schoolId: { userId, schoolId } } });
      // An account that had this school open falls back on another of its schools
      if (target.schoolId === schoolId) await tx.user.update({ where: { id: userId }, data: { schoolId: other.schoolId, role: other.role } });
    });
    await this.cache.del(`auth:user:${userId}`);
    return this.members(user, schoolId);
  }
}
