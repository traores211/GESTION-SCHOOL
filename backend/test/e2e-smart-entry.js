/* End-to-end check of assisted entry: spoken roll call, spoken marks, photographed sheet.
 * The point checked throughout: these routes only PROPOSE; recording goes through the usual routes.
 * Usage (inside the backend container or in CI): node test/e2e-smart-entry.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const TAG = 'Test-Vocal';
const DAY = '2020-01-06';
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
  call.upload = (path, fields, content, fileName = 'feuille.png') => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (content) form.append('file', new Blob([content]), fileName);
    return fetch(`${BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  return call;
};

let classId;
const cleanup = async () => {
  if (classId) await prisma.attendance.deleteMany({ where: { classId, date: new Date(`${DAY}T00:00:00`) } });
  await prisma.grade.deleteMany({ where: { comment: TAG } });
  const extra = await prisma.class.findMany({ where: { code: 'TVOCAL' }, select: { id: true } });
  await prisma.class.deleteMany({ where: { id: { in: extra.map((c) => c.id) } } });
};

(async () => {
  const admin = client(await login('admin@school.local', 'admin123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  try {
    const school = await prisma.school.findFirst({ where: { users: { some: { email: 'admin@school.local' } } } });
    const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true }, include: { terms: { orderBy: { order: 'asc' } } } });
    const klass = await prisma.class.findFirst({ where: { schoolId: school.id, academicYearId: year.id, code: '6A' }, include: { enrollments: { where: { withdrawalDate: null, student: { archivedAt: null } }, include: { student: true } } } });
    classId = klass.id;
    await cleanup();
    const maths = await prisma.subject.findFirst({ where: { schoolId: school.id, code: 'MATH' } });
    // Pupils whose full name is unique in the class, so the scenario does not depend on the demo data
    const byName = new Map();
    for (const e of klass.enrollments) byName.set(`${e.student.firstName} ${e.student.lastName}`, (byName.get(`${e.student.firstName} ${e.student.lastName}`) ?? 0) + 1);
    const [a, b, c] = klass.enrollments.map((e) => e.student).filter((s) => byName.get(`${s.firstName} ${s.lastName}`) === 1);
    const full = (s) => `${s.firstName} ${s.lastName}`;

    console.log('What the server can do');
    const caps = await teacher('GET', '/smart-entry/capabilities');
    ok(caps.status === 200 && caps.body.voice === true && typeof caps.body.image === 'boolean', `voice entry is available; image reading: ${caps.body?.image ? 'configured' : 'not configured'}`);

    console.log('Spoken roll call');
    const before = await prisma.attendance.count({ where: { classId } });
    const roll = await teacher('POST', '/smart-entry/roll-call/parse', { classId, transcript: `${full(a)} présente. ${full(b)} absent. ${full(c)} en retard. Zorro Inconnu absent.` });
    ok(roll.status === 200 && roll.body.saved === false && roll.body.rows.length === 4, 'the sentence becomes four proposed rows', roll.body);
    const row = (id) => roll.body.rows.find((r) => r.studentId === id);
    ok(row(a.id).status === 'PRESENT' && row(b.id).status === 'ABSENT' && row(c.id).status === 'RETARD' && row(a.id).confidence === 'SURE' && row(a.id).name === full(a), 'present, absent and late are understood, each pupil recognised');
    const unknown = roll.body.rows.find((r) => r.studentId === null);
    ok(unknown && unknown.confidence === 'INCONNU' && /Zorro/i.test(unknown.issue), 'a name that is not in the class is shown as a row to check, not dropped', unknown);
    ok(roll.body.toCheck === 1 && roll.body.notMentioned.length === klass.enrollments.length - 3, 'the pupils who were not named are listed apart');
    ok((await prisma.attendance.count({ where: { classId } })) === before, 'nothing is recorded by the proposal');
    const validated = await teacher('POST', '/attendance/mark', { classId, date: DAY, records: roll.body.rows.filter((r) => r.studentId && r.status === 'PRESENT').map((r) => ({ studentId: r.studentId, status: r.status })) });
    ok(validated.status === 201 && (await prisma.attendance.count({ where: { classId, date: new Date(`${DAY}T00:00:00`) } })) === 1, 'the teacher validates: the roll call is recorded by the usual route');

    console.log('Spoken marks');
    const gradesBefore = await prisma.grade.count({ where: { classId } });
    const marks = await teacher('POST', '/smart-entry/marks/parse', { classId, transcript: `${full(a)} 15, ${full(b)} 12,5, ${full(c)} 25` });
    const mark = (id) => marks.body.rows.find((r) => r.studentId === id);
    ok(marks.status === 200 && mark(a.id).score === 15 && mark(b.id).score === 12.5 && marks.body.saved === false, 'names and marks are understood, decimals included', marks.body);
    ok(mark(c.id).score === null && mark(c.id).confidence === 'A_VERIFIER' && /barème/.test(mark(c.id).issue), 'a mark above the scale is flagged and left empty');
    ok((await prisma.grade.count({ where: { classId } })) === gradesBefore, 'nothing is recorded by the proposal');
    const saved = await teacher('POST', '/grades', { classId, subjectId: maths.id, termId: year.terms[0].id, type: 'INTERROGATION', records: marks.body.rows.filter((r) => r.studentId && r.score !== null).map((r) => ({ studentId: r.studentId, score: r.score, comment: TAG })) });
    ok(saved.status === 201 && saved.body.length === 2, 'the teacher validates the two sure rows: they are recorded by the usual route', saved.body);
    ok((await teacher('POST', '/smart-entry/marks/parse', { classId, transcript: 'x' })).status === 400, 'an empty recording is refused');

    console.log('Who may use it');
    const other = await admin('POST', '/classes', { name: `${TAG} 3ème`, code: 'TVOCAL', level: '3ème' });
    ok((await teacher('POST', '/smart-entry/roll-call/parse', { classId: other.body.id, transcript: 'Alice présente' })).status === 403, 'a teacher cannot read the roster of a class that is not his');
    ok((await secretary('POST', '/smart-entry/marks/parse', { classId, transcript: 'Alice 15' })).status === 403, 'the office does not enter marks');
    ok((await parent('POST', '/smart-entry/roll-call/parse', { classId, transcript: 'Alice présente' })).status === 403, 'families have no access');

    console.log('Photographed sheet');
    ok((await teacher.upload('/smart-entry/marks/image', { classId }, Buffer.from('MZ not an image'))).status === 400, 'a file that is not a photo or a PDF is refused');
    ok((await teacher.upload('/smart-entry/marks/image', { classId }, null)).status === 400, 'a request without a file is refused');
    if (!caps.body.image) {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
      const unavailable = await teacher.upload('/smart-entry/marks/image', { classId }, png);
      ok(unavailable.status === 503 && /configurée/.test(unavailable.body.message), 'without a reading service the teacher is told so, and offered the other methods', unavailable.body);
    } else console.log('  · image reading is configured: the live call is not made by this script (covered by unit tests)');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll assisted entry checks passed');
  process.exit(failures ? 1 : 0);
})();
