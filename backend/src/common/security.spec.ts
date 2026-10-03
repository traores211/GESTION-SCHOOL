import { ExecutionContext, ForbiddenException, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';
import { ALL_STAFF, FINANCE, MANAGEMENT, OFFICE, TEACHING } from './roles';
import { PrismaExceptionFilter } from './prisma-exception.filter';
import { LoginRateLimiter } from '../auth/login-rate-limiter';
import { jwtSecret } from '../auth/jwt-secret';
import { passwordProblem } from '../auth/password-policy';
import { RedisService } from '../infra/redis.service';
import { validateEnv } from '../infra/env';

function context(role: string | undefined, required?: readonly string[]): [RolesGuard, ExecutionContext] {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => (key === ROLES_KEY ? required : undefined));
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
  return [new RolesGuard(reflector), ctx];
}

describe('role groups', () => {
  it('never grant school data to parents or students', () => {
    for (const group of [MANAGEMENT, OFFICE, FINANCE, TEACHING, ALL_STAFF]) {
      expect(group).not.toContain('PARENT');
      expect(group).not.toContain('ELEVE');
    }
  });

  it('keep teachers out of management and finance', () => {
    expect(MANAGEMENT).not.toContain('ENSEIGNANT');
    expect(FINANCE).not.toContain('ENSEIGNANT');
    expect(TEACHING).toContain('ENSEIGNANT');
  });
});

describe('RolesGuard', () => {
  it('lets through routes without @Roles', () => {
    const [guard, ctx] = context('PARENT', undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('accepts an allowed role and refuses others with a clear 403', () => {
    const [allowed, ctx1] = context('DIRECTOR', MANAGEMENT);
    expect(allowed.canActivate(ctx1)).toBe(true);
    const [refused, ctx2] = context('PARENT', MANAGEMENT);
    expect(() => refused.canActivate(ctx2)).toThrow(ForbiddenException);
    const [anonymous, ctx3] = context(undefined, MANAGEMENT);
    expect(() => anonymous.canActivate(ctx3)).toThrow(ForbiddenException);
  });
});

describe('LoginRateLimiter', () => {
  afterEach(() => jest.useRealTimers());

  it('blocks an email after 10 failures and releases it after the window', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const limiter = new LoginRateLimiter(new RedisService());
    for (let i = 0; i < 10; i++) await limiter.recordFailure('A@school.local');
    await expect(limiter.assertAllowed('a@school.local')).rejects.toThrow(HttpException);
    jest.setSystemTime(1_000_000 + 16 * 60 * 1000);
    await expect(limiter.assertAllowed('a@school.local')).resolves.toBeUndefined();
  });

  it('also limits by IP address, across accounts', async () => {
    const limiter = new LoginRateLimiter(new RedisService());
    for (let i = 0; i < 50; i++) await limiter.recordFailure(`user${i}@school.local`, '10.0.0.1');
    await expect(limiter.assertAllowed('new@school.local', '10.0.0.1')).rejects.toThrow(/Trop de tentatives/);
    await expect(limiter.assertAllowed('new@school.local', '10.0.0.2')).resolves.toBeUndefined();
  });

  it('resets on success', async () => {
    const limiter = new LoginRateLimiter(new RedisService());
    for (let i = 0; i < 10; i++) await limiter.recordFailure('b@school.local');
    await limiter.reset('b@school.local');
    await expect(limiter.assertAllowed('b@school.local')).resolves.toBeUndefined();
  });
});

describe('password policy', () => {
  it('requires 10 characters with letters and digits, refuses common and personal passwords', () => {
    expect(passwordProblem('court1')).toMatch(/trop court/);
    expect(passwordProblem('seulementdeslettres')).toMatch(/trop simple/);
    expect(passwordProblem('1234567890')).toMatch(/trop simple|courant/);
    expect(passwordProblem('Password123')).toMatch(/courant/);
    expect(passwordProblem('kouassi2026!', { lastName: 'Kouassi' })).toMatch(/votre nom/);
    expect(passwordProblem('Mangue-Bleue-2026')).toBeNull();
  });
});

describe('production configuration', () => {
  it('refuses defaults and weak secrets, accepts a real configuration', () => {
    const bad = validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'your-secret-key-change-in-production', DATABASE_URL: 'postgresql://u:SchoolAdmin123!@db/x', FRONTEND_URL: 'http://localhost:1300' });
    expect(bad.join(' ')).toMatch(/JWT_SECRET/);
    expect(bad.join(' ')).toMatch(/mot de passe de la base/);
    expect(bad.join(' ')).toMatch(/FRONTEND_URL/);
    expect(validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgresql://u:Str0ng-Unique-Pass@db/x', FRONTEND_URL: 'https://ecole.example.ci' })).toEqual([]);
    expect(validateEnv({ NODE_ENV: 'development' })).toEqual([]);
  });
});

describe('jwtSecret', () => {
  const env = { ...process.env };
  afterEach(() => (process.env = { ...env }));

  it('refuses the development fallback in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => jwtSecret()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = 'a-long-enough-production-secret';
    expect(jwtSecret()).toBe('a-long-enough-production-secret');
  });
});

describe('PrismaExceptionFilter', () => {
  const run = (code: string, meta?: Record<string, unknown>) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => res }) } as never;
    new PrismaExceptionFilter().catch(new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '5', meta }), host);
    return [res.status.mock.calls[0][0], res.json.mock.calls[0][0].message];
  };

  it('maps user-triggered database errors to 4xx', () => {
    expect(run('P2002', { target: ['email'] })).toEqual([409, 'Un enregistrement existe déjà avec cette valeur (email)']);
    expect(run('P2025')[0]).toBe(404);
    expect(run('P2003')[0]).toBe(409);
    expect(run('P9999')[0]).toBe(500);
  });
});
