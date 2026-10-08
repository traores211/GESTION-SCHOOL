/* End-to-end check of the school year life cycle and the end-of-year promotion.
 * Runs in a school of its own (created by sign-up) so the demo school is left untouched.
 * Usage (inside the backend container or in CI): node test/e2e-promotion.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const { clearThrottle } = require('./throttle');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const TAG = 'Test-Passage';
const HEAD = 'chef@test-passage.local';
const PASSWORD = 'Baobab-Lagune-2026!';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : '');
  }
};
const post = (path, body, token) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const client = (token) => (method, path, body) =>
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const cleanup = async () => {
  const orgs = await prisma.organisation.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test-passage.local' } } });
  await prisma.organisation.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
};

(async () => {
  await clearThrottle();
  try {
    await cleanup();
    const signup = await post('/public/signup', { schoolName: `${TAG} Collège`, firstName: 'Awa', lastName: 'Chef', email: HEAD, password: PASSWORD, consent: true });
    ok(signup.status === 201, 'a school of its own for the scenario', signup.body);
    const head = client((await post('/auth/login', { email: HEAD, password: PASSWORD })).body.accessToken);
    const outsider = client((await post('/auth/login', { email: 'admin@school.local', password: 'admin123' })).body.accessToken);

    const years = (await head('GET', '/academic-years')).body;
    const y1 = years[0];
    const lastTerm = y1.terms[y1.terms.length - 1];
    const start = new Date(y1.startDate).getUTCFullYear() + 1;

    console.log('School years');
    const y2 = await head('POST', '/academic-years', { name: `${start}-${start + 1}`, startDate: `${start}-09-15`, endDate: `${start + 1}-06-30` });
    ok(y2.status === 201 && y2.body.status === 'PREPARATION' && y2.body.isCurrent === false, 'the next year is created in preparation', y2.body);
    const t = y2.body.terms.sort((a, b) => a.order - b.order);
    ok(t.length === 3 && t[0].endDate === t[1].startDate && new Date(t[0].endDate) > new Date(t[0].startDate), 'with three terms that follow each other');
    ok((await head('PATCH', `/academic-years/${y2.body.id}/status`, { status: 'ARCHIVEE' })).status === 400, 'a year in preparation cannot be archived');
    ok((await head('PATCH', `/academic-years/${y1.id}/status`, { status: 'CLOTUREE' })).status === 400, 'the current year cannot be closed while no other year is open');
    ok((await outsider('PATCH', `/academic-years/${y2.body.id}/set-current`)).status === 404 && (await outsider('PATCH', `/academic-years/${y2.body.id}/status`, { status: 'OUVERTE' })).status === 404, "another school cannot touch this school's years");
    ok((await head('PATCH', `/academic-years/${y2.body.id}/status`, { status: 'OUVERTE' })).body.status === 'OUVERTE', 'the next year is opened');

    console.log('A class at the end of the year');
    const maths = await head('POST', '/subjects', { name: 'Mathématiques', code: 'MATH', coefficient: 1 });
    const klass = await head('POST', '/classes', { name: '6ème A', code: '6A', level: '6ème', series: 'Générale' });
    ok(klass.status === 201 && klass.body.series === 'Générale', 'a class with its series', klass.body);
    const other = await head('POST', '/classes', { name: '6ème B', code: '6B', level: '6ème', capacity: 1 });
    await prisma.classSubject.create({ data: { classId: klass.body.id, subjectId: maths.body.id, coefficient: 1 } });
    const pupils = {};
    for (const [name, score] of [['Admise', 14], ['Redoublant', 6], ['Oriente', 11], ['Sortant', 12], ['Indecis', null]]) {
      const p = await head('POST', '/students', { firstName: name, lastName: TAG, dateOfBirth: '2014-01-01', gender: 'F', classId: klass.body.id });
      pupils[name] = p.body.id;
      if (score !== null) for (const term of y1.terms) await prisma.grade.create({ data: { studentId: p.body.id, subjectId: maths.body.id, classId: klass.body.id, termId: term.id, score, maxScore: 20 } });
    }
    ok((await head('PUT', `/bulletins/${pupils.Sortant}/${lastTerm.id}`, { decision: 'EXCLU' })).status === 200, 'the council excludes one pupil');

    console.log('Moving a pupil during the year');
    const extra = await head('POST', '/students', { firstName: 'Mobile', lastName: TAG, dateOfBirth: '2014-01-01', gender: 'M', classId: klass.body.id });
    const moved = await head('POST', `/classes/${klass.body.id}/move/${extra.body.id}`, { toClassId: other.body.id });
    ok(moved.status === 201 && moved.body.to === '6ème B', 'a pupil is moved to another class of the year', moved.body);
    ok((await head('POST', `/classes/${klass.body.id}/move/${pupils.Admise}`, { toClassId: other.body.id })).status === 400, 'a full class takes no more pupils');
    const trail = (await head('GET', `/promotion/students/${extra.body.id}`)).body;
    ok(trail.length === 2 && trail.some((e) => e.class === '6ème A' && e.outcome === 'TRANSFERE' && e.leftAt) && trail.some((e) => e.class === '6ème B' && !e.leftAt), 'his history keeps both classes');

    console.log('Preview and plan');
    const preview = await head('GET', `/promotion/preview?classId=${klass.body.id}&toYearId=${y2.body.id}`);
    const by = (name) => preview.body.students.find((s) => s.firstName === name);
    ok(preview.status === 200 && preview.body.targets.up.name === '5ème A' && preview.body.targets.up.id === null && preview.body.students.length === 5, 'the preview names the next class (5ème A, to be created)', preview.body);
    ok(by('Admise').proposed === 'ADMIS' && by('Redoublant').proposed === 'REDOUBLE' && by('Sortant').proposed === 'SORTANT' && by('Indecis').proposed === null, 'and proposes an outcome from the results; none without marks');
    const fifthB = await head('POST', '/classes', { name: '5ème B', code: '5B', level: '5ème', academicYearId: y2.body.id });
    const decisions = [
      { studentId: pupils.Admise, outcome: 'ADMIS' },
      { studentId: pupils.Redoublant, outcome: 'REDOUBLE' },
      { studentId: pupils.Oriente, outcome: 'ORIENTE', toClassId: fifthB.body.id },
      { studentId: pupils.Sortant, outcome: 'SORTANT' },
    ];
    const plan = await head('POST', '/promotion/run', { classId: klass.body.id, toYearId: y2.body.id, decisions });
    ok(plan.status === 200 && plan.body.executed === false && plan.body.summary.admitted === 1 && plan.body.summary.repeating === 1 && plan.body.summary.oriented === 1 && plan.body.summary.leaving === 1 && plan.body.summary.undecided === 1, 'the plan counts each outcome and the undecided pupil', plan.body);
    ok(plan.body.summary.classesToCreate.sort().join() === '5ème A,6ème A' && (await prisma.class.count({ where: { academicYearId: y2.body.id } })) === 1, 'it lists the classes to create and creates nothing yet');
    ok((await head('POST', '/promotion/run', { classId: klass.body.id, toYearId: y2.body.id, decisions: [{ studentId: pupils.Oriente, outcome: 'ORIENTE' }] })).status === 400, 'an oriented pupil needs a destination class');
    ok((await head('POST', '/promotion/run', { classId: klass.body.id, toYearId: y2.body.id, decisions: [{ studentId: extra.body.id, outcome: 'ADMIS' }] })).status === 400, 'a pupil who is not in the class is refused');
    ok((await head('POST', '/promotion/run', { classId: klass.body.id, toYearId: y1.id, decisions })).status === 400, 'the destination year must be another, later year');
    ok((await outsider('GET', `/promotion/preview?classId=${klass.body.id}&toYearId=${y2.body.id}`)).status === 404, "another school cannot see this class's promotion");

    console.log('Execution');
    const done = await head('POST', '/promotion/run', { classId: klass.body.id, toYearId: y2.body.id, decisions, confirm: true });
    ok(done.status === 200 && done.body.executed === true, 'the promotion is executed on confirmation', done.body);
    const classOf = async (id) => (await prisma.enrollment.findFirst({ where: { studentId: id, class: { academicYearId: y2.body.id } }, include: { class: true } }))?.class;
    const [a, r, o, s] = [await classOf(pupils.Admise), await classOf(pupils.Redoublant), await classOf(pupils.Oriente), await classOf(pupils.Sortant)];
    ok(a?.name === '5ème A' && a.series === 'Générale' && r?.name === '6ème A' && r.id !== klass.body.id && o?.name === '5ème B' && !s, 'admitted → 5ème A, repeating → 6ème A of the new year, oriented → 5ème B, leaving → no class');
    const status = async (id) => (await prisma.student.findUnique({ where: { id } })).status;
    ok((await status(pupils.Redoublant)) === 'REDOUBLANT' && (await status(pupils.Sortant)) === 'RETIRE' && (await status(pupils.Admise)) === 'INSCRIT', 'pupil statuses follow');
    const history = (await head('GET', `/promotion/students/${pupils.Admise}`)).body;
    ok(history.length === 2 && history[0].class === '6ème A' && history[0].outcome === 'ADMIS' && history[1].class === '5ème A' && history[1].outcome === null, 'the history of classes is kept, with the outcome of the year');
    ok((await head('GET', `/bulletins/${pupils.Admise}/${lastTerm.id}`)).status === 200, 'the report card of the past year is still readable');
    const listed = (await head('GET', `/students?search=Admise`)).body;
    ok(listed[0].enrollments[0].class.name === '5ème A', 'the pupil list shows the new class');
    const again = await head('POST', '/promotion/run', { classId: klass.body.id, toYearId: y2.body.id, decisions, confirm: true });
    ok(again.body.summary.skipped === 3 && (await prisma.enrollment.count({ where: { studentId: pupils.Admise } })) === 2, 'running it again changes nothing for pupils already placed');
    ok((await head('GET', '/promotion/history')).body.length === 2 && (await head('GET', '/promotion/history')).body[0].executedByName === 'Awa Chef', 'each execution is recorded with its author');

    console.log('Re-enrolment of a known pupil');
    const sixthNew = await prisma.class.findFirst({ where: { academicYearId: y2.body.id, name: '6ème A' } });
    const back = await head('POST', `/promotion/students/${pupils.Indecis}/reenrol`, { classId: sixthNew.id });
    ok(back.status === 201 && back.body.class === '6ème A' && back.body.restored === false, 'the undecided pupil is re-enrolled in the new year with his existing record', back.body);
    ok((await head('POST', `/promotion/students/${pupils.Indecis}/reenrol`, { classId: fifthB.body.id })).status === 409, 'not twice in the same year');
    await head('DELETE', `/students/${pupils.Sortant}`);
    const returning = await head('POST', `/promotion/students/${pupils.Sortant}/reenrol`, { classId: fifthB.body.id });
    const restored = await prisma.student.findUnique({ where: { id: pupils.Sortant } });
    ok(returning.status === 201 && returning.body.restored === true && restored.archivedAt === null && restored.status === 'INSCRIT', 'a pupil who had left comes back: his archived record is restored, not recreated');
    ok((await outsider('POST', `/promotion/students/${pupils.Admise}/reenrol`, { classId: fifthB.body.id })).status === 404, "another school cannot re-enrol this school's pupil");

    console.log('Closing the year');
    ok((await head('PATCH', `/academic-years/${y2.body.id}/set-current`)).body.isCurrent === true, 'the new year becomes the current one');
    ok((await head('PATCH', `/academic-years/${y1.id}/status`, { status: 'CLOTUREE' })).body.status === 'CLOTUREE', 'the past year is closed');
    const frozen = await head('POST', '/grades', { classId: klass.body.id, subjectId: maths.body.id, termId: lastTerm.id, type: 'DEVOIR', records: [{ studentId: pupils.Admise, score: 20 }] });
    ok(frozen.status === 400 && /clôturée/.test(frozen.body.message), 'no mark can be added to a closed year', frozen.body);
    ok((await head('POST', '/attendance/mark', { classId: klass.body.id, date: new Date().toISOString().slice(0, 10), records: [{ studentId: pupils.Admise, status: 'PRESENT' }] })).status === 400, 'nor a roll call');
    ok((await head('PATCH', `/academic-years/${y1.id}/set-current`)).status === 400, 'a closed year cannot become the current year again');
    ok((await head('GET', `/grades/class/${klass.body.id}`)).status === 200, 'its marks stay readable');
    ok((await head('PATCH', `/academic-years/${y1.id}/status`, { status: 'ARCHIVEE' })).body.status === 'ARCHIVEE' && (await head('PATCH', `/academic-years/${y1.id}/status`, { status: 'OUVERTE' })).status === 400, 'archived, the year is final');

    console.log('Archiving a class');
    ok((await head('POST', `/classes/${other.body.id}/archive`)).status === 201, 'a class is archived');
    const classes = (await head('GET', `/classes?academicYearId=${y1.id}`)).body;
    const archived = (await head('GET', `/classes?academicYearId=${y1.id}&archived=true`)).body;
    ok(!classes.some((c) => c.id === other.body.id) && archived.some((c) => c.id === other.body.id), 'it leaves the list and is found among the archived classes');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll promotion checks passed');
  process.exit(failures ? 1 : 0);
})();
