import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { jwtSecret } from './jwt-secret';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  schoolId: string | null;
  iat?: number;
}

/**
 * Validates the access token and checks the account is still allowed: a deactivated account, a
 * changed password or "sign out everywhere" cut existing tokens immediately (checked against the
 * database, cached 30 s).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const state = await this.cache.remember(`auth:user:${payload.sub}`, 30, async () => {
      const u = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true, passwordChangedAt: true, role: true, schoolId: true, school: { select: { isActive: true } } } });
      return u ? { status: u.status, changedAt: u.passwordChangedAt ? Math.floor(u.passwordChangedAt.getTime() / 1000) : 0, role: u.role, schoolId: u.schoolId, schoolActive: u.school?.isActive ?? true } : null;
    });
    if (!state || state.status !== 'ACTIVE') throw new UnauthorizedException('Compte désactivé');
    // A deactivated school shuts its accounts out; the administrators of the group or platform still get in.
    if (state.schoolActive === false && !['SUPER_ADMIN', 'ADMIN_ORGANISATION'].includes(state.role)) throw new UnauthorizedException('Cet établissement est désactivé');
    if (payload.iat && payload.iat < state.changedAt) throw new UnauthorizedException('Session expirée, reconnectez-vous');
    // Role and school come from the database: a role change applies without waiting for the token to expire.
    return { userId: payload.sub, email: payload.email, role: state.role, schoolId: state.schoolId };
  }
}
