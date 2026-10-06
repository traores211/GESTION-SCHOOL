import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { RedisService } from '../infra/redis.service';
import { MailService } from '../infra/mail.service';
import { passwordProblem } from '../auth/password-policy';
import { SubscriptionState, TRIAL_DAYS, schoolCode, schoolYear, slugify, subscriptionState } from './subscription-rules';
import { LifecycleReason, LifecycleState, isLifecycleState } from './lifecycle';
import { LifecycleService } from './lifecycle.service';

export interface SignupInput {
  schoolName: string;
  city?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const CACHE_SECONDS = 60;

/**
 * Self-service: a school creates its own space with a free trial; the platform administrator then
 * activates, extends or suspends the subscription. No payment is collected by the application.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger('Platform');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisService,
    private readonly mail: MailService,
    // Forward-ref kept short: LifecycleService uses RedisService, PlatformService uses LifecycleService.
    @Inject(forwardRef(() => LifecycleService)) private readonly lifecycle: LifecycleService,
  ) {}

  /** Open in development; in production only when SIGNUP_ENABLED=true. */
  get signupEnabled() {
    return process.env.SIGNUP_ENABLED ? process.env.SIGNUP_ENABLED === 'true' : process.env.NODE_ENV !== 'production';
  }

  async signup(dto: SignupInput) {
    if (!this.signupEnabled) throw new ForbiddenException("L'inscription en ligne n'est pas ouverte : contactez l'éditeur");
    const email = dto.email.trim().toLowerCase();
    const problem = passwordProblem(dto.password, { email, firstName: dto.firstName, lastName: dto.lastName });
    if (problem) throw new BadRequestException(problem);
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Un compte existe déjà avec cette adresse e-mail');
    const name = dto.schoolName.trim();
    if (await this.prisma.organisation.findFirst({ where: { OR: [{ name }, { email }] } })) throw new ConflictException('Un établissement est déjà inscrit sous ce nom ou cette adresse');

    const password = await bcrypt.hash(dto.password, 12);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000);
    const year = schoolYear(new Date());
    const base = slugify(name);

