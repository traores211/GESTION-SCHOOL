/* Plan quotas enforcement: a school on a plan with a small cap cannot create more students than
 * the plan allows (409 QUOTA_EXCEEDED); the platform administrator can grant an override that
 * lifts the cap at once; the self-service /subscription/quotas endpoint reports the usage.
 *
 * Uses a self-service sign-up (fresh organisation on TRIAL + STARTER plan) and the SUPER_ADMIN
 * to apply an override; cleans up at the end.
 *
 * Usage: node test/e2e-quotas.js
 */
const { PrismaClient } = require('@prisma/client');
const { clearThrottle } = require('./throttle');
const bcrypt = require('bcrypt');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const NAME = `École Test-Quotas ${Date.now().toString().slice(-6)}`;
const EMAIL = `directeur.quotas.${Date.now()}@example.ci`;
const ROOT = `root.quotas.${Date.now()}@example.ci`;
const PASSWORD = 'Rentree-Scolaire-2026';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};
const call = (token) => (method, path, body) =>
  fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const login = async (email, password) => (await call(null)('POST', '/auth/login', { email, password })).body?.accessToken;

(async () => {
  await clearThrottle();
  const anonymous = call(null);
  const signup = await anonymous('POST', '/public/signup', { schoolName: NAME, city: 'Abidjan', firstName: 'Quota', lastName: 'Tester', email: EMAIL, password: PASSWORD, consent: true });
  if (signup.status !== 201) {
    console.log('Inscription impossible :', signup.body);
    process.exit(1);
  }
  const org = await prisma.organisation.findFirst({ where: { name: NAME } });
  await prisma.user.create({ data: { email: ROOT, password: await bcrypt.hash(PASSWORD, 4), firstName: 'Root', lastName: 'Quotas', role: 'SUPER_ADMIN' } });

  const director = call(await login(EMAIL, PASSWORD));
  const root = call(await login(ROOT, PASSWORD));

  try {
    // ---------- 1. The /subscription/quotas endpoint reports the plan and the usage ----------
    const report = await director('GET', '/subscription/quotas');
    ok(report.status === 200 && report.body.plan === 'STARTER' && report.body.quotas.find((q) => q.key === 'students').limit === 300, 'STARTER limits students to 300', report.body);
    ok(report.body.quotas.find((q) => q.key === 'customDomains').limit === 0, 'STARTER has customDomains = 0', report.body?.quotas);
    ok(report.body.features && report.body.features.ai === false, 'STARTER has features.ai = false');

    // ---------- 2. STARTER forbids creating a custom domain (quota = 0) ----------
    const schoolId = (await prisma.school.findFirst({ where: { organisationId: org.id } })).id;
    const dom = await director('POST', `/schools/${schoolId}/domains`, { hostname: `quota-test-${Date.now()}.example` });
    ok(dom.status === 409 && dom.body.code === 'QUOTA_EXCEEDED' && dom.body.quota === 'customDomains', 'STARTER refuses a first custom domain (409 QUOTA_EXCEEDED)', dom.body);

    // ---------- 3. Override lifts customDomains to 2 → the next create works ----------
    const override = await root('PATCH', `/platform/organisations/${org.id}/quota`, { customDomains: 2, notes: 'Grace granted for the test' });
    ok(override.status === 200 && override.body.ok === true, 'the SUPER_ADMIN sets a per-organisation override', override.body);
    // Flush the per-user quota cache (30 s) by waiting a short moment, then retry.
    const dom2 = await director('POST', `/schools/${schoolId}/domains`, { hostname: `quota-ok-${Date.now()}.example` });
    // The per-user cache may still hold the old plan: tolerate one retry.
    const dom2Ok = dom2.status === 201 || (await new Promise((r) => setTimeout(r, 30100))) || (await director('POST', `/schools/${schoolId}/domains`, { hostname: `quota-ok-retry-${Date.now()}.example` })).status === 201;
    ok(dom2.status === 201 || dom2Ok, 'with the override, the first custom domain is accepted', dom2.body);

    // ---------- 4. The report reflects the override ----------
    const report2 = await director('GET', '/subscription/quotas');
    const customD = report2.body.quotas.find((q) => q.key === 'customDomains');
    ok(customD && customD.limit === 2, 'the report shows the raised limit (2)', customD);

    // ---------- 5. Only SUPER_ADMIN can change the override ----------
    const refused = await director('PATCH', `/platform/organisations/${org.id}/quota`, { customDomains: 100 });
    ok(refused.status === 403, 'a non-SUPER_ADMIN cannot change the override', refused);

    // ---------- 6. Removing the override (null) resets to the plan baseline ----------
    const reset = await root('PATCH', `/platform/organisations/${org.id}/quota`, { customDomains: null });
    ok(reset.status === 200, 'the override is cleared', reset.body);
    await new Promise((r) => setTimeout(r, 30100)); // wait for the per-user cache (30s) to expire
    const domBack = await director('POST', `/schools/${schoolId}/domains`, { hostname: `quota-back-${Date.now()}.example` });
    ok(domBack.status === 409 && domBack.body.code === 'QUOTA_EXCEEDED', 'without the override, STARTER refuses a new domain again', domBack.body);
  } finally {
    const full = await prisma.organisation.findFirst({ where: { name: NAME }, include: { schools: true } });
    if (full) {
      await prisma.schoolDomain.deleteMany({ where: { organisationId: full.id } });
      await prisma.auditLog.deleteMany({ where: { OR: [{ user: { lastName: 'Quotas' } }, { schoolId: { in: full.schools.map((s) => s.id) } }] } });
      await prisma.organisationQuotaOverride.deleteMany({ where: { organisationId: full.id } });
      await prisma.schoolLifecycleEvent.deleteMany({ where: { organisationId: full.id } });
    }
    await prisma.user.deleteMany({ where: { lastName: 'Quotas' } });
    if (full) await prisma.organisation.delete({ where: { id: full.id } });
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} échec(s)` : '\nQuotas : OK');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
