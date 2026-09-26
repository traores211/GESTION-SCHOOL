import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessRule } from './decorators';
import { PermissionsGuard } from './authz.guards';

function contextFor(rule: AccessRule | undefined, user?: { userId: string; role: string }): {
  guard: PermissionsGuard;
  ctx: ExecutionContext;
} {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(rule) } as unknown as Reflector;
  const request = { method: 'GET', url: '/api/x', route: { path: '/api/x' }, user };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), ctx };
}

describe('PermissionsGuard', () => {
  it('refuses a route that declares no access rule (deny-by-default)', () => {
    const { guard, ctx } = contextFor(undefined, { userId: 'u1', role: 'DIRECTOR' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lets public and authenticated routes through', () => {
    expect(contextFor({ kind: 'public' }).guard.canActivate(contextFor({ kind: 'public' }).ctx)).toBe(true);
    const { guard, ctx } = contextFor({ kind: 'authenticated' }, { userId: 'u1', role: 'PARENT' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('refuses a teacher on a payroll route', () => {
    const { guard, ctx } = contextFor(
      { kind: 'permissions', permissions: ['payroll:read'] },
      { userId: 't1', role: 'ENSEIGNANT' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows an accountant on a payroll route', () => {
    const { guard, ctx } = contextFor(
      { kind: 'permissions', permissions: ['payroll:read'] },
      { userId: 'c1', role: 'COMPTABLE' },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('requires every listed permission', () => {
    const { guard, ctx } = contextFor(
      { kind: 'permissions', permissions: ['billing:read', 'payroll:read'] },
      { userId: 's1', role: 'SECRETARY' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('refuses an unknown role', () => {
    const { guard, ctx } = contextFor(
      { kind: 'permissions', permissions: ['students:read'] },
      { userId: 'x', role: 'HACKER' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
