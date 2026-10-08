import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { AuthUser } from '../common/current-user.decorator';
import { PLANS, PlanQuotas, QUOTA_KEYS, QUOTA_LABELS, QuotaKey, effectiveQuotas, isLimited, planOf } from './plans';

export interface QuotaStatus {
  key: QuotaKey;
  label: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  exceeded: boolean;
}

export interface QuotaReport {
  plan: string;
  planLabel: string;
  features: typeof PLANS.STARTER.features;
  quotas: QuotaStatus[];
}

const COUNT_CACHE_SECONDS = 30; // short so a bulk creation respects the quota in close-to-real-time

/**
 * Checks whether an organisation (identified by one of its schools or by its organisation id) is
 * still within the limits of its subscription plan. Called before every create that counts
 * towards a quota; a per-call Redis cache makes repeated checks cheap.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger('Quota');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisService,
  ) {}

  /** Full picture of what a user's organisation is allowed and what it currently uses. */
  async report(user: AuthUser): Promise<QuotaReport | null> {
    const org = await this.organisationOfUser(user);
    if (!org) return null;
    const quotas = effectiveQuotas(org.plan, org.overrides);
    const used = await this.currentUsage(org.id, org.schoolIds);
    return {
      plan: org.plan,
      planLabel: planOf(org.plan).label,
      features: planOf(org.plan).features,
      quotas: QUOTA_KEYS.map((key) => this.status(key, quotas[key], used[key])),
    };
  }

  /**
   * Throws **409 QUOTA_EXCEEDED** when creating one more unit of `kind` would exceed the quota.
   * Unknown schools / unlimited quotas simply return. Keep this cheap: callers invoke it on
   * every create.
   */
  async assertCanCreate(user: AuthUser, kind: QuotaKey, howMany = 1): Promise<void> {
    const org = await this.organisationOfUser(user);
    if (!org) return;
    const limit = effectiveQuotas(org.plan, org.overrides)[kind];
    if (!isLimited(limit)) return;
    const used = await this.countOne(org.id, org.schoolIds, kind);
    if (used + howMany > limit) {
      const label = QUOTA_LABELS[kind];
      throw new HttpException(
        {
          statusCode: 409,
          code: 'QUOTA_EXCEEDED',
          message: `Limite atteinte pour « ${label} » (${used} / ${limit}). Contactez l'éditeur pour passer à une formule supérieure.`,
          quota: kind,
          limit,
          used,
        },
        409,
      );
    }
  }

  /** True when the feature is enabled by the plan (returns true when the user is not school-scoped). */
  async hasFeature(user: AuthUser, feature: keyof typeof PLANS.STARTER.features): Promise<boolean> {
    const org = await this.organisationOfUser(user);
    if (!org) return true;
    return planOf(org.plan).features[feature];
  }

  /** Invalidates the usage cache of one organisation (called after bulk operations). */
  async invalidate(organisationId: string) {
    await this.cache.del(...QUOTA_KEYS.map((k) => `quota:${organisationId}:${k}`));
  }

  // ---------------------------------------------------------------- internals

  private status(key: QuotaKey, limit: number | null, used: number): QuotaStatus {
    return {
      key,
      label: QUOTA_LABELS[key],
      limit,
      used,
      remaining: isLimited(limit) ? Math.max(0, limit - used) : null,
      exceeded: isLimited(limit) && used >= limit,
    };
  }

  /** The organisation an authenticated user belongs to, resolved through their current school. */
  private async organisationOfUser(user: AuthUser): Promise<{ id: string; plan: string; overrides: Partial<PlanQuotas> | null; schoolIds: string[] } | null> {
    if (!user.schoolId) return null;
    const key = `quota:org-of-user:${user.userId}`;
    const cached = await this.cache.get(key);
    if (cached) return JSON.parse(cached);
    const school = await this.prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { organisationId: true, organisation: { select: { id: true, subscriptionPlan: true, quotaOverride: true, schools: { select: { id: true } } } } },
    });
    if (!school) return null;
    const payload = {
      id: school.organisation.id,
      plan: school.organisation.subscriptionPlan,
      overrides: school.organisation.quotaOverride
        ? {
            students: school.organisation.quotaOverride.students ?? null,
            staffUsers: school.organisation.quotaOverride.staffUsers ?? null,
            classes: school.organisation.quotaOverride.classes ?? null,
            schools: school.organisation.quotaOverride.schools ?? null,
            customDomains: school.organisation.quotaOverride.customDomains ?? null,
            storageMb: school.organisation.quotaOverride.storageMb ?? null,
            smsMonthly: school.organisation.quotaOverride.smsMonthly ?? null,
          }
        : null,
      schoolIds: school.organisation.schools.map((s) => s.id),
    };
    await this.cache.set(key, JSON.stringify(payload), COUNT_CACHE_SECONDS);
    return payload;
  }

  /** Fetch all counts in one go for the report; falls back to individual counts in parallel. */
  private async currentUsage(organisationId: string, schoolIds: string[]): Promise<Record<QuotaKey, number>> {
    const entries = await Promise.all(QUOTA_KEYS.map(async (k) => [k, await this.countOne(organisationId, schoolIds, k)] as const));
    return Object.fromEntries(entries) as Record<QuotaKey, number>;
  }

  /** Count the current usage for one quota key, cached for a few seconds. */
  private async countOne(organisationId: string, schoolIds: string[], key: QuotaKey): Promise<number> {
    const cacheKey = `quota:${organisationId}:${key}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return Number(cached);
    const value = await this.rawCount(organisationId, schoolIds, key);
    await this.cache.set(cacheKey, String(value), COUNT_CACHE_SECONDS);
    return value;
  }

  private async rawCount(organisationId: string, schoolIds: string[], key: QuotaKey): Promise<number> {
    switch (key) {
      case 'students':
        return this.prisma.student.count({ where: { schoolId: { in: schoolIds }, archivedAt: null } });
      case 'staffUsers':
        return this.prisma.user.count({ where: { schoolId: { in: schoolIds }, status: 'ACTIVE', role: { in: ['DIRECTOR', 'SECRETARY', 'COMPTABLE', 'ENSEIGNANT', 'SURVEILLANT', 'EDUCATEUR', 'ADMIN_ORGANISATION'] } } });
      case 'classes':
        return this.prisma.class.count({ where: { schoolId: { in: schoolIds }, archivedAt: null } });
      case 'schools':
        return this.prisma.school.count({ where: { organisationId, isActive: true } });
      case 'customDomains':
        return this.prisma.schoolDomain.count({ where: { organisationId, kind: { in: ['CUSTOM_DOMAIN', 'CUSTOM_DOMAIN_ALIAS'] }, status: { notIn: ['REMOVED'] } } });
      case 'storageMb': {
        // Sum of document bytes across the schools of the organisation, converted to Mb.
        const agg = await this.prisma.document.aggregate({ where: { schoolId: { in: schoolIds } }, _sum: { fileSize: true } });
        return Math.round((agg._sum.fileSize ?? 0) / (1024 * 1024));
      }
      case 'smsMonthly': {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        const agg = await this.prisma.messageLog.aggregate({ where: { schoolId: { in: schoolIds }, createdAt: { gte: start }, status: 'SENT' }, _sum: { segments: true } });
        return agg._sum.segments ?? 0;
      }
      default:
        return 0;
    }
  }
}
