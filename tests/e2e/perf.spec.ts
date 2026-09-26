import { expect, test } from '@playwright/test';
import { as } from './helpers';

/**
 * Performance acceptance (measured, not assumed). Targets from docs/architecture §9:
 * API read p95 < 300 ms on the acceptance environment. Results are attached to the report.
 */
test.describe.configure({ mode: 'serial' });

function p95(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.ceil(0.95 * s.length) - 1];
}

test('[PF-01] Latence API p95 < 300 ms sur les lectures clés (30 requêtes chacune)', async ({}, testInfo) => {
  const director = await as('director');
  const results: Record<string, number> = {};
  for (const path of ['dashboard/overview', 'students', 'classes', 'billing/stats', 'billing/invoices', 'timetable/mine', 'users/me']) {
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      const res = await director.get(path);
      times.push(performance.now() - t0);
      expect(res.status()).toBe(200);
    }
    results[path] = Math.round(p95(times));
  }
  await testInfo.attach('p95-ms.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  for (const [path, ms] of Object.entries(results)) expect(ms, `${path} p95=${ms}ms`).toBeLessThan(300);
});

test('[PF-02] Volume : 300 élèves supplémentaires, liste paginée et recherche restent rapides', async ({}, testInfo) => {
  const director = await as('director');
  const classes = await (await director.get('classes')).json();
  for (let i = 0; i < 300; i++) {
    await director.post('students', { data: { firstName: `Volume${i}`, lastName: 'Charge', dateOfBirth: '2012-01-01', gender: i % 2 ? 'F' : 'M', classId: classes[i % classes.length].id } });
  }
  const t0 = performance.now();
  const page = await director.get('students?pageSize=50&page=2');
  const listMs = performance.now() - t0;
  expect((await page.json()).length).toBe(50);
  expect(Number(page.headers()['x-total-count'])).toBeGreaterThanOrEqual(300);
  const t1 = performance.now();
  const search = await director.get('students?search=Volume29');
  const searchMs = performance.now() - t1;
  expect((await search.json()).length).toBeGreaterThanOrEqual(1);
  const t2 = performance.now();
  await director.get('dashboard/overview');
  const dashMs = performance.now() - t2;
  await testInfo.attach('volume-ms.json', { body: JSON.stringify({ listMs, searchMs, dashMs }, null, 2), contentType: 'application/json' });
  expect(listMs).toBeLessThan(500);
  expect(searchMs).toBeLessThan(500);
  expect(dashMs).toBeLessThan(500);
});

test('[PF-03] Génération d’emploi du temps pour toutes les classes < 3 s', async () => {
  const director = await as('director');
  const t0 = performance.now();
  const res = await director.post('timetable/generate', { data: {} });
  expect(res.status()).toBe(201);
  expect(performance.now() - t0).toBeLessThan(3000);
  // republish so later journeys keep a published timetable
  for (const c of await (await director.get('classes')).json()) await director.post(`timetable/classes/${c.id}/publish`);
});

test('[PF-04] Génération d’un document officiel < 3 s', async () => {
  const director = await as('director');
  const t = (await (await director.get('documents/templates')).json())[0];
  const s = (await (await director.get('students')).json())[0];
  const t0 = performance.now();
  const res = await director.post('documents/generate', { data: { templateId: t.id, subjectId: t.context === 'STUDENT' ? s.id : undefined } });
  expect([201, 400]).toContain(res.status());
  expect(performance.now() - t0).toBeLessThan(3000);
});
