/* End-to-end check of the teacher scope: a teacher reaches his own classes and subjects, nothing else.
 * Usage (inside the backend container or in CI): node test/e2e-teacher-scope.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const TAG = 'Test-Scope';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};
const login = async (email, password) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).accessToken;
const client = (token) => (method, path, body) =>
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const cleanup = async () => {
  const classes = await prisma.class.findMany({ where: { code: 'TSCOPE' }, select: { id: true } });
  const ids = classes.map((c) => c.id);
  const students = await prisma.student.findMany({ where: { lastName: TAG }, select: { id: true } });
  const sIds = students.map((s) => s.id);
  await prisma.grade.deleteMany({ where: { OR: [{ classId: { in: ids } }, { comment: TAG }] } });
  await prisma.attendance.deleteMany({ where: { classId: { in: ids } } });
  await prisma.homework.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.disciplineRecord.deleteMany({ where: { reason: { startsWith: TAG } } });
  await prisma.reportCard.deleteMany({ where: { studentId: { in: sIds } } });
  await prisma.enrollment.deleteMany({ where: { classId: { in: ids } } });
  await prisma.student.deleteMany({ where: { id: { in: sIds } } });
  await prisma.classSubject.deleteMany({ where: { classId: { in: ids } } });
  await prisma.class.deleteMany({ where: { id: { in: ids } } });
};

(async () => {
  const admin = client(await login('admin@school.local', 'admin123'));
  const kouassi = client(await login('k.kouassi@school.local', 'teach123'));
  const kone = client(await login('a.kone@school.local', 'teach123'));
  const today = new Date().toISOString().slice(0, 10);
  try {
    await cleanup();
    const school = await prisma.school.findFirst({ where: { users: { some: { email: 'admin@school.local' } } } });
    const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true }, include: { terms: { orderBy: { order: 'asc' } } } });
    const term = year.terms[0];
    const subject = async (code) => prisma.subject.findFirst({ where: { schoolId: school.id, code } });
    const [maths, french, english] = [await subject('MATH'), await subject('FR'), await subject('ANG')];
    const koneStaff = await prisma.staffMember.findFirst({ where: { user: { email: 'a.kone@school.local' } } });

    // A class nobody is the main teacher of: Maths is given to Koné, French to nobody.
    const created = await admin('POST', '/classes', { name: `${TAG} 3ème`, code: 'TSCOPE', level: '3ème' });
    ok(created.status === 201, 'the management creates a class', created.body);
    const classId = created.body.id;
    await prisma.classSubject.createMany({ data: [{ classId, subjectId: maths.id, teacherId: koneStaff.id }, { classId, subjectId: french.id, teacherId: null }] });
    const pupil = await admin('POST', '/students', { firstName: 'Awa', lastName: TAG, dateOfBirth: '2012-03-04', gender: 'F', classId });
    ok(pupil.status === 201, 'and enrols a pupil in it', pupil.body);
    const studentId = pupil.body.id;
    const sixth = await prisma.class.findFirst({ where: { schoolId: school.id, academicYearId: year.id, code: '6A' }, include: { enrollments: { where: { withdrawalDate: null }, take: 1 } } });
    const sixthPupil = sixth.enrollments[0].studentId;
    const marks = (subjectId, cId = classId, sId = studentId) => ({ classId: cId, subjectId, termId: term.id, type: 'DEVOIR', records: [{ studentId: sId, score: 12, comment: TAG }] });
    const roll = { classId, date: today, records: [{ studentId, status: 'PRESENT' }] };

    console.log('A teacher who has nothing to do with the class');
    const list = await kouassi('GET', '/classes');
    ok(list.status === 200 && list.body.length >= 1 && !list.body.some((c) => c.id === classId), `sees his ${list.body.length} classes, not the other one`);
    ok((await kouassi('GET', `/classes/${classId}`)).status === 403, 'cannot open the class');
    ok((await kouassi('GET', `/attendance?classId=${classId}&date=${today}`)).status === 403, 'cannot read its roll call');
    ok((await kouassi('POST', '/attendance/mark', roll)).status === 403, 'cannot take its roll call');
    ok((await kouassi('GET', `/grades/class/${classId}`)).status === 403, 'cannot read its marks');
    ok((await kouassi('POST', '/grades', marks(maths.id))).status === 403, 'cannot enter marks in it');
    ok((await kouassi('GET', `/students/${studentId}`)).status === 403, 'cannot open the file of its pupil');
    ok((await kouassi('GET', `/grades/student/${studentId}`)).status === 403 && (await kouassi('GET', `/attendance/student/${studentId}`)).status === 403, 'nor the marks and absences of that pupil');
    const pupils = await kouassi('GET', `/students?search=${TAG}`);
    ok(pupils.status === 200 && !pupils.body.some((s) => s.id === studentId), 'does not find that pupil in the list');
    ok((await kouassi('GET', `/bulletins/class/${classId}/${term.id}`)).status === 403, 'cannot read its council sheet');
    ok((await kouassi('POST', '/homework', { classId, title: `${TAG} devoir`, dueDate: new Date(Date.now() + 3 * 86400000).toISOString() })).status === 403, 'cannot give homework to it');
    ok((await kouassi('POST', '/discipline', { studentId, date: today, kind: 'OBSERVATION', reason: `${TAG} : hors périmètre` })).status === 403, 'cannot report its pupil');

    console.log('The teacher of one subject of the class');
    ok((await kone('GET', '/classes')).body.some((c) => c.id === classId), 'sees the class');
    ok((await kone('GET', `/classes/${classId}`)).status === 200, 'opens it');
    ok((await kone('POST', '/attendance/mark', roll)).status === 201, 'takes the roll call');
    const mine = await kone('POST', '/grades', marks(maths.id));
    ok(mine.status === 201, 'enters marks in his subject', mine.body);
    ok((await kone('POST', '/grades', marks(french.id))).status === 403, 'not in a subject that is not his');
    ok((await kone('GET', `/students/${studentId}`)).status === 200, 'opens the file of a pupil of the class');
    ok((await kone('POST', '/grades', marks(maths.id, sixth.id, sixthPupil))).status === 403, "not in a colleague's subject in another class");
    ok((await kone('POST', '/grades', marks(english.id, sixth.id, sixthPupil))).status === 201, 'but in his own subject there');
    const card = await kone('PUT', `/bulletins/${studentId}/${term.id}`, { appreciations: { [french.id]: 'Bien' } });
    ok(card.status === 403, "cannot write the appreciation of another subject", card.body);
    ok((await kone('PUT', `/bulletins/${studentId}/${term.id}`, { appreciations: { [maths.id]: 'Bon travail' } })).status === 200, 'writes the appreciation of his subject');

    console.log('The main teacher');
    ok((await admin('PATCH', `/classes/${classId}`, { teacherId: koneStaff.id })).status === 200, 'the management names him main teacher');
    ok((await kone('POST', '/grades', marks(french.id))).status === 201, 'he may then mark a subject nobody is assigned to');

    console.log('The other roles keep the whole school');
    ok((await admin('GET', '/classes')).body.some((c) => c.id === classId), 'the management sees every class');
    ok((await admin('POST', '/grades', marks(french.id))).status === 201, 'and enters marks anywhere');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll teacher scope checks passed');
  process.exit(failures ? 1 : 0);
})();
