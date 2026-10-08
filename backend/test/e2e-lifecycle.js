/* Lifecycle machine of a school's subscription: the state transitions are validated server-side,
 * every transition is recorded on an append-only timeline, invalid moves are refused with 400,
 * a running trial is auto-expired to EXPIRED on the first write after its end date, a CLOSED
 * organisation can no longer sign in. Keeps the existing e2e-platform behaviour intact.
 *
 * Usage: node test/e2e-lifecycle.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const { clearThrottle } = require('./throttle');
const bcrypt = require('bcrypt');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const NAME = `École Test-Lifecycle ${Date.now().toString().slice(-6)}`;
const EMAIL = `directeur.lifecycle.${Date.now()}@example.ci`;
const ROOT = `root.lifecycle.${Date.now()}@example.ci`;
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

  // ---------- 0. Fresh school via sign-up (same path as e2e-platform) ----------
  const signup = await anonymous('POST', '/public/signup', { schoolName: NAME, city: 'Yamoussoukro', firstName: 'Lifecycle', lastName: 'Tester', email: EMAIL, password: PASSWORD, consent: true });
  if (signup.status !== 201) {
    console.log('Inscription impossible :', signup.body);
    process.exit(1);
  }
  const org = await prisma.organisation.findFirst({ where: { name: NAME } });
  const schoolId = (await prisma.school.findFirst({ where: { organisationId: org.id } })).id;
  await prisma.user.create({ data: { email: ROOT, password: await bcrypt.hash(PASSWORD, 4), firstName: 'Root', lastName: 'Lifecycle', role: 'SUPER_ADMIN' } });

  const director = call(await login(EMAIL, PASSWORD));
  const root = call(await login(ROOT, PASSWORD));

  try {
    // ---------- 1. The SIGNUP event is on the timeline ----------
    const h0 = await root('GET', `/platform/organisations/${org.id}/history`);
    ok(h0.status === 200 && h0.body.events.some((e) => e.reason === 'SIGNUP' && e.toStatus === 'TRIAL'), 'the SIGNUP event is recorded with toStatus=TRIAL', h0.body);

    // ---------- 2. Transition TRIAL → ACTIVE records an ACTIVATE event ----------
    const activate = await root('POST', `/platform/organisations/${org.id}/transition`, { to: 'ACTIVE', plan: 'PRO', message: 'Paiement reçu' });
    ok(activate.status === 201 && activate.body.status === 'ACTIVE' && activate.body.plan === 'PRO', 'POST /transition activates the subscription', activate.body);
    const h1 = await root('GET', `/platform/organisations/${org.id}/history`);
    ok(h1.body.events[0].toStatus === 'ACTIVE' && h1.body.events[0].reason === 'ACTIVATE' && h1.body.events[0].message === 'Paiement reçu', 'the ACTIVATE event sits on top of the timeline with the message');

    // ---------- 3. An invalid transition is refused with 400 ----------
    const bad = await root('POST', `/platform/organisations/${org.id}/transition`, { to: 'PENDING' });
    ok(bad.status === 400 && /interdite|Transition/.test(JSON.stringify(bad.body)), 'ACTIVE → PENDING is refused (400)', bad.body);
    const badName = await root('POST', `/platform/organisations/${org.id}/transition`, { to: 'FREE' });
    ok(badName.status === 400, 'unknown target status is refused (400)', badName.body);

    // ---------- 4. SUSPEND makes it read-only, REOPEN restores it ----------
    await root('POST', `/platform/organisations/${org.id}/transition`, { to: 'SUSPENDED', message: 'Impayé' });
    const blocked = await director('POST', '/students', { firstName: 'Awa', lastName: 'Lifecycle', dateOfBirth: '2013-05-05', gender: 'F' });
    ok(blocked.status === 402 && blocked.body.code === 'SUBSCRIPTION_REQUIRED', 'SUSPENDED → interceptor returns 402', blocked.body);
    await root('POST', `/platform/organisations/${org.id}/transition`, { to: 'ACTIVE' });
    const written = await director('POST', '/students', { firstName: 'Awa', lastName: 'Lifecycle', dateOfBirth: '2013-05-05', gender: 'F' });
    ok(written.status === 201, 'back to ACTIVE: writes work again');

    // ---------- 5. Lazy auto-expiry: put the trial in the past through the API (invalidates the
    //            cache), then a /subscription read triggers the EXPIRED promotion. ----------
    const past = new Date(Date.now() - 86400000).toISOString();
    const expireSetup = await root('POST', `/platform/organisations/${org.id}/transition`, { to: 'TRIAL', trialEndsAt: past, message: 'Setup expiry test' });
    ok(expireSetup.status === 201, 'the trial is put in the past through the transition endpoint', expireSetup.body);
    const sub = await director('GET', '/subscription');
    ok(sub.body.readOnly === true, 'a trial past its end date reads as read-only', sub.body);
    ok(sub.body.status === 'EXPIRED', 'the lazy promotion ran: /subscription reports EXPIRED', sub.body);
    const h2 = await root('GET', `/platform/organisations/${org.id}/history`);
    ok(h2.body.events.some((e) => e.reason === 'EXPIRE' && e.trigger === 'AUTO'), 'the AUTO EXPIRE event lands on the timeline', h2.body.events?.slice(0, 3));
    const refreshed = await prisma.organisation.findUnique({ where: { id: org.id } });
    ok(refreshed.subscriptionStatus === 'EXPIRED', 'the row has been promoted from TRIAL to EXPIRED in DB', { status: refreshed.subscriptionStatus });

    // ---------- 6. EXPIRED → CLOSED is terminal (read-only + no further transition) ----------
    await root('POST', `/platform/organisations/${org.id}/transition`, { to: 'CLOSED', message: 'Fin de collaboration' });
    const stillRoot = await root('GET', '/platform/organisations');
    ok(stillRoot.status === 200, 'the platform administrator can still manage the organisation when CLOSED');
    const subClosed = await director('GET', '/subscription');
    ok(subClosed.body.status === 'CLOSED' && subClosed.body.readOnly === true && subClosed.body.loginAllowed === false, 'the subscription reports CLOSED, read-only and loginAllowed=false', subClosed.body);
    const noWrite = await director('POST', '/students', { firstName: 'Mamadou', lastName: 'Lifecycle', dateOfBirth: '2013-08-08', gender: 'M' });
    ok(noWrite.status === 402, 'CLOSED → interceptor still returns 402 on writes', noWrite.body);
    const noTransition = await root('POST', `/platform/organisations/${org.id}/transition`, { to: 'ACTIVE' });
    ok(noTransition.status === 400, 'CLOSED is terminal: no transition back to ACTIVE', noTransition.body);
  } finally {
    const full = await prisma.organisation.findFirst({ where: { name: NAME }, include: { schools: true } });
    if (full) {
      await prisma.auditLog.deleteMany({ where: { OR: [{ user: { lastName: 'Lifecycle' } }, { schoolId: { in: full.schools.map((s) => s.id) } }] } });
      await prisma.student.deleteMany({ where: { lastName: 'Lifecycle' } });
      await prisma.schoolLifecycleEvent.deleteMany({ where: { organisationId: full.id } });
    }
    await prisma.user.deleteMany({ where: { lastName: 'Lifecycle' } });
    if (full) await prisma.organisation.delete({ where: { id: full.id } });
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} échec(s)` : '\nCycle de vie : OK');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
