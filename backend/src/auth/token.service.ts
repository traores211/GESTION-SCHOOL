import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';

export const REFRESH_COOKIE = 'erp_refresh';
export const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
export const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  schoolId: string | null;
}

/**
 * Short-lived access tokens (JWT, 15 min) and rotating refresh tokens (random, stored hashed,
 * 30 days). Presenting a refresh token that was already rotated revokes its whole family: a stolen
 * token stops working as soon as the legitimate user refreshes.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cache: RedisService,
  ) {}

  accessToken(user: SessionUser) {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role, schoolId: user.schoolId }, { expiresIn: ACCESS_TTL as never });
  }

  async issueRefresh(userId: string, meta: { userAgent?: string; ip?: string }, family: string = randomUUID()) {
    const token = randomBytes(48).toString('base64url');
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        family,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400000),
        userAgent: meta.userAgent?.slice(0, 200),
        ip: meta.ip,
      },
    });
    return { token, id: row.id, expiresAt: row.expiresAt };
  }

  /** Exchanges a refresh token for a new pair; refuses expired, revoked or reused tokens. */
  async rotate(token: string | undefined, meta: { userAgent?: string; ip?: string }) {
    if (!token) throw new UnauthorizedException('Session expirée');
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!row) throw new UnauthorizedException('Session expirée');
    if (row.revokedAt) {
      // Reuse of a rotated token: someone else may hold it. Cut the whole family.
      await this.prisma.refreshToken.updateMany({ where: { family: row.family, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Session révoquée, reconnectez-vous');
    }
    if (row.expiresAt < new Date() || row.user.status !== 'ACTIVE') throw new UnauthorizedException('Session expirée');
    const next = await this.issueRefresh(row.userId, meta, row.family);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedById: next.id } });
    return { user: row.user, refresh: next, accessToken: this.accessToken(row.user) };
  }

  async revoke(token: string | undefined) {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Signs the user out everywhere: refresh tokens revoked, access tokens refused from now on. */
  async revokeAll(userId: string) {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date() } }),
    ]);
    await this.forget(userId);
  }

  /** Drops the cached account state read by the JWT strategy (status, role, password date). */
  forget(userId: string) {
    return this.cache.del(`auth:user:${userId}`);
  }

  async activeSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, userAgent: true, ip: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
