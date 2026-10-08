/* End-to-end check of the supervisor and educator roles: gate, roll call and school life across the
 * school; no marks, no money, no staff records.
 * Usage (inside the backend container or in CI): node test/e2e-supervision.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const TAG = 'Test-Surveillant';
const EMAIL = 'surveillant@test-surveillance.local';
const PASSWORD = 'Baobab-Lagune-2026!';
const DAY = '2020-02-03';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : '');
  }
};
const signIn = (email, password) => fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const client = (token) => (method, path, body) =>
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

let ids = { student: null, class: null };
const cleanup = async () => {
  await prisma.disciplineRecord.deleteMany({ where: { reason: { startsWith: TAG } } });
  if (ids.class) await prisma.attendance.deleteMany({ where: { classId: ids.class, date: new Date(`${DAY}T00:00:00`) } });
  await prisma.gateEvent.deleteMany({ where: { accessPoint: TAG } });
  await prisma.notification.deleteMany({ where: { subject: { in: ['Arrivée', 'Sortie'] }, createdAt: { gte: new Date(Date.now() - 600000) } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test-surveillance.local' } } });
};

(async () => {
  const admin = client((await signIn('admin@school.local', 'admin123')).body.accessToken);
  try {
    await cleanup();
    const hired = await admin('POST', '/staff', { email: EMAIL, firstName: 'Yao', lastName: TAG, role: 'SURVEILLANT', position: 'Surveillant général', hireDate: '2024-09-02', password: PASSWORD });
    ok(hired.status === 201 && hired.body.role === 'SURVEILLANT', 'the management hires a supervisor with an account of his own', hired.body);
    ok((await admin('POST', '/staff', { email: 'x@test-surveillance.local', firstName: 'X', lastName: TAG, role: 'JARDINIER', position: 'x', hireDate: '2024-09-02' })).status === 400, 'an unknown role is refused');
    const session = await signIn(EMAIL, PASSWORD);
    ok(session.status === 200 && session.body.user.role === 'SURVEILLANT', 'he signs in');
    const sup = client(session.body.accessToken);
    const school = await prisma.school.findFirst({ where: { users: { some: { email: 'admin@school.local' } } } });
    const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true }, include: { terms: true } });
    const klass = await prisma.class.findFirst({ where: { schoolId: school.id, academicYearId: year.id, code: '6A' }, include: { enrollments: { where: { withdrawalDate: null }, take: 1 } } });
    const maths = await prisma.subject.findFirst({ where: { schoolId: school.id, code: 'MATH' } });
    ids = { student: klass.enrollments[0].studentId, class: klass.id };

    console.log('What a supervisor does');
    const classes = await sup('GET', '/classes');
    ok(classes.status === 200 && classes.body.length >= 3, `he sees every class of the school (${classes.body?.length})`);
    ok((await sup('GET', '/students?search=a')).status === 200 && (await sup('GET', `/students/${ids.student}`)).status === 200, 'and the pupil records');
    ok((await sup('POST', '/attendance/mark', { classId: klass.id, date: DAY, records: [{ studentId: ids.student, status: 'PRESENT' }] })).status === 201, 'he takes a roll call');
    ok((await sup('POST', '/smart-entry/roll-call/parse', { classId: klass.id, transcript: 'Personne présent' })).status === 200, 'also by voice');
    const passage = await sup('POST', '/gate/events', { studentId: ids.student, kind: 'ENTREE', accessPoint: TAG });
    ok(passage.status === 201 && passage.body.recordedByName === `Yao ${TAG}`, 'he records an arrival at the gate, under his name', passage.body);
    ok((await sup('GET', '/gate/today')).status === 200, 'and follows the day at the gate');
    const report = await sup('POST', '/discipline', { studentId: ids.student, date: new Date().toISOString().slice(0, 10), kind: 'OBSERVATION', reason: `${TAG} : chahut dans le couloir`, visibleToParents: false });
    ok(report.status === 201, 'he reports an incident', report.body);
    ok((await sup('GET', `/documents?studentId=${ids.student}`)).status === 200, 'he reads the documents shared with the family');
    const file = (await sup('GET', `/students/${ids.student}`)).body;
    const full = (await admin('GET', `/students/${ids.student}`)).body;
    ok(file.grades.length === 0 && file.invoices.length === 0 && file.averageScore === null && full.invoices.length + full.grades.length > 0, 'the pupil record he opens carries neither marks nor invoices (the management sees them)');

    console.log('What he has no access to');
    const marks = await Promise.all([
      sup('GET', `/grades/class/${klass.id}`),
      sup('POST', '/grades', { classId: klass.id, subjectId: maths.id, termId: year.terms[0].id, type: 'DEVOIR', records: [{ studentId: ids.student, score: 20 }] }),
      sup('POST', '/smart-entry/marks/parse', { classId: klass.id, transcript: 'Alice 15' }),
      sup('GET', `/bulletins/class/${klass.id}/${year.terms[0].id}`),
    ]);
    ok(marks.every((r) => r.status === 403), 'marks and report cards', marks.map((r) => r.status));
    const money = await Promise.all([sup('GET', '/billing/invoices'), sup('GET', '/payroll'), sup('GET', '/dashboard/overview'), sup('GET', '/insights/digest')]);
    ok(money.every((r) => r.status === 403 || r.status === 404), 'invoices, payroll and the school-wide figures', money.map((r) => r.status));
    const admin1 = await Promise.all([sup('GET', '/staff'), sup('GET', '/parents'), sup('GET', '/audit'), sup('GET', '/group/schools'), sup('POST', '/students', { firstName: 'X', lastName: TAG, dateOfBirth: '2014-01-01', gender: 'M' }), sup('POST', `/gate/students/${ids.student}/card/renew`), sup('DELETE', `/discipline/${report.body.id}`)]);
    ok(admin1.every((r) => r.status === 403), 'staff and guardian records, the audit journal, the group, creating pupils, issuing cards, deleting a report', admin1.map((r) => r.status));
    ok((await sup('POST', '/gate/events', { studentId: ids.student, kind: 'SORTIE', accessPoint: TAG, reason: 'Sortie', pickedUpBy: 'Un oncle' })).status === 403, 'he cannot hand a pupil to an unrecorded adult');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll supervision checks passed');
  process.exit(failures ? 1 : 0);
})();
