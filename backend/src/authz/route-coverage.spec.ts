import * as fs from 'fs';
import * as path from 'path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ACCESS_KEY, AccessRule } from './decorators';
import { permissionsForRole } from './permissions';

/**
 * Walks every controller of the application and checks the access rule of every route.
 * This is the regression net for authorization: a new route without a rule, or a rule that
 * opens payroll to teachers, fails here before it ships.
 */
interface Route {
  id: string; // "GET /payroll/:id/pdf"
  rule: AccessRule | undefined;
}

function controllerFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

function collectRoutes(): Route[] {
  const routes: Route[] = [];
  for (const file of controllerFiles(path.join(__dirname, '..'))) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const exported = require(file);
    for (const candidate of Object.values(exported)) {
      if (typeof candidate !== 'function') continue;
      const base = Reflect.getMetadata(PATH_METADATA, candidate);
      if (base === undefined) continue;
      const proto = (candidate as { prototype: Record<string, unknown> }).prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler);
        const url = '/' + [base, sub].filter((p) => p && p !== '/').join('/');
        const rule =
          Reflect.getMetadata(ACCESS_KEY, handler) ?? Reflect.getMetadata(ACCESS_KEY, candidate);
        routes.push({ id: `${RequestMethod[method]} ${url}`, rule });
      }
    }
  }
  return routes;
}

function allowedFor(role: string, routes: Route[]): string[] {
  const granted = permissionsForRole(role);
  return routes
    .filter((r) => r.rule?.kind === 'permissions' && r.rule.permissions.every((p) => granted.includes(p)))
    .map((r) => r.id);
}

describe('Route access rules', () => {
  const routes = collectRoutes();

  it('finds the application routes (guards against a vacuous pass)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(82);
  });

  it('declares an access rule on every route', () => {
    expect(routes.filter((r) => !r.rule).map((r) => r.id)).toEqual([]);
  });

  it('keeps anonymous access to login, health and the public showcase only', () => {
    const publicRoutes = routes.filter((r) => r.rule?.kind === 'public').map((r) => r.id).sort();
    expect(publicRoutes).toEqual([
      // Each anonymous route is deliberate: health probes, login/MFA/password reset (rate limited),
      // public showcase and its forms (rate limited + honeypot), document authenticity check.
      'GET /health',
      'GET /health/ready',
      'GET /public/documents/verify/:code',
      'GET /public/resolve',
      'GET /public/schools/:code/showcase',
      'POST /auth/forgot-password',
      'POST /auth/login',
      'POST /auth/mfa/verify',
      'POST /auth/reset-password',
      'POST /public/schools/:code/admissions',
      'POST /public/schools/:code/contact',
    ]);
  });

  it('gives parents the parent portal only', () => {
    expect(allowedFor('PARENT', routes).every((id) => id.includes('/parent-portal/'))).toBe(true);
    expect(allowedFor('PARENT', routes).length).toBe(2);
  });

  it('gives students (ELEVE) no management route', () => {
    expect(allowedFor('ELEVE', routes)).toEqual([]);
  });

  it('never lets a teacher reach payroll, billing, salaries or staff management', () => {
    const forbidden = allowedFor('ENSEIGNANT', routes).filter((id) =>
      /\/(payroll|billing)|\/staff\/:id\/salary|POST \/staff|DELETE \/staff/.test(id),
    );
    expect(forbidden).toEqual([]);
  });

  it('keeps the platform console for PLATFORM_ADMIN only, and gives it no school data', () => {
    const platformRoutes = routes.filter((r) => r.id.includes('/platform/')).map((r) => r.id);
    expect(platformRoutes.length).toBe(5);
    for (const role of ['SUPER_ADMIN', 'DIRECTOR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT']) {
      expect(allowedFor(role, routes).filter((id) => id.includes('/platform/'))).toEqual([]);
    }
    expect(allowedFor('PLATFORM_ADMIN', routes).every((id) => id.includes('/platform/'))).toBe(true);
  });

  it('never lets a secretary reach payroll', () => {
    expect(allowedFor('SECRETARY', routes).filter((id) => /payroll|salary/.test(id))).toEqual([]);
  });

  it('keeps every route the existing screens call for their role (non-regression)', () => {
    // Endpoints called by each page of frontend/src/app, for the roles the menu shows it to.
    const needs: Record<string, string[]> = {
      COMPTABLE: ['GET /students', 'GET /billing/invoices', 'POST /billing/invoices/:id/payments', 'GET /staff', 'PATCH /staff/:id/salary', 'POST /payroll/generate', 'GET /dashboard/overview'],
      SECRETARY: ['GET /students', 'POST /students', 'GET /staff', 'POST /classes', 'POST /attendance/mark', 'POST /billing/invoices', 'POST /transport/routes', 'GET /parents', 'PATCH /admissions/:id/status'],
      ENSEIGNANT: ['GET /classes', 'GET /classes/:id', 'GET /students', 'GET /staff', 'GET /subjects', 'GET /academic-years', 'POST /grades', 'POST /attendance/mark', 'GET /bulletins/:studentId/:termId/pdf', 'GET /dashboard/overview'],
      DIRECTOR: routes.filter((r) => r.rule?.kind === 'permissions' && !r.id.includes('parent-portal') && !r.id.includes('/platform/')).map((r) => r.id),
    };
    for (const [role, ids] of Object.entries(needs)) {
      const allowed = allowedFor(role, routes);
      expect({ role, missing: ids.filter((id) => !allowed.includes(id)) }).toEqual({ role, missing: [] });
    }
  });
});
