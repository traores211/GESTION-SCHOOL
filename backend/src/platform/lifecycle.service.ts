import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { AuthUser } from '../common/current-user.decorator';
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_REASONS,
  LifecycleReason,
  LifecycleState,
  assertTransition,
  isLifecycleState,
} from './lifecycle';
import { TRIAL_DAYS } from './subscription-rules';

export interface TransitionInput {
  /** Target state. Must be reachable from the current one. */
  to: LifecycleState;
  /** New plan (optional). STARTER / PRO / ENTERPRISE. */
  plan?: string;
  /** New trial end date (optional). Used for START_TRIAL and EXTEND_TRIAL. */
  trialEndsAt?: Date;
  /** Why the transition happens (controls the label shown in the history). */
  reason: LifecycleReason;
  /** Free text added by the operator (e.g. "payment received 2026-10-15"). */
  message?: string;
  /** MANUAL (default) / SIGNUP (self-service) / AUTO (trial expiry). */
  trigger?: 'MANUAL' | 'SIGNUP' | 'AUTO';
}

/**
 * The state machine of an organisation's subscription. Every transition is validated against
 * `lifecycle.ts`, written to `SchoolLifecycleEvent` (append-only) and mirrored on
 * `Organisation.subscriptionStatus`. The subscription cache is invalidated so the interceptor
 * sees the change at once.
 */