    const created = await this.prisma.$transaction(async (tx) => {
      const taken = await tx.organisation.count({ where: { slug: { startsWith: base } } });
      const org = await tx.organisation.create({
        data: { name, slug: taken ? `${base}-${taken + 1}` : base, email, phone: dto.phone?.trim() || null, city: dto.city?.trim() || null, subscriptionStatus: 'TRIAL', trialEndsAt },
      });
      // The counter makes the code unique; the loop covers a code already taken by hand.
      let number = (await tx.school.count()) + 1;
      while (await tx.school.findUnique({ where: { code: schoolCode(name, number) } })) number++;
      const school = await tx.school.create({
        data: { organisationId: org.id, name, code: schoolCode(name, number), email, phone: dto.phone?.trim() || null, city: dto.city?.trim() || null, currentAcademicYear: year.name },
      });
      await tx.academicYear.create({ data: { schoolId: school.id, name: year.name, startDate: year.startDate, endDate: year.endDate, isCurrent: true, terms: { create: year.terms } } });
      const user = await tx.user.create({ data: { email, password, firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), phone: dto.phone?.trim() || null, role: 'ADMIN_ORGANISATION', schoolId: school.id, memberships: { create: { schoolId: school.id, role: 'ADMIN_ORGANISATION' } } } });
      return { org, school, user };
    });

    this.logger.log(`Nouvel établissement inscrit : ${created.school.name} (${created.school.code})`);
    await this.lifecycle.recordSignup(created.org.id, 'STARTER', trialEndsAt, created.user.id);
    await this.mail
      .send({
        to: email,
        subject: `Bienvenue sur School ERP — ${created.school.name}`,
        text: `Bonjour ${dto.firstName},\n\nVotre espace ${created.school.name} est créé. Votre essai gratuit court jusqu'au ${trialEndsAt.toLocaleDateString('fr-FR')}.\n\nConnectez-vous avec ${email} : ${(process.env.FRONTEND_URL || 'http://localhost:1300').replace(/\/$/, '')}/login\n\nPour bien démarrer : créez vos classes, puis importez vos élèves depuis « Imports Excel ».`,
      })
      .catch(() => undefined);
    return { schoolCode: created.school.code, schoolName: created.school.name, email, trialEndsAt, trialDays: TRIAL_DAYS };
  }

  /** Subscription of a school, cached for a minute (it is read on every write request). */
  async stateOfSchool(schoolId: string): Promise<SubscriptionState> {
    // Fresh DB read each time the trial is about to expire; the cache otherwise saves ~60s of
    // reads. Reading the row (not the whole organisation) keeps this call cheap.
    const cached = await this.cache.get(`subscription:${schoolId}`);
    let state: { organisationId: string | null; subscriptionStatus: string; subscriptionPlan: string; trialEndsAt: string | Date | null };
    if (cached) {
      state = JSON.parse(cached);
    } else {
      const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { organisationId: true, organisation: { select: { subscriptionStatus: true, subscriptionPlan: true, trialEndsAt: true } } } });
      state = school?.organisation
        ? { organisationId: school.organisationId, ...school.organisation }
        : { organisationId: null, subscriptionStatus: 'ACTIVE', subscriptionPlan: 'STARTER', trialEndsAt: null };
      await this.cache.set(`subscription:${schoolId}`, JSON.stringify(state), CACHE_SECONDS);
    }

    const computed = subscriptionState({
      subscriptionStatus: state.subscriptionStatus,
      subscriptionPlan: state.subscriptionPlan,
      trialEndsAt: state.trialEndsAt ? new Date(state.trialEndsAt) : null,
    });

    // Lazy expiry: a TRIAL whose end date is past gets promoted to EXPIRED so the timeline shows
    // the real state. Done synchronously (write + cache invalidation) so the caller sees the new
    // status on its next read without waiting for a background task to catch up.
    if (state.organisationId && computed.status === 'TRIAL' && computed.readOnly) {
      const promoted = await this.lifecycle.autoExpireIfNeeded(state.organisationId).catch(() => false);
      if (promoted) {
        return subscriptionState({
          subscriptionStatus: 'EXPIRED',
          subscriptionPlan: state.subscriptionPlan,
          trialEndsAt: state.trialEndsAt ? new Date(state.trialEndsAt) : null,
        });
      }
    }
    return computed;
  }

  async mySubscription(user: AuthUser) {
    if (!user.schoolId) return subscriptionState({ subscriptionStatus: 'ACTIVE', subscriptionPlan: 'STARTER', trialEndsAt: null });
    return this.stateOfSchool(user.schoolId);
  }

  /** Drop the per-school subscription cache (used by lifecycle writes and by test harnesses). */
  async invalidateSubscriptionCache(schoolIds: string[]) {
    if (!schoolIds.length) return;
    await this.cache.del(...schoolIds.map((id) => `subscription:${id}`));
  }

  // ---------------------------------------------------------------- platform administration

  async organisations() {
    const orgs = await this.prisma.organisation.findMany({
      include: { schools: { select: { id: true, name: true, code: true, isActive: true, _count: { select: { students: true, users: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      email: o.email,
      createdAt: o.createdAt,
      ...subscriptionState(o),
      schools: o.schools.map((s) => ({ id: s.id, name: s.name, code: s.code, isActive: s.isActive, students: s._count.students, users: s._count.users })),
    }));
  }

  /** The platform administrator closes or reopens a school: its accounts are shut out or let in at once. */
  async setSchoolActive(id: string, isActive: boolean) {
    const school = await this.prisma.school.findUnique({ where: { id }, select: { id: true } });
    if (!school) throw new NotFoundException('Établissement introuvable');
    const updated = await this.prisma.school.update({ where: { id }, data: { isActive }, select: { id: true, name: true, code: true, isActive: true } });
    const users = await this.prisma.user.findMany({ where: { schoolId: id }, select: { id: true } });
    if (users.length) await this.cache.del(...users.map((u) => `auth:user:${u.id}`));
    return updated;
  }

  async updateOrganisation(user: AuthUser, id: string, dto: { status?: LifecycleState; plan?: string; trialEndsAt?: string; message?: string }) {
    const org = await this.prisma.organisation.findUnique({ where: { id }, include: { schools: { select: { id: true } } } });
    if (!org) throw new NotFoundException('Organisation introuvable');

    // Nothing changed → return the current state without writing an event.
    if (!dto.status && !dto.plan && !dto.trialEndsAt) {
      return { id: org.id, name: org.name, ...subscriptionState(org) };
    }

    // Any status / plan / trial change goes through the lifecycle machine, so it is validated
    // against the allowed transitions and recorded on the timeline. Pure plan changes (same
    // state) are handled too.
    const current = (isLifecycleState(org.subscriptionStatus) ? org.subscriptionStatus : 'ACTIVE') as LifecycleState;
    const target: LifecycleState = dto.status ?? current;
    const reason: LifecycleReason = this.reasonFor(current, target, { plan: dto.plan, trialEndsAt: dto.trialEndsAt });
    await this.lifecycle.transition(user, id, {
      to: target,
      reason,
      plan: dto.plan,
      trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
      message: dto.message,
    });

    const refreshed = await this.prisma.organisation.findUniqueOrThrow({ where: { id } });
    return { id: refreshed.id, name: refreshed.name, ...subscriptionState(refreshed) };
  }

  /** Pick the right lifecycle reason label for a (from, to, data) tuple. Pure, no I/O. */
  private reasonFor(from: LifecycleState, to: LifecycleState, data: { plan?: string; trialEndsAt?: string }): LifecycleReason {
    if (from === to) {
      if (data.trialEndsAt && to === 'TRIAL') return 'EXTEND_TRIAL';
      if (data.plan) return 'PLAN_CHANGE';
      return 'ACTIVATE';
    }
    switch (to) {
      case 'TRIAL':
        return from === 'ACTIVE' ? 'EXTEND_TRIAL' : 'START_TRIAL';
      case 'ACTIVE':
        return from === 'SUSPENDED' || from === 'EXPIRED' ? 'REOPEN' : 'ACTIVATE';
      case 'SUSPENDED':
        return 'SUSPEND';
      case 'EXPIRED':
        return 'EXPIRE';
      case 'CLOSED':
        return 'CLOSE';
      case 'PENDING':
        return 'VALIDATE';
      case 'PROSPECT':
        return 'VALIDATE';
      default:
        return 'ACTIVATE';
    }
  }
}
