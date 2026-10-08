import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../infra/mail.service';
import { RedisService } from '../infra/redis.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { passwordProblem } from './password-policy';
import { TokenService, hashToken } from './token.service';
import { GroupService } from '../platform/group.service';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

/** Roles that must protect their account with two-factor authentication (comma-separated env). */
export const TOTP_REQUIRED_ROLES = (process.env.TOTP_REQUIRED_ROLES ?? 'SUPER_ADMIN,ADMIN_ORGANISATION,DIRECTOR,COMPTABLE')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

export class TotpRequiredError extends UnauthorizedException {
  constructor(message = 'Code de vérification requis') {
    super({ statusCode: 401, message, code: 'TOTP_REQUIRED' });
  }
}

const RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly mail: MailService,
    private readonly store: RedisService,
    private readonly group: GroupService,
  ) {}

  private profile(user: { id: string; email: string; firstName: string; lastName: string; role: string; totpEnabled: boolean }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      totpEnabled: user.totpEnabled,
      /** The account should enable two-factor authentication (role at risk, not yet enabled). */
      totpRecommended: !user.totpEnabled && TOTP_REQUIRED_ROLES.includes(user.role),
    };
  }

  /** Sign-ins (successful or not) go to the audit journal; a journal failure never blocks sign-in. */
  private async journal(action: 'LOGIN' | 'LOGIN_FAILED', user: { id: string; schoolId: string | null } | null, meta: ClientMeta, details: object) {
    await this.prisma.auditLog
      .create({
        data: {
          action,
          resource: 'auth/login',
          resourceId: user?.id ?? '-',
          userId: user?.id ?? null,
          schoolId: user?.schoolId ?? null,
          newValues: JSON.stringify(details),
          ipAddress: meta.ip?.replace('::ffff:', '') ?? null,
          userAgent: meta.userAgent?.slice(0, 200) ?? null,
        },
      })
      .catch(() => undefined);
  }

  /** A TOTP code is valid once, within ±30 s. */
  private async checkTotp(userId: string, secret: string, code: string | undefined) {
    const token = (code ?? '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) return false;
    const result = await verify({ secret, token, epochTolerance: 30 } as never).catch(() => ({ valid: false }));
    if (!(result as { valid: boolean }).valid) return false;
    const replayKey = `totp:used:${userId}:${token}`;
    if (await this.store.get(replayKey)) return false;
    await this.store.set(replayKey, '1', 90);
    return true;
  }

  async login(email: string, password: string, totp: string | undefined, meta: ClientMeta) {
    email = email.trim().toLowerCase();
    await this.rateLimiter.assertAllowed(email, meta.ip);

    const user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    const passwordValid = !!user?.password && (await bcrypt.compare(password, user.password));
    if (!user || !passwordValid) {
      await this.rateLimiter.recordFailure(email, meta.ip);
      await this.journal('LOGIN_FAILED', user, meta, { email, reason: user ? 'mot de passe incorrect' : 'compte inconnu' });
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException("Ce compte est désactivé. Contactez l'administration de l'établissement.");
    }
    if (user.totpEnabled && user.totpSecret) {
      if (!totp) throw new TotpRequiredError();
      if (!(await this.checkTotp(user.id, user.totpSecret, totp))) {
        await this.rateLimiter.recordFailure(email, meta.ip);
        await this.journal('LOGIN_FAILED', user, meta, { email, reason: 'code de double authentification incorrect' });
        throw new TotpRequiredError('Code de vérification incorrect ou expiré');
      }
    }
    await this.rateLimiter.reset(email);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await this.journal('LOGIN', user, meta, { email, twoFactor: user.totpEnabled });

    const refresh = await this.tokens.issueRefresh(user.id, meta);
    return { accessToken: this.tokens.accessToken(user), refresh, user: this.profile(user) };
  }

  async refresh(token: string | undefined, meta: ClientMeta) {
    const result = await this.tokens.rotate(token, meta);
    return { accessToken: result.accessToken, refresh: result.refresh, user: this.profile(result.user) };
  }

  logout(token: string | undefined) {
    return this.tokens.revoke(token);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { ...this.profile(user), sessions: await this.tokens.activeSessions(userId) };
  }

  /** Schools the account may open (one for most accounts, several in a school group). */
  schools(userId: string) {
    return this.group.reachable(userId);
  }

  /** Opens another school of the group and returns a token for it. */
  async switchSchool(userId: string, schoolId: string, meta: ClientMeta) {
    const school = await this.group.switchSchool(userId, schoolId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.prisma.auditLog
      .create({ data: { action: 'SWITCH_SCHOOL', resource: 'auth/switch-school', resourceId: schoolId, userId, schoolId, newValues: JSON.stringify({ school: school.name }), ipAddress: meta.ip?.replace('::ffff:', '') ?? null, userAgent: meta.userAgent?.slice(0, 200) ?? null } })
      .catch(() => undefined);
    return { accessToken: this.tokens.accessToken(user), user: this.profile(user), school };
  }

  // ---------------------------------------------------------------- passwords

  /** Always answers the same way, whether the account exists or not (no account enumeration). */
  async forgotPassword(email: string, meta: ClientMeta) {
    email = email.trim().toLowerCase();
    const allowed = (await this.rateLimiter.hit(`reset:${email}`, 3, 3600)) && (await this.rateLimiter.hit(`reset-ip:${meta.ip ?? '?'}`, 20, 3600));
    const answer = { success: true, message: 'Si un compte correspond à cette adresse, un lien de réinitialisation vient d’être envoyé.' };
    if (!allowed) return answer;
    const user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, status: 'ACTIVE' } });
    if (!user) return answer;
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordReset.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
    const link = `${process.env.FRONTEND_URL || 'http://localhost:1300'}/reset-password?token=${token}`;
    const sent = await this.mail.send({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe School ERP',
      text: `Bonjour ${user.firstName},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable une heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.\n\nSchool ERP`,
    });
    if (!sent && process.env.NODE_ENV !== 'production') this.logger.log(`Reset link for ${user.email}: ${link}`);
    return answer;
  }

  async resetPassword(token: string, password: string) {
    const row = await this.prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new BadRequestException('Lien invalide ou expiré : refaites une demande');
    const problem = passwordProblem(password, row.user);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { password: await bcrypt.hash(password, 12), passwordChangedAt: new Date() } }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.rateLimiter.reset(row.user.email);
    await this.tokens.forget(row.userId);
    return { success: true };
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.password || !(await bcrypt.compare(current, user.password))) throw new BadRequestException('Mot de passe actuel incorrect');
    const problem = passwordProblem(next, user);
    if (problem) throw new BadRequestException(problem);
    if (await bcrypt.compare(next, user.password)) throw new BadRequestException("Le nouveau mot de passe doit être différent de l'ancien");
    await this.prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(next, 12), passwordChangedAt: new Date() } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.tokens.forget(userId);
    return { success: true };
  }

  // ---------------------------------------------------------------- two-factor authentication

  /** Generates a new secret (not active until confirmed with a code) and its QR code. */
  async totpSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled) throw new BadRequestException('La double authentification est déjà active');
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    const uri = generateURI({ issuer: 'School ERP', label: user.email, secret });
    return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
  }

  async totpEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret) throw new BadRequestException("Commencez par générer le QR code");
    if (!(await this.checkTotp(userId, user.totpSecret, code))) throw new BadRequestException('Code incorrect : vérifiez l’heure de votre téléphone');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    return { success: true, totpEnabled: true };
  }

  async totpDisable(userId: string, password: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabled || !user.totpSecret) return { success: true, totpEnabled: false };
    if (!user.password || !(await bcrypt.compare(password, user.password))) throw new BadRequestException('Mot de passe incorrect');
    if (!(await this.checkTotp(userId, user.totpSecret, code))) throw new BadRequestException('Code incorrect');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecret: null } });
    return { success: true, totpEnabled: false };
  }

  /** Management can sign a user out of every device (lost phone, departure). */
  async revokeSessionsOf(actor: { role: string; schoolId: string | null }, userId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { schoolId: true, role: true } });
    if (!target) throw new BadRequestException('Utilisateur introuvable');
    const crossSchool = actor.role !== 'SUPER_ADMIN' && target.schoolId !== actor.schoolId;
    if (crossSchool) throw new ForbiddenException();
    await this.tokens.revokeAll(userId);
    return { success: true };
  }

  revokeAll(userId: string) {
    return this.tokens.revokeAll(userId);
  }
}
