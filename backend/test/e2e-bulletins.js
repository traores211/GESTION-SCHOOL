/* End-to-end check of report cards and the class council sheet, on a class created for the test.
 * Usage (inside the backend container or in CI): node test/e2e-bulletins.js [baseUrl] [pdfOutputPath]
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const NAME = 'Test-Bulletin';
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
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => {
    const type = r.headers.get('content-type') || '';
    return { status: r.status, type, body: type.includes('json') ? await r.json().catch(() => null) : Buffer.from(await r.arrayBuffer()) };
  });

(async () => {
  const api = client(await login('admin@school.local', 'admin123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  const admin = await prisma.user.findUnique({ where: { email: 'admin@school.local' } });
  const schoolId = admin.schoolId;
  let klass;
  try {
    const year = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, include: { terms: { orderBy: { order: 'asc' } } } });
    const [t1, , t3] = year.terms;
    const last = year.terms[year.terms.length - 1];
    const [maths, french] = await prisma.subject.findMany({ where: { schoolId }, take: 2, orderBy: { name: 'asc' } });
    // The teacher of the scenario is the main teacher of the class: a teacher only reaches his own classes.
    const mainTeacher = await prisma.staffMember.findFirst({ where: { user: { email: 'k.kouassi@school.local' } } });
    klass = await prisma.class.create({ data: { schoolId, academicYearId: year.id, teacherId: mainTeacher.id, name: `6ème ${NAME}`, code: `TB-${Date.now()}`, level: '6ème', classSubjects: { create: [{ subjectId: maths.id, coefficient: 3 }, { subjectId: french.id, coefficient: 2 }] } } });
    // Four pupils: A and B tie at 14, C fails, D has no mark at all.
    const pupils = [];
    for (const [i, first] of ['Awa', 'Binta', 'Cedric', 'Djeneba'].entries()) {
      pupils.push(await prisma.student.create({ data: { schoolId, firstName: first, lastName: NAME, matricule: `TB-${Date.now()}-${i}`, dateOfBirth: new Date('2014-03-0' + (i + 1)), gender: i === 2 ? 'M' : 'F', placeOfBirth: 'Abidjan', enrollments: { create: { classId: klass.id } } } }));
    }
    const [a, b, c, d] = pupils;
    const mark = (student, subject, term, score, maxScore = 20, coefficient = 1) => ({ studentId: student.id, subjectId: subject.id, classId: klass.id, termId: term.id, score, maxScore, coefficient });
    await prisma.grade.createMany({
      data: [
        mark(a, maths, t1, 16), mark(a, french, t1, 11), // (16×3 + 11×2) / 5 = 14
        mark(b, maths, t1, 7, 10), mark(b, french, t1, 14), // 14/20 and 14 → 14
        mark(c, maths, t1, 6), mark(c, french, t1, 9.5), // (18 + 19) / 5 = 7.4
        mark(a, maths, last, 10), mark(a, french, last, 10), // last term: 10
        mark(c, maths, last, 8), mark(c, french, last, 8),
      ],
    });
    const day = new Date(t1.startDate.getTime() + 3 * 86400000);
    day.setHours(0, 0, 0, 0);
    await prisma.attendance.createMany({ data: [{ classId: klass.id, studentId: a.id, schoolId, date: day, status: 'ABSENT' }, { classId: klass.id, studentId: a.id, schoolId, date: new Date(day.getTime() + 86400000), status: 'RETARD' }] });

    console.log('Class council sheet');
    const sheet = (await api('GET', `/bulletins/class/${klass.id}/${t1.id}`)).body;
    const row = (p) => sheet.students.find((s) => s.id === p.id);
    ok(sheet.stats.size === 4 && sheet.stats.ranked === 3 && row(a).average === 14 && row(b).average === 14 && row(c).average === 7.4 && row(d).average === null, `averages: ${sheet.students.map((s) => s.average).join(', ')}`, sheet.stats);
    ok(row(a).rankLabel === '1er ex æquo' && row(b).rankLabel === '1er ex æquo' && row(c).rank === 3 && row(d).rank === null, 'ties share the first rank, the next pupil is 3rd, a pupil without marks is not ranked');
    ok(row(a).distinction.code === 'ENCOURAGEMENTS' && row(c).distinction.code === 'AVERTISSEMENT' && row(d).distinction === null && sheet.stats.honours === 2, 'distinctions and warnings from the thresholds');
    ok(sheet.stats.classAverage === 11.8 && sheet.stats.best === 14 && sheet.stats.lowest === 7.4 && sheet.stats.passRate === 66.7, `class: average ${sheet.stats.classAverage}, pass rate ${sheet.stats.passRate} %`);
    ok(row(a).absences.unjustified === 1 && row(a).absences.late === 1 && row(b).absences.unjustified === 0, 'absences and lateness of the term counted');
    const mathsRow = sheet.subjects.find((s) => s.id === maths.id);
    ok(mathsRow.coefficient === 3 && mathsRow.classAverage === 12 && mathsRow.best === 16 && !('perStudent' in mathsRow), 'subject statistics, without internal data');

    console.log("A pupil's card");
    const card = (await api('GET', `/bulletins/${a.id}/${t1.id}`)).body;
    const m = card.subjects.find((s) => s.subjectId === maths.id);
    ok(m.average === 16 && m.weighted === 48 && m.rankLabel === '1er' && m.appreciation === 'Très bien' && card.totals.coefficients === 5 && card.totals.weighted === 70 && card.totals.average === 14, 'subject average, weighted total, rank in the subject and automatic appreciation');
    const saved = await teacher('PUT', `/bulletins/${a.id}/${t1.id}`, { councilAppreciation: 'Bon trimestre, continuez ainsi.', appreciations: { [maths.id]: 'Élève sérieuse et appliquée' } });
    ok(saved.status === 200 && saved.body.student.councilAppreciation === 'Bon trimestre, continuez ainsi.' && saved.body.subjects.find((s) => s.subjectId === maths.id).appreciation === 'Élève sérieuse et appliquée', 'a teacher writes the appreciations');
    ok((await teacher('PUT', `/bulletins/${a.id}/${t1.id}`, { appreciations: { 'not-a-subject': 'x' } })).status === 400, 'appreciation on a subject not taught in the class refused');
    ok((await teacher('PUT', `/bulletins/${a.id}/${last.id}`, { decision: 'ADMIS' })).status === 403, 'a teacher cannot record the council decision');
    ok((await api('PUT', `/bulletins/${a.id}/${t1.id}`, { decision: 'ADMIS' })).status === 400, 'no end-of-year decision before the last term');
    ok((await parent('GET', `/bulletins/${a.id}/${t1.id}`)).status === 403, 'parents do not reach the staff routes');

    console.log('End of year');
    const final = (await api('GET', `/bulletins/class/${klass.id}/${last.id}`)).body;
    const fa = final.students.find((s) => s.id === a.id);
    const fc = final.students.find((s) => s.id === c.id);
    // Awa: T1 14 (×1), last term 10 (×2) → 34 / 3 = 11.33 ; Cédric: 7.4 and 8 → 23.4 / 3 = 7.8
    ok(final.isLastTerm && fa.annualAverage === 11.33 && fa.suggestedDecision === 'ADMIS' && fc.annualAverage === 7.8 && fc.suggestedDecision === 'EXCLU', `annual averages weighted 1-2-2: ${fa.annualAverage} and ${fc.annualAverage}`, { fa: fa.termAverages, t3: !!t3 });
    const decided = await api('PUT', `/bulletins/${c.id}/${last.id}`, { decision: 'REDOUBLE', councilAppreciation: 'Doit fournir plus d’efforts.' });
    ok(decided.status === 200 && decided.body.student.decision === 'REDOUBLE' && decided.body.decisionLabel === 'Autorisé(e) à redoubler', 'the council may depart from the suggestion');

    console.log('Documents');
    const pdf = await api('GET', `/bulletins/${a.id}/${t1.id}/pdf`);
    ok(pdf.status === 200 && pdf.type.includes('pdf') && pdf.body.subarray(0, 5).toString() === '%PDF-' && pdf.body.length > 2500, `PDF report card (${pdf.body.length} bytes)`);
    const all = await api('GET', `/bulletins/class/${klass.id}/${last.id}/pdf`);
    const pages = (all.body.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    ok(all.status === 200 && pages === 4, `class PDF: one page per pupil (${pages} pages)`);
    if (process.argv[3]) fs.writeFileSync(process.argv[3], all.body);
    const csv = await api('GET', `/bulletins/class/${klass.id}/${last.id}/csv`);
    const text = csv.body.toString('utf8');
    ok(csv.status === 200 && text.includes('Moyenne annuelle') && text.includes(`${NAME};Awa`) && text.includes('11,33') && text.includes('Autorisé(e) à redoubler'), 'results spreadsheet with annual averages and decisions');
    ok((await teacher('GET', `/bulletins/class/${klass.id}/${last.id}/csv`)).status === 403, 'the results export is reserved to the office');
    const other = await prisma.school.findFirst({ where: { id: { not: schoolId } } });
    if (other) {
      const foreign = await prisma.class.findFirst({ where: { schoolId: other.id } });
      if (foreign) ok((await api('GET', `/bulletins/class/${foreign.id}/${t1.id}`)).status === 404, "another school's class is not reachable");
    }
  } finally {
    const students = await prisma.student.findMany({ where: { lastName: NAME }, select: { id: true } });
    const ids = students.map((s) => s.id);
    await prisma.reportCard.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.grade.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.attendance.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.student.deleteMany({ where: { id: { in: ids } } });
    if (klass) await prisma.class.delete({ where: { id: klass.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
