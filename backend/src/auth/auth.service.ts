import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { MessagingService } from '../messaging/messaging.service';
import { generateSecret, otpauthUrl, verifyTotp } from './totp';

/** Roles for which MFA is mandatory once the platform enforces it (MFA_REQUIRED_ROLES). */
export const SENSITIVE_ROLES = ['DIRECTOR', 'COMPTABLE', 'SUPER_ADMIN', 'ADMIN_ORGANISATION', 'PLATFORM_ADMIN'];

// Pre-computed hash used when the account does not exist, so response time does not reveal it.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { school: { select: { isActive: true } } },
    });
    const passwordValid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

    if (!user || !user.password || !passwordValid) {
      // Logged without the password nor the full email (personal data).
      this.logger.warn(`Login failed for ${email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    if (user.status !== 'ACTIVE' || (user.school && !user.school.isActive)) {
      this.logger.warn(`Login refused for inactive account ${user.id}`);
      throw new UnauthorizedException("Ce compte n'est pas actif");
    }

    if (user.mfaEnabled && user.mfaSecret) {
      // Second step required: a short-lived token that only /auth/mfa/verify accepts.
      const mfaToken = this.jwtService.sign({ sub: user.id, purpose: 'mfa' }, { expiresIn: '5m' });
      return { mfaRequired: true, mfaToken };
    }
    return this.issueSession(user);
  }

  async verifyMfa(mfaToken: string, code: string) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = this.jwtService.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('Session de vérification expirée, reconnectez-vous');
    }
    if (payload.purpose !== 'mfa') throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.mfaSecret || !verifyTotp(user.mfaSecret, code)) {
      this.logger.warn(`MFA code rejected for user ${payload.sub}`);
      throw new UnauthorizedException('Code de vérification invalide');
    }
    return this.issueSession(user);
  }

  /** Step 1 of MFA enrolment: generates a secret (not active until confirmed with a valid code). */
  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new BadRequestException('La double authentification est déjà active');
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  async enableMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret || !verifyTotp(user.mfaSecret, code)) throw new BadRequestException('Code invalide');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.record({ userId, schoolId: user.schoolId }, 'MFA_ENABLE', 'User', userId);
    return { mfaEnabled: true };
  }

  /** Always answers the same way whether or not the email exists (no account enumeration). */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (user && user.status === 'ACTIVE') {
      const token = randomBytes(32).toString('base64url');
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetHash: sha256(token), passwordResetExpires: new Date(Date.now() + 15 * 60_000) },
      });
      const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reinitialiser?token=${token}`;
      await this.messaging.send(
        user.schoolId,
        'EMAIL',
        user.email,
        `Bonjour ${user.firstName},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 15 minutes) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
        'Réinitialisation de votre mot de passe',
      );
    }
    return { message: 'Si un compte existe pour cette adresse, un email de réinitialisation a été envoyé.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { passwordResetHash: sha256(token), passwordResetExpires: { gt: new Date() } },
    });
    if (!user) throw new BadRequestException('Lien invalide ou expiré');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10), passwordResetHash: null, passwordResetExpires: null },
    });
    await this.audit.record({ userId: user.id, schoolId: user.schoolId }, 'PASSWORD_RESET', 'User', user.id);
    return { success: true };
  }

  private async issueSession(user: { id: string; email: string; role: string; schoolId: string | null; firstName: string; lastName: string }) {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const payload = { sub: user.id, email: user.email, role: user.role, schoolId: user.schoolId };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    };
  }
}
