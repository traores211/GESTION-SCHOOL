import { expect, request, test } from '@playwright/test';
import { API, WEB, as, login } from './helpers';

/** Post-deployment smoke tests: if one fails, the deployment must not be promoted. */
test.describe('Smoke', () => {
  test('[SMK-01] L’API démarre et répond (liveness)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API}/health`);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });

  test('[SMK-02] La base est joignable (readiness) et la version déployée est exposée', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API}/health/ready`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.database).toBe('ok');
    expect(body.version).toBeTruthy();
  });

  test('[SMK-03] Le frontend répond et sert la page de connexion', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${WEB}/login`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('lang="fr"');
  });

  test('[SMK-04] L’authentification fonctionne pour chaque rôle seedé', async () => {
    for (const who of ['platform', 'director', 'teacher', 'secretary', 'accountant', 'parent', 'student'] as const) {
      expect(await login(who)).toMatch(/^ey/);
    }
  });

  test('[SMK-05] Les migrations sont appliquées (endpoint dépendant du nouveau schéma)', async () => {
    const director = await as('director');
    const res = await director.get('school/settings');
    expect(res.status()).toBe(200);
    expect((await res.json()).plan).toBe('ENTERPRISE');
  });
});
