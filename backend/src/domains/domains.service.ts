import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, SchoolDomain } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { QuotaService } from '../platform/quota.service';
import { DomainResolverService } from './domain-resolver.service';
import { CreateDomainDto, UpdateDomainDto } from './domains.dto';
import { checkDnsVerification, generateVerificationToken, verificationRecordName } from './verification';

type DomainWithRelations = SchoolDomain & {
  school: { id: string; name: string; code: string } | null;
  organisation: { id: string; name: string; slug: string } | null;
};

/**
 * CRUD and verification of custom domains for schools. All writes are audited; cross-tenant access
 * is forbidden even for an ADMIN_ORGANISATION (an organisation can only touch its own schools).
 */
@Injectable()
export class DomainsService {
  private readonly logger = new Logger('Domains');

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: DomainResolverService,
    private readonly quota: QuotaService,
  ) {}

  // ----------------------------------------------------------------- read

  /** List the domains visible to `user`. SUPER_ADMIN sees everything, others see their org. */
  async list(user: AuthUser, filter?: { schoolId?: string; organisationId?: string }) {
    const where = await this.scope(user, filter);
    const rows = await this.prisma.schoolDomain.findMany({
      where,
      include: {
        school: { select: { id: true, name: true, code: true } },
        organisation: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return rows.map((r) => this.serialize(r as DomainWithRelations));
  }

  async get(user: AuthUser, id: string) {
    const row = await this.load(id);
    await this.assertVisible(user, row);
    return this.serialize(row);
  }

  // ----------------------------------------------------------------- write

  async create(user: AuthUser, schoolId: string, dto: CreateDomainDto) {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, organisationId: true } });
    if (!school) throw new NotFoundException('Établissement introuvable');
    await this.assertCanManage(user, school.organisationId);

    const hostname = dto.hostname.toLowerCase().trim();
    if (!this.isAllowedHostname(hostname)) {
      throw new BadRequestException('Ce nom de domaine est réservé et ne peut pas être associé à un établissement');
    }
    const existing = await this.prisma.schoolDomain.findUnique({ where: { hostname } });
    if (existing) throw new ConflictException("Ce nom de domaine est déjà associé à un établissement");

    const kind = dto.kind ?? 'CUSTOM_DOMAIN';
    // SUBDOMAIN of the platform does not count against the quota (we control the parent zone).
    if (kind !== 'SUBDOMAIN') await this.quota.assertCanCreate(user, 'customDomains');
    // A subdomain of the platform doesn't need DNS verification (we control the parent zone).
    const auto = kind === 'SUBDOMAIN' && this.isPlatformSubdomain(hostname);
    const created = await this.prisma.schoolDomain.create({
      data: {
        schoolId: school.id,
        organisationId: school.organisationId,
        hostname,
        kind,
        isPrimary: !!dto.isPrimary && auto, // Only mark as primary immediately when auto-verified.
        status: auto ? 'ACTIVE' : 'PENDING',
        verificationToken: generateVerificationToken(),
        verificationMethod: 'DNS_TXT',
        verifiedAt: auto ? new Date() : null,
        sslStatus: auto ? 'NOT_APPLICABLE' : 'PENDING',
        notes: dto.notes || null,
        createdById: user.userId,
      },
    });
    if (dto.isPrimary && auto) await this.enforceSinglePrimary(created.schoolId, created.id);
    await this.resolver.invalidate(created.hostname);
    await this.quota.invalidate(school.organisationId);
    await this.auditEvent(user, 'CREATE', created.id, null, this.auditPayload(created));
    return this.get(user, created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateDomainDto) {
    const current = await this.prisma.schoolDomain.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Domaine introuvable');
    await this.assertCanManage(user, current.organisationId);

    // isPrimary = true only works when the domain is already ACTIVE: never publish an unverified
    // host as the canonical one.
    if (dto.isPrimary === true && current.status !== 'ACTIVE') {
      throw new BadRequestException("Vérifiez le domaine avant d'en faire le domaine principal");
    }
    // SUPER_ADMIN only may suspend; an organisation admin cannot suspend their own (they would then
    // be locked out of their own host). They can delete it instead.
    if (dto.status === 'SUSPENDED' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Seul un administrateur de la plateforme peut suspendre un domaine');
    }

    const before = this.auditPayload(current);
    const updated = await this.prisma.schoolDomain.update({
      where: { id },
      data: {
        ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
      },
    });
    if (dto.isPrimary === true) await this.enforceSinglePrimary(updated.schoolId, updated.id);
    await this.resolver.invalidate(updated.hostname);
    await this.auditEvent(user, 'UPDATE', updated.id, before, this.auditPayload(updated));
    return this.get(user, updated.id);
  }

  async remove(user: AuthUser, id: string) {
    const row = await this.prisma.schoolDomain.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Domaine introuvable');
    await this.assertCanManage(user, row.organisationId);
    await this.prisma.schoolDomain.delete({ where: { id } });
    await this.resolver.invalidate(row.hostname);
    await this.quota.invalidate(row.organisationId);
    await this.auditEvent(user, 'DELETE', row.id, this.auditPayload(row), null);
    return { ok: true };
  }

  // ----------------------------------------------------------------- verification

  /** Returns the TXT record the school needs to publish to prove ownership. */
  async verificationInstructions(user: AuthUser, id: string) {
    const row = await this.load(id);
    await this.assertVisible(user, row);
    return {
      hostname: row.hostname,
      status: row.status,
      verifiedAt: row.verifiedAt,
      recordType: 'TXT',
      recordName: verificationRecordName(row.hostname),
      recordValue: row.verificationToken,
      dnsHint: `Créez un enregistrement TXT « ${verificationRecordName(row.hostname)} » avec la valeur « ${row.verificationToken} », puis pointez ${row.hostname} vers l'adresse IP de la plateforme (enregistrement A).`,
    };
  }

  /**
   * Attempts to verify the domain by DNS TXT lookup. Promotes the row to ACTIVE on success, or
   * records the error on failure. Idempotent: an already-verified domain stays ACTIVE and refreshes
   * `lastCheckedAt`.
   */
  async verify(user: AuthUser, id: string, resolver?: Parameters<typeof checkDnsVerification>[2]) {
    const row = await this.prisma.schoolDomain.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Domaine introuvable');
    await this.assertCanManage(user, row.organisationId);

    const now = new Date();
    await this.prisma.schoolDomain.update({ where: { id }, data: { status: row.status === 'ACTIVE' ? 'ACTIVE' : 'VERIFYING', lastCheckedAt: now } });
    const check = await checkDnsVerification(row.hostname, row.verificationToken, resolver);
    if (check.ok) {
      const updated = await this.prisma.schoolDomain.update({
        where: { id },
        data: { status: 'ACTIVE', verifiedAt: row.verifiedAt ?? now, lastCheckedAt: now, lastError: null },
      });
      await this.resolver.invalidate(updated.hostname);
      await this.auditEvent(user, 'VERIFY', updated.id, { status: row.status }, { status: 'ACTIVE' });
      return { ok: true, status: 'ACTIVE', verifiedAt: updated.verifiedAt };
    }
    const updated = await this.prisma.schoolDomain.update({
      where: { id },
      data: {
        status: row.status === 'ACTIVE' ? 'ACTIVE' : 'FAILED', // keep a previously verified domain live
        lastCheckedAt: now,
        lastError: check.error || `Jeton attendu non trouvé (TXT reçus : ${check.foundTokens.join(', ') || 'aucun'})`,
      },
    });
    await this.resolver.invalidate(updated.hostname);
    return { ok: false, status: updated.status, error: updated.lastError, foundTokens: check.foundTokens };
  }

  // ----------------------------------------------------------------- helpers

  private async load(id: string): Promise<DomainWithRelations> {
    const row = await this.prisma.schoolDomain.findUnique({
      where: { id },
      include: {
        school: { select: { id: true, name: true, code: true } },
        organisation: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!row) throw new NotFoundException('Domaine introuvable');
    return row as DomainWithRelations;
  }

  private serialize(row: DomainWithRelations) {
    return {
      id: row.id,
      hostname: row.hostname,
      kind: row.kind,
      status: row.status,
      isPrimary: row.isPrimary,
      verificationToken: row.verificationToken,
      verificationMethod: row.verificationMethod,
      verifiedAt: row.verifiedAt,
      sslStatus: row.sslStatus,
      sslIssuedAt: row.sslIssuedAt,
      lastCheckedAt: row.lastCheckedAt,
      lastError: row.lastError,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      school: row.school,
      organisation: row.organisation,
      verificationRecord: {
        type: 'TXT',
        name: verificationRecordName(row.hostname),
        value: row.verificationToken,
      },
    };
  }

  /** The user's own organisation id, resolved from the open school. Null for a SUPER_ADMIN acting alone. */
  private async organisationOfUser(user: AuthUser): Promise<string | null> {
    if (!user.schoolId) return null;
    const school = await this.prisma.school.findUnique({ where: { id: user.schoolId }, select: { organisationId: true } });
    return school?.organisationId ?? null;
  }

  private async scope(user: AuthUser, filter?: { schoolId?: string; organisationId?: string }): Promise<Prisma.SchoolDomainWhereInput> {
    const base: Prisma.SchoolDomainWhereInput = {};
    if (filter?.schoolId) base.schoolId = filter.schoolId;
    if (filter?.organisationId) base.organisationId = filter.organisationId;
    if (user.role === 'SUPER_ADMIN') return base;
    if (user.role === 'ADMIN_ORGANISATION') {
      const orgId = await this.organisationOfUser(user);
      return { ...base, organisationId: orgId ?? '__none__' };
    }
    return { ...base, schoolId: user.schoolId ?? '__none__' };
  }

  private async assertVisible(user: AuthUser, row: { organisationId: string; schoolId: string }) {
    if (user.role === 'SUPER_ADMIN') return;
    if (user.role === 'ADMIN_ORGANISATION') {
      const orgId = await this.organisationOfUser(user);
      if (orgId !== row.organisationId) throw new ForbiddenException("Vous n'avez pas accès à ce domaine");
      return;
    }
    if (row.schoolId !== user.schoolId) throw new ForbiddenException("Vous n'avez pas accès à ce domaine");
  }

  private async assertCanManage(user: AuthUser, organisationId: string) {
    if (user.role === 'SUPER_ADMIN') return;
    if (user.role !== 'ADMIN_ORGANISATION' && user.role !== 'DIRECTOR') {
      throw new ForbiddenException('Votre rôle ne permet pas de gérer les domaines');
    }
    const orgId = await this.organisationOfUser(user);
    if (orgId !== organisationId) {
      throw new ForbiddenException('Vous ne pouvez gérer que les domaines de votre organisation');
    }
  }

  private async enforceSinglePrimary(schoolId: string, keepId: string) {
    await this.prisma.schoolDomain.updateMany({ where: { schoolId, isPrimary: true, NOT: { id: keepId } }, data: { isPrimary: false } });
  }

  private isAllowedHostname(hostname: string): boolean {
    if (hostname === this.resolver.platformHostname) return false;
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
    return true;
  }

  private isPlatformSubdomain(hostname: string): boolean {
    const suffix = this.resolver.subdomainSuffix;
    return suffix.length > 0 && hostname.endsWith(`.${suffix}`);
  }

  private auditPayload(row: SchoolDomain) {
    const { hostname, kind, status, isPrimary, schoolId, organisationId } = row;
    return { hostname, kind, status, isPrimary, schoolId, organisationId };
  }

  private async auditEvent(user: AuthUser, action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VERIFY', resourceId: string, before: unknown, after: unknown) {
    await this.prisma.auditLog.create({
      data: {
        action,
        resource: 'domains',
        resourceId,
        userId: user.userId,
        schoolId: user.schoolId,
        oldValues: before ? JSON.stringify(before) : null,
        newValues: after ? JSON.stringify(after) : null,
      },
    });
    this.logger.log(`${action} ${resourceId} by ${user.email}`);
  }
}
