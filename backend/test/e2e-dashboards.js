/* End-to-end check of the dashboards per role and of the notifications sent to families.
 * Usage (inside the backend container or in CI): node test/e2e-dashboards.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const TAG = 'Test-Tableau';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : '');
  }
};
const login = async (email, password) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).accessToken;
const client = (token) => {
  const call = (method, path, body) =>
    fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  call.upload = (path, fields, content) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', new Blob([content]), 'piece.pdf');
    return fetch(`${BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  return call;
};

const created = { attendance: [], sessions: [] };
const cleanup = async () => {
  await prisma.grade.deleteMany({ where: { comment: TAG } });
  await prisma.document.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.notification.deleteMany({ where: { OR: [{ subject: 'Nouvelle note', message: { contains: '13,5/20' } }, { subject: 'Document disponible', message: { contains: TAG } }] } });
  await prisma.timetableSession.deleteMany({ where: { label: TAG } });
  if (created.attendance.length) await prisma.attendance.deleteMany({ where: { id: { in: created.attendance } } });
};

(async () => {
  const admin = client(await login('admin@school.local', 'admin123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  try {
    await cleanup();
    const child = (await parent('GET', '/parent-portal/children')).body[0];
    const klass = child.enrollments[0].class;
    const school = child.schoolId;
    const year = await prisma.academicYear.findFirst({ where: { schoolId: school, isCurrent: true }, include: { terms: { orderBy: { order: 'asc' } } } });
    const maths = await prisma.subject.findFirst({ where: { schoolId: school, code: 'MATH' } });
    const staff = await prisma.staffMember.findFirst({ where: { user: { email: 'k.kouassi@school.local' } } });

    console.log('Teacher dashboard');
    const today = new Date();
    await prisma.timetableSession.create({ data: { schoolId: school, academicYearId: year.id, classId: klass.id, subjectId: maths.id, teacherId: staff.id, dayOfWeek: ((today.getDay() + 6) % 7) + 1, startTime: '00:05', endTime: '00:55', label: TAG } });
    const mine = await teacher('GET', '/dashboard/teacher');
    ok(mine.status === 200 && mine.body.totals.classes >= 1 && mine.body.totals.pupils > 0 && mine.body.classes.every((c) => typeof c.pupils === 'number'), `a teacher sees his ${mine.body?.totals?.classes} classes and ${mine.body?.totals?.pupils} pupils`, mine.body?.totals);
    const own = mine.body.classes.find((c) => c.id === klass.id);
    ok(own && own.mainTeacher === true && own.subjects.includes('Mathématiques'), 'with the subjects he teaches in each class and where he is the main teacher', own);
    const lesson = mine.body.today.find((l) => l.start === '00:05');
    ok(lesson && lesson.class === klass.name && lesson.subject === 'Mathématiques', "today's lessons come from the timetable", mine.body.today);
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const already = await prisma.attendance.count({ where: { classId: klass.id, date: dayStart } });
    if (!already) {
      ok(lesson.rollCallTaken === false && mine.body.rollCallsToTake.some((r) => r.classId === klass.id), 'the roll call of that class is still to take');
      const marked = await teacher('POST', '/attendance/mark', { classId: klass.id, date: today.toISOString().slice(0, 10), records: [{ studentId: child.id, status: 'PRESENT' }] });
      created.attendance.push(...marked.body.map((a) => a.id));
      const after = await teacher('GET', '/dashboard/teacher');
      ok(after.body.today.find((l) => l.start === '00:05').rollCallTaken === true && !after.body.rollCallsToTake.some((r) => r.classId === klass.id), 'once taken, it leaves the list');
    } else console.log('  · the roll call of that class was already taken today: the "to take" list is not checked');
    ok((await teacher('GET', '/dashboard/overview')).status === 403 && (await teacher('GET', '/dashboard/analytics')).status === 403, 'a teacher no longer reads the school-wide figures (finance included)');
    ok((await secretary('GET', '/dashboard/teacher')).status === 403, 'the teacher dashboard is for teachers');

    console.log('School and platform dashboards');
    ok((await secretary('GET', '/dashboard/overview')).status === 200 && (await admin('GET', '/dashboard/analytics')).status === 200, 'the office and the management keep the school dashboard');
    const platform = await admin('GET', '/dashboard/platform');
    ok(platform.status === 200 && platform.body.schools >= 1 && platform.body.students > 0 && platform.body.teachers > 0 && typeof platform.body.subscriptions === 'object', 'the platform administrator sees schools, pupils, parents, teachers and applications', platform.body);
    ok((await secretary('GET', '/dashboard/platform')).status === 403 && (await teacher('GET', '/dashboard/platform')).status === 403, 'nobody else does');

    console.log('Families are told');
    const mark = await teacher('POST', '/grades', { classId: klass.id, subjectId: maths.id, termId: year.terms[0].id, type: 'INTERROGATION', records: [{ studentId: child.id, score: 13.5, comment: TAG }] });
    const note = await prisma.notification.findFirst({ where: { subject: 'Nouvelle note', user: { email: 'parent@school.local' }, message: { contains: '13,5/20' } } });
    ok(mark.status === 201 && !!note && note.message === `${child.firstName} a obtenu 13,5/20 en Mathématiques.`, `a new mark: "${note?.message}"`);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');
    await secretary.upload('/documents', { studentId: child.id, name: `${TAG} interne` }, pdf);
    await secretary.upload('/documents', { studentId: child.id, name: `${TAG} certificat`, visibility: 'FAMILLE' }, pdf);
    const docs = await prisma.notification.findMany({ where: { subject: 'Document disponible', user: { email: 'parent@school.local' }, message: { contains: TAG } } });
    ok(docs.length === 1 && docs[0].message.includes('certificat'), 'a document shared with the family, not an internal one');
    const inbox = await parent('GET', '/notifications');
    ok(inbox.status === 200 && inbox.body.some((n) => n.subject === 'Nouvelle note') && inbox.body.some((n) => n.subject === 'Document disponible'), 'both appear in the notifications of the guardian');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll dashboard checks passed');
  process.exit(failures ? 1 : 0);
})();
