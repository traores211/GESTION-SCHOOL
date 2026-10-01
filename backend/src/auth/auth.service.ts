import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginRateLimiter } from './login-rate-limiter';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly rateLimiter: LoginRateLimiter,
  ) {}

  async login(email: string, password: string) {
    email = email.trim().toLowerCase();
    this.rateLimiter.assertAllowed(email);

    const user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    const passwordValid = !!user?.password && (await bcrypt.compare(password, user.password));
    if (!user || !passwordValid) {
      this.rateLimiter.recordFailure(email);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException("Ce compte est désactivé. Contactez l'administration de l'établissement.");
    }
    this.rateLimiter.reset(email);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }
}
