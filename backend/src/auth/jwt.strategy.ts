import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { resolveJwtSecret } from './jwt-secret';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  schoolId: string | null;
  purpose?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    // Intermediate tokens (MFA step) are never session tokens.
    if (payload.purpose) throw new UnauthorizedException();

    // Re-checked on every request: a suspended account or school loses access immediately,
    // and a role change takes effect without waiting for the token to expire.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, role: true, schoolId: true, school: { select: { isActive: true, plan: true, featureOverrides: true } } },
    });
    if (!user || user.status !== 'ACTIVE' || (user.school && !user.school.isActive)) {
      throw new UnauthorizedException();
    }
    // The school's plan travels with the request so FeatureGuard needs no extra query.
    return {
      userId: payload.sub,
      email: payload.email,
      role: user.role,
      schoolId: user.schoolId,
      school: user.school ? { plan: user.school.plan, featureOverrides: user.school.featureOverrides } : null,
    };
  }
}
