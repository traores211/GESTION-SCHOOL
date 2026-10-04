/* End-to-end check of self-service sign-up, the free trial and the platform administration.
 * Usage (inside the backend container or in CI): node test/e2e-platform.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const NAME = `Collège Test-Platform ${Date.now().toString().slice(-6)}`;
const EMAIL = `directeur.test-platform.${Date.now()}@example.ci`;
const ROOT = `root.test-platform.${Date.now()}@example.ci`;
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
  const anonymous = call(null);
  const form = { schoolName: NAME, city: 'Bouaké', firstName: 'Aminata', lastName: 'Test-Platform', email: EMAIL, password: PASSWORD, consent: true };
  try {
    console.log('Sign-up');
    ok((await anonymous('GET', '/public/signup')).body.enabled === true, 'sign-up is open in development');
    ok((await anonymous('POST', '/public/signup', { ...form, password: 'court1' })).status === 400, 'a weak password is refused');
    ok((await anonymous('POST', '/public/signup', { ...form, consent: false })).status === 400, 'the terms must be accepted');
    const signup = await anonymous('POST', '/public/signup', form);
    ok(signup.status === 201 && /^CTP\d*-\d{4}$/.test(signup.body.schoolCode) && signup.body.trialDays === 30, `school created with the code ${signup.body.schoolCode} and a ${signup.body.trialDays}-day trial`, signup.body);
    ok((await anonymous('POST', '/public/signup', form)).status === 409, 'the same e-mail or school name cannot sign up twice');
    ok(!JSON.stringify(signup.body).includes(PASSWORD), 'the answer does not echo the password');

    console.log('The new school');
    const director = call(await login(EMAIL, PASSWORD));
    const me = await director('GET', '/auth/me');
    ok(me.status === 200 && me.body.role === 'ADMIN_ORGANISATION', 'the head signs in with the account just created');
    const sub = await director('GET', '/subscription');
    ok(sub.body.status === 'TRIAL' && sub.body.daysLeft === 30 && sub.body.readOnly === false, `trial: ${sub.body.daysLeft} days left`);
    const years = await director('GET', '/academic-years');
    ok(years.body.length === 1 && years.body[0].isCurrent && years.body[0].terms.length === 3, `current school year ${years.body[0]?.name} with three terms`);
    const pupil = await director('POST', '/students', { firstName: 'Awa', lastName: 'Test-Platform', dateOfBirth: '2013-05-05', gender: 'F' });
    const list = await director('GET', '/students?page=1');
    ok(pupil.status === 201 && list.body.total === 1, 'it starts empty and sees only its own pupils');
    ok((await director('GET', '/platform/organisations')).status === 403, 'a head cannot open the platform administration');
    const showcase = await anonymous('GET', `/public/schools/${signup.body.schoolCode}/showcase`);
    ok(showcase.status === 200 && showcase.body.name === NAME, 'its public page exists');

    console.log('End of the trial');
    await prisma.user.create({ data: { email: ROOT, password: await bcrypt.hash(PASSWORD, 4), firstName: 'Root', lastName: 'Test-Platform', role: 'SUPER_ADMIN' } });
    const root = call(await login(ROOT, PASSWORD));
    const orgs = await root('GET', '/platform/organisations');
    const org = orgs.body.find((o) => o.name === NAME);
    ok(orgs.status === 200 && org && org.status === 'TRIAL' && org.schools[0].students === 1, 'the platform administrator sees the new school, its trial and its size');
    const expired = await root('PATCH', `/platform/organisations/${org.id}`, { trialEndsAt: new Date(Date.now() - 86400000).toISOString() });
    ok(expired.body.readOnly === true && expired.body.daysLeft === 0, 'trial ended');
    const blocked = await director('POST', '/students', { firstName: 'Koffi', lastName: 'Test-Platform', dateOfBirth: '2013-06-06', gender: 'M' });
    ok(blocked.status === 402 && blocked.body.code === 'SUBSCRIPTION_REQUIRED', 'after the trial, changes are refused with a clear message', blocked.body);
    ok((await director('GET', '/students?page=1')).body.total === 1 && (await director('GET', `/privacy/students/${pupil.body.id}/export`)).status === 200, 'but the school still reads and exports its data');
    ok(!!(await login(EMAIL, PASSWORD)), 'and can still sign in');
    const dump = await director('GET', '/privacy/school-export');
    ok(dump.status === 200 && dump.body.counts.students === 1 && dump.body.students[0].lastName === 'Test-Platform' && dump.body.staff.length === 0 && !JSON.stringify(dump.body).includes('"password"'), 'full export of the school: its own data only, without credentials', dump.body?.counts);
    const demo = call(await login('admin@school.local', 'admin123'));
    ok((await demo('GET', '/subscription')).body.readOnly === false, 'other schools are not affected');

    console.log('Activation');
    const active = await root('PATCH', `/platform/organisations/${org.id}`, { status: 'ACTIVE', plan: 'PRO' });
    ok(active.body.status === 'ACTIVE' && active.body.plan === 'PRO' && active.body.readOnly === false, 'the administrator activates the subscription');
    ok((await director('POST', '/students', { firstName: 'Koffi', lastName: 'Test-Platform', dateOfBirth: '2013-06-06', gender: 'M' })).status === 201, 'changes work again at once');
    await root('PATCH', `/platform/organisations/${org.id}`, { status: 'SUSPENDED' });
    ok((await director('POST', '/students', { firstName: 'Yao', lastName: 'Test-Platform', dateOfBirth: '2013-07-07', gender: 'M' })).status === 402, 'a suspended subscription is read-only too');
    ok((await root('PATCH', `/platform/organisations/${org.id}`, { status: 'FREE' })).status === 400, 'unknown status refused');
  } finally {
    const org = await prisma.organisation.findFirst({ where: { name: NAME }, include: { schools: true } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ user: { lastName: 'Test-Platform' } }, { schoolId: { in: org?.schools.map((s) => s.id) ?? [] } }] } });
    await prisma.user.deleteMany({ where: { lastName: 'Test-Platform' } });
    if (org) await prisma.organisation.delete({ where: { id: org.id } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
