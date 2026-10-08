/* End-to-end check of the pupil's own account (student portal), the identity photo and the
 * notification preferences.
 * Usage (inside the backend container or in CI): node test/e2e-pupil.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const TAG = 'Test-Eleve';
const EMAIL = 'eleve@test-eleve.local';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : '');
  }
};
const signIn = (email, password) => fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const login = async (email, password) => (await signIn(email, password)).body.accessToken;
const client = (token) => {
  const call = (method, path, body) =>
    fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), body: await r.json().catch(() => null) }));
  call.upload = (path, content, name = 'photo.png') => {
    const form = new FormData();
    form.append('file', new Blob([content]), name);
    return fetch(`${BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  return call;
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

const cleanup = async () => {
  await prisma.grade.deleteMany({ where: { comment: TAG } });
  await prisma.notification.deleteMany({ where: { subject: 'Nouvelle note', message: { contains: '11,5/20' } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test-eleve.local' } } });
  await prisma.student.deleteMany({ where: { lastName: TAG } });
  await prisma.user.updateMany({ where: { email: 'parent@school.local' }, data: { notificationPrefs: {} } });
};

(async () => {
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  try {
    await cleanup();
    const school = await prisma.school.findFirst({ where: { users: { some: { email: 'secretaire@school.local' } } } });
    const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true }, include: { terms: { orderBy: { order: 'asc' } } } });
    const klass = await prisma.class.findFirst({ where: { schoolId: school.id, academicYearId: year.id, code: '6A' } });
    const maths = await prisma.subject.findFirst({ where: { schoolId: school.id, code: 'MATH' } });
    const created = await secretary('POST', '/students', { firstName: 'Koffi', lastName: TAG, dateOfBirth: '2014-03-03', gender: 'M', classId: klass.id });
    const id = created.body.id;
    const other = await prisma.student.findFirst({ where: { schoolId: school.id, id: { not: id }, archivedAt: null } });

    console.log('Identity photo');
    ok((await secretary.upload(`/students/${id}/photo`, PNG)).status === 201, 'the office adds the identity photo');
    const photo = await teacher('GET', `/students/${id}/photo`);
    ok(photo.status === 200 && photo.type === 'image/png', 'a teacher of the pupil sees it');
    ok((await secretary.upload(`/students/${id}/photo`, Buffer.from('%PDF-1.4\n%%EOF'), 'photo.pdf')).status === 400, 'a file that is not a photo is refused');
    ok((await teacher.upload(`/students/${id}/photo`, PNG)).status === 403, 'a teacher does not change it');
    ok((await parent('GET', `/students/${id}/photo`)).status === 403, 'the staff route is closed to families');

    console.log("The pupil's account");
    ok((await teacher('POST', `/students/${id}/account`, { email: EMAIL })).status === 403, 'a teacher does not create accounts');
    const account = await secretary('POST', `/students/${id}/account`, { email: EMAIL });
    ok(account.status === 201 && account.body.temporaryPassword?.length >= 12 && account.body.email === EMAIL, 'the office gives the pupil an account, with a temporary password shown once', account.body && { ...account.body, temporaryPassword: '…' });
    ok((await secretary('POST', `/students/${id}/account`, { email: 'autre@test-eleve.local' })).status === 409, 'not a second one');
    ok((await secretary('POST', `/students/${other.id}/account`, { email: EMAIL })).status === 409, 'nor the same address for another pupil');
    const session = await signIn(EMAIL, account.body.temporaryPassword);
    ok(session.status === 200 && session.body.user.role === 'ELEVE', 'the pupil signs in', session.body?.user);
    const pupil = client(session.body.accessToken);

    console.log('What the pupil reads');
    const me = await pupil('GET', '/parent-portal/children');
    ok(me.status === 200 && me.body.length === 1 && me.body[0].id === id && me.body[0].enrollments[0].class.name === klass.name, 'his own record and his class, nothing else', me.body);
    const detail = await pupil('GET', `/parent-portal/children/${id}`);
    ok(detail.status === 200 && Array.isArray(detail.body.invoices) && detail.body.invoices.length === 0 && detail.body.cardToken === undefined, 'his marks and absences; no fees, no card code');
    const reads = await Promise.all([`/parent-portal/children/${id}/bulletins`, `/parent-portal/children/${id}/timetable`, `/parent-portal/children/${id}/homework`, `/parent-portal/children/${id}/discipline`, `/gate/family/${id}`, `/documents/family/${id}`].map((p) => pupil('GET', p)));
    ok(reads.every((r) => r.status === 200), 'report cards, timetable, homework, school life, arrivals and shared documents', reads.map((r) => r.status));
    ok((await pupil('GET', `/parent-portal/children/${other.id}`)).status === 403 && (await pupil('GET', `/gate/family/${other.id}`)).status === 403 && (await pupil('GET', `/documents/family/${other.id}`)).status === 403, "never another pupil's record");
    const closed = await Promise.all([pupil('GET', '/students'), pupil('GET', `/students/${id}`), pupil('GET', '/classes'), pupil('GET', '/dashboard/overview'), pupil('GET', `/students/${id}/photo`), pupil('GET', '/parents')]);
    ok(closed.every((r) => r.status === 403), 'the staff routes are closed to him', closed.map((r) => r.status));
    const writes = await Promise.all([
      pupil('POST', `/parent-portal/children/${id}/absences/x/justify`, { reason: 'Rendez-vous médical' }),
      pupil('POST', '/grades', { classId: klass.id, subjectId: maths.id, termId: year.terms[0].id, type: 'DEVOIR', records: [{ studentId: id, score: 20 }] }),
      pupil('POST', '/attendance/mark', { classId: klass.id, date: '2020-01-06', records: [{ studentId: id, status: 'PRESENT' }] }),
      pupil('POST', '/gate/events', { studentId: id }),
    ]);
    ok(writes.every((r) => r.status === 403), 'he can change nothing: no mark, no roll call, no justification, no passage', writes.map((r) => r.status));

    console.log('Closing the account');
    ok((await secretary('DELETE', `/students/${id}/account`)).status === 200, 'the office closes the account');
    ok((await pupil('GET', '/parent-portal/children')).status === 401 && (await signIn(EMAIL, account.body.temporaryPassword)).status === 401, 'the pupil is signed out and cannot sign in again');
    ok((await prisma.student.findUnique({ where: { id } })).userId === null && (await secretary('GET', `/students/${id}`)).status === 200, 'his record is untouched');

    console.log('Notification preferences');
    const child = (await parent('GET', '/parent-portal/children')).body[0];
    const before = await parent('GET', '/notifications/preferences');
    ok(before.status === 200 && before.body.categories.length === 4 && before.body.categories.every((c) => c.enabled), 'every category is on by default', before.body);
    const muted = await parent('PUT', '/notifications/preferences', { muted: ['GRADES', 'NIMPORTE-QUOI'] });
    ok(muted.status === 200 && muted.body.categories.find((c) => c.category === 'GRADES').enabled === false && muted.body.categories.filter((c) => !c.enabled).length === 1, 'a guardian mutes the notifications of new marks; unknown categories are ignored');
    const mark = (score) => teacher('POST', '/grades', { classId: child.enrollments[0].class.id, subjectId: maths.id, termId: year.terms[0].id, type: 'INTERROGATION', records: [{ studentId: child.id, score, comment: TAG }] });
    await mark(11.5);
    const count = () => prisma.notification.count({ where: { subject: 'Nouvelle note', user: { email: 'parent@school.local' }, message: { contains: '11,5/20' } } });
    ok((await count()) === 0, 'a new mark no longer notifies him');
    await parent('PUT', '/notifications/preferences', { muted: [] });
    await mark(11.5);
    ok((await count()) === 1, 'switched on again, it does');

    console.log('Push notifications');
    const push = await parent('GET', '/notifications/push');
    ok(push.status === 200 && typeof push.body.enabled === 'boolean' && (push.body.enabled ? push.body.publicKey.length > 80 : push.body.publicKey === null), `the application says whether push is configured (${push.body?.enabled ? 'yes' : 'no: keys not set on this server'})`, push.body);
    ok((await parent('POST', '/notifications/push/devices', { endpoint: 'http://169.254.169.254/latest/meta-data' })).status === 400, 'a device address that is not a push service of a browser is refused');
    ok((await parent('POST', '/notifications/push/devices', {})).status === 400, 'and so is an empty request');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll pupil account checks passed');
  process.exit(failures ? 1 : 0);
})();
