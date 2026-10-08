/* End-to-end check of school groups: several schools in one organisation, switching, isolation.
 * Usage (inside the backend container or in CI): node test/e2e-group.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const { clearThrottle } = require('./throttle');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const TAG = 'Test-Groupe';
const HEAD = 'chef.groupe@test-groupe.local';
const PASSWORD = 'Baobab-Lagune-2026!';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};
const post = (path, body, token) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const login = async (email, password) => (await post('/auth/login', { email, password })).body.accessToken;
const client = (token) => (method, path, body) =>
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const cleanup = async () => {
  const orgs = await prisma.organisation.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test-groupe.local' } } });
  await prisma.organisation.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
};

(async () => {
  await clearThrottle();
  try {
    await cleanup();
    const signup = await post('/public/signup', { schoolName: `${TAG} Primaire`, city: 'Abidjan', firstName: 'Aminata', lastName: 'Chef', email: HEAD, password: PASSWORD, consent: true });
    ok(signup.status === 201, 'a school signs up: its head administers the group', signup.body);
    // Multi-school groups are an ENTERPRISE feature; the sign-up defaults to STARTER (schools = 1).
    // Grant an override so this test can exercise the group behaviour (its own quota e2e test
    // covers the limit enforcement separately).
    const org = await prisma.organisation.findFirst({ where: { email: HEAD } });
    if (org) await prisma.organisationQuotaOverride.upsert({ where: { organisationId: org.id }, update: { schools: 10, staffUsers: 100 }, create: { organisationId: org.id, schools: 10, staffUsers: 100 } });
    const head = client(await login(HEAD, PASSWORD));
    const outsider = client(await login('admin@school.local', 'admin123'));
    const secretaryOther = client(await login('secretaire@school.local', 'secret123'));

    console.log('Schools of the group');
    const first = (await head('GET', '/group/schools')).body;
    ok(first.length === 1 && first[0].current === true, 'the group starts with one school, the one that is open');
    const primaryId = first[0].id;
    const college = await head('POST', '/group/schools', { name: `${TAG} Collège`, city: 'Abidjan' });
    ok(college.status === 201 && /-\d{4}$/.test(college.body.code), `the administrator adds a second school (${college.body?.code})`, college.body);
    ok((await head('POST', '/group/schools', { name: `${TAG} collège` })).status === 409, 'the same name twice in the group is refused');
    const collegeId = college.body.id;
    const year = await prisma.academicYear.findFirst({ where: { schoolId: collegeId, isCurrent: true }, include: { terms: true } });
    ok(!!year && year.terms.length === 3, 'the new school has its current year and three terms');
    ok((await secretaryOther('GET', '/group/schools')).status === 403, 'a secretary does not manage the group');
    ok((await outsider('PATCH', `/group/schools/${collegeId}`, { name: 'Pris' })).status === 404, "another group's administrator cannot touch it");

    console.log('Working in one school at a time');
    const klass = await head('POST', '/classes', { name: `${TAG} CP1`, code: 'TGCP1', level: 'CP1' });
    ok(klass.status === 201, 'a class is created in the primary school', klass.body);
    const reach = (await head('GET', '/auth/schools')).body;
    ok(reach.length === 2 && reach.filter((s) => s.current).length === 1, 'the administrator may open both schools');
    const sw = await head('POST', '/auth/switch-school', { schoolId: collegeId });
    ok(sw.status === 200 && sw.body.accessToken && sw.body.school.id === collegeId, 'he opens the collège', sw.body);
    const inCollege = client(sw.body.accessToken);
    const classes = await inCollege('GET', '/classes');
    ok(classes.status === 200 && classes.body.length === 0, 'the collège does not show the classes of the primary school');
    ok((await inCollege('GET', `/classes/${klass.body.id}`)).status === 403, 'nor lets them be opened by id');
    const pupil = await inCollege('POST', '/students', { firstName: 'Koffi', lastName: TAG, dateOfBirth: '2013-05-06', gender: 'M' });
    ok(pupil.status === 201, 'a pupil is registered in the collège');
    const outsiderSchools = (await outsider('GET', '/auth/schools')).body;
    ok((await head('POST', '/auth/switch-school', { schoolId: outsiderSchools.find((s) => s.current).id })).status === 403, 'a school of another group cannot be opened');

    console.log('Staff shared between schools');
    await head('POST', '/auth/switch-school', { schoolId: primaryId });
    const staff = await head('POST', '/staff', { email: 'prof@test-groupe.local', firstName: 'Yao', lastName: 'Partagé', role: 'ENSEIGNANT', position: 'Professeur', hireDate: '2024-09-01', password: PASSWORD });
    ok(staff.status === 201, 'a teacher is hired in the primary school', staff.body);
    const prof = client(await login('prof@test-groupe.local', PASSWORD));
    ok((await prof('GET', '/auth/schools')).body.length === 1, 'he reaches one school');
    ok((await prof('POST', '/auth/switch-school', { schoolId: collegeId })).status === 403, 'and cannot open the other one by himself');
    ok((await head('POST', `/group/schools/${collegeId}/members`, { email: 'k.kouassi@school.local', role: 'ENSEIGNANT' })).status === 404, 'an account of another group cannot be attached');
    const added = await head('POST', `/group/schools/${collegeId}/members`, { email: 'prof@test-groupe.local', role: 'ENSEIGNANT' });
    ok(added.status === 201 && added.body.some((m) => m.email === 'prof@test-groupe.local'), 'the administrator attaches him to the collège', added.body);
    const profSwitch = await prof('POST', '/auth/switch-school', { schoolId: collegeId });
    ok(profSwitch.status === 200 && (await prof('GET', '/auth/schools')).body.find((s) => s.current).id === collegeId, 'he now opens the collège');
    const listed = (await head('GET', '/staff')).body;
    ok(listed.some((u) => u.email === 'prof@test-groupe.local'), 'and stays in the staff list of the primary school');

    console.log('Deactivating a school');
    ok((await head('PATCH', `/group/schools/${primaryId}`, { isActive: false })).status === 400, 'the school that is open cannot be deactivated');
    ok((await head('PATCH', `/group/schools/${collegeId}`, { isActive: false })).status === 200, 'the collège is deactivated');
    ok((await prof('GET', '/classes')).status === 401, 'its accounts are shut out at once');
    ok((await head('PATCH', `/group/schools/${collegeId}`, { isActive: true })).status === 200 && (await prof('GET', '/classes')).status === 200, 'and let in again when it is reactivated');
    const removed = await head('DELETE', `/group/schools/${collegeId}/members/${staff.body.id}`);
    ok(removed.status === 200 && (await prof('GET', '/auth/schools')).body.every((s) => s.id === primaryId), 'removed from the collège, the teacher falls back on the primary school', removed.body);
    ok((await head('DELETE', `/group/schools/${primaryId}/members/${staff.body.id}`)).status === 400, 'the last school of an account is not removed');

    console.log('Student numbers');
    const a = await prisma.student.findFirst({ where: { schoolId: collegeId } });
    const twin = await prisma.student.create({ data: { schoolId: primaryId, firstName: 'Jumeau', lastName: TAG, matricule: a.matricule, dateOfBirth: new Date('2014-01-01'), gender: 'M' } }).catch((e) => e);
    ok(!!twin.id, 'two schools may use the same student number');
    const clash = await prisma.student.create({ data: { schoolId: primaryId, firstName: 'Doublon', lastName: TAG, matricule: a.matricule, dateOfBirth: new Date('2014-01-01'), gender: 'M' } }).catch(() => null);
    ok(clash === null, 'not twice in the same school');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll school group checks passed');
  process.exit(failures ? 1 : 0);
})();