@Injectable()
export class LifecycleService {
  private readonly logger = new Logger('Lifecycle');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisService,
  ) {}

  /**
   * Applies a validated transition to an organisation. Idempotent: when `to` equals the current
   * state and no plan / trial change is requested, no event is written. On AUTO expiry a hint is
   * logged but no error is raised when the transition is already recorded.
   */
  async transition(user: AuthUser | null, organisationId: string, input: TransitionInput) {
    if (!isLifecycleState(input.to)) throw new BadRequestException(`Statut inconnu : ${input.to}`);
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, include: { schools: { select: { id: true } } } });
    if (!org) throw new NotFoundException('Organisation introuvable');
    if (user && user.role !== 'SUPER_ADMIN' && input.trigger !== 'AUTO') {
      throw new ForbiddenException('Seul un administrateur de la plateforme peut changer le cycle de vie');
    }

    const from = (isLifecycleState(org.subscriptionStatus) ? org.subscriptionStatus : 'ACTIVE') as LifecycleState;
    try {
      assertTransition(from, input.to);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    // Idempotent no-op: same state, same plan, same trial date → do not clutter the timeline.
    const noPlanChange = !input.plan || input.plan === org.subscriptionPlan;
    const noTrialChange = !input.trialEndsAt || (org.trialEndsAt && input.trialEndsAt.getTime() === org.trialEndsAt.getTime());
    if (from === input.to && noPlanChange && noTrialChange) {
      return { organisation: this.serialize(org), event: null };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextOrg = await tx.organisation.update({
        where: { id: organisationId },
        data: {
          subscriptionStatus: input.to,
          ...(input.plan ? { subscriptionPlan: input.plan } : {}),
          ...(input.trialEndsAt !== undefined ? { trialEndsAt: input.trialEndsAt } : {}),
        },
      });
      const event = await tx.schoolLifecycleEvent.create({
        data: {
          organisationId,
          fromStatus: from,
          toStatus: input.to,
          fromPlan: org.subscriptionPlan,
          toPlan: input.plan ?? null,
          trialEndsAt: input.trialEndsAt ?? nextOrg.trialEndsAt,
          reason: input.reason,
          message: input.message?.slice(0, 500) || null,
          operatorId: user?.userId ?? null,
          operatorName: user ? `${user.email}` : null,
          trigger: input.trigger ?? 'MANUAL',
        },
      });
      return { nextOrg, event };
    });

    // Drop the per-school subscription cache so the next request sees the new state.
    await this.cache.del(...org.schools.map((s) => `subscription:${s.id}`));
    this.logger.log(`${from} → ${input.to} (${LIFECYCLE_REASONS[input.reason]}) on ${org.name} by ${user?.email ?? 'system'}`);

    return { organisation: this.serialize(updated.nextOrg), event: this.serializeEvent(updated.event) };
  }

  /**
   * Looks at an organisation and, if its TRIAL is past its end date, promotes it to EXPIRED. The
   * caller does nothing when the state is already correct. Used by the platform listing and by
   * the subscription interceptor so the lifecycle timeline reflects reality without a cron.
   */
  async autoExpireIfNeeded(organisationId: string, now = new Date()): Promise<boolean> {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, select: { subscriptionStatus: true, trialEndsAt: true } });
    if (!org || org.subscriptionStatus !== 'TRIAL' || !org.trialEndsAt) return false;
    if (org.trialEndsAt.getTime() > now.getTime()) return false;
    try {
      await this.transition(null, organisationId, {
        to: 'EXPIRED',
        reason: 'EXPIRE',
        trigger: 'AUTO',
        message: `Essai expiré le ${org.trialEndsAt.toISOString().slice(0, 10)}`,
      });
      return true;
    } catch (err) {
      // Another request may have promoted it in parallel; fine, do not noise the logs.
      this.logger.debug(`autoExpire skipped on ${organisationId}: ${(err as Error).message}`);
      return false;
    }
  }

  /** The whole history of an organisation, newest first (capped at 100). */
  async history(organisationId: string) {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true } });
    if (!org) throw new NotFoundException('Organisation introuvable');
    const events = await this.prisma.schoolLifecycleEvent.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { operator: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return {
      organisation: { id: org.id, name: org.name },
      events: events.map((e) => this.serializeEvent(e)),
    };
  }

  /** Records the SIGNUP event when a school creates its own space. Non-throwing. */
  async recordSignup(organisationId: string, plan: string, trialEndsAt: Date | null, operatorId: string | null) {
    await this.prisma.schoolLifecycleEvent
      .create({
        data: {
          organisationId,
          fromStatus: null,
          toStatus: 'TRIAL',
          toPlan: plan,
          trialEndsAt,
          reason: 'SIGNUP',
          trigger: 'SIGNUP',
          operatorId,
          operatorName: null,
          message: null,
        },
      })
      .catch(() => undefined);
  }

  // ------------------------------------------------------------------ helpers

  private serialize(org: { id: string; name: string; subscriptionStatus: string; subscriptionPlan: string; trialEndsAt: Date | null }) {
    const status = isLifecycleState(org.subscriptionStatus) ? org.subscriptionStatus : 'ACTIVE';
    return {
      id: org.id,
      name: org.name,
      status,
      statusLabel: LIFECYCLE_LABELS[status],
      plan: org.subscriptionPlan,
      trialEndsAt: org.trialEndsAt,
    };
  }

  private serializeEvent(e: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    fromPlan: string | null;
    toPlan: string | null;
    trialEndsAt: Date | null;
    reason: string;
    message: string | null;
    operatorName: string | null;
    trigger: string;
    createdAt: Date;
    operator?: { id: string; firstName: string; lastName: string; email: string } | null;
  }) {
    return {
      id: e.id,
      fromStatus: e.fromStatus,
      fromStatusLabel: isLifecycleState(e.fromStatus) ? LIFECYCLE_LABELS[e.fromStatus] : null,
      toStatus: e.toStatus,
      toStatusLabel: isLifecycleState(e.toStatus) ? LIFECYCLE_LABELS[e.toStatus] : e.toStatus,
      fromPlan: e.fromPlan,
      toPlan: e.toPlan,
      trialEndsAt: e.trialEndsAt,
      reason: e.reason,
      reasonLabel: (LIFECYCLE_REASONS as Record<string, string>)[e.reason] ?? e.reason,
      message: e.message,
      operator: e.operator ? { id: e.operator.id, name: `${e.operator.firstName} ${e.operator.lastName}`, email: e.operator.email } : e.operatorName ? { id: null, name: e.operatorName, email: null } : null,
      trigger: e.trigger,
      createdAt: e.createdAt,
    };
  }

  /** Default trial end date based on the TRIAL_DAYS env setting. */
  static defaultTrialEnd(from = new Date()): Date {
    return new Date(from.getTime() + TRIAL_DAYS * 86400000);
  }
}
