import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { RedisService } from '../infra/redis.service';
import { MailService } from '../infra/mail.service';
import { passwordProblem } from '../auth/password-policy';
import { SubscriptionState, TRIAL_DAYS, schoolCode, schoolYear, slugify, subscriptionState } from './subscription-rules';

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
      const user = await tx.user.create({ data: { email, password, firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), phone: dto.phone?.trim() || null, role: 'DIRECTOR', schoolId: school.id } });
      return { org, school, user };
    });

    this.logger.log(`Nouvel établissement inscrit : ${created.school.name} (${created.school.code})`);
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
    const state = await this.cache.remember(`subscription:${schoolId}`, CACHE_SECONDS, async () => {
      const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { organisation: { select: { subscriptionStatus: true, subscriptionPlan: true, trialEndsAt: true } } } });
      return school?.organisation ?? { subscriptionStatus: 'ACTIVE', subscriptionPlan: 'STARTER', trialEndsAt: null };
    });
    return subscriptionState({ ...state, trialEndsAt: state.trialEndsAt ? new Date(state.trialEndsAt) : null });
  }

  async mySubscription(user: AuthUser) {
    if (!user.schoolId) return subscriptionState({ subscriptionStatus: 'ACTIVE', subscriptionPlan: 'STARTER', trialEndsAt: null });
    return this.stateOfSchool(user.schoolId);
  }

  // ---------------------------------------------------------------- platform administration

  async organisations() {
    const orgs = await this.prisma.organisation.findMany({
      include: { schools: { select: { id: true, name: true, code: true, _count: { select: { students: true, users: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      email: o.email,
      createdAt: o.createdAt,
      ...subscriptionState(o),
      schools: o.schools.map((s) => ({ id: s.id, name: s.name, code: s.code, students: s._count.students, users: s._count.users })),
    }));
  }

  async updateOrganisation(id: string, dto: { status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED'; plan?: string; trialEndsAt?: string }) {
    const org = await this.prisma.organisation.findUnique({ where: { id }, include: { schools: { select: { id: true } } } });
    if (!org) throw new NotFoundException('Organisation introuvable');
    const updated = await this.prisma.organisation.update({
      where: { id },
      data: {
        ...(dto.status ? { subscriptionStatus: dto.status } : {}),
        ...(dto.plan ? { subscriptionPlan: dto.plan } : {}),
        ...(dto.trialEndsAt ? { trialEndsAt: new Date(dto.trialEndsAt) } : {}),
      },
    });
    await this.cache.del(...org.schools.map((s) => `subscription:${s.id}`));
    return { id: updated.id, name: updated.name, ...subscriptionState(updated) };
  }
}
