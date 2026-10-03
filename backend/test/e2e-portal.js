/* End-to-end check of the parent portal: report cards, timetable, absence justification.
 * Usage (inside the backend container or in CI): node test/e2e-portal.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
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
  const parent = client(await login('parent@school.local', 'parent123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const day = new Date('2020-01-06T00:00:00.000Z');
  let child;
  let originalDates = [];
  try {
    child = (await parent('GET', '/parent-portal/children')).body[0];
    const enrollment = await prisma.enrollment.findFirst({ where: { studentId: child.id, withdrawalDate: null, class: { academicYear: { isCurrent: true } } }, include: { class: { include: { academicYear: { include: { terms: { orderBy: { order: 'asc' } } } } } } } });
    const terms = enrollment.class.academicYear.terms;
    originalDates = terms.map((t) => ({ id: t.id, startDate: t.startDate, endDate: t.endDate }));
    // First term over, last term still running, whatever today's date is.
    await prisma.term.update({ where: { id: terms[0].id }, data: { endDate: new Date(Date.now() - 86400000) } });
    await prisma.term.update({ where: { id: terms[terms.length - 1].id }, data: { endDate: new Date(Date.now() + 30 * 86400000) } });
    const stranger = await prisma.student.findFirst({ where: { schoolId: child.schoolId, parents: { none: { students: { some: { id: child.id } } } } } });

    console.log('Report cards');
    const list = await parent('GET', `/parent-portal/children/${child.id}/bulletins`);
    const first = list.body[0];
    const lastTerm = list.body[list.body.length - 1];
    ok(list.status === 200 && list.body.length === terms.length && first.published === true && lastTerm.published === false && lastTerm.average === null, `${list.body.length} terms: the finished one is released, the running one is not`, list.body);
    ok(typeof first.average === 'number' && !!first.rankLabel && first.classSize > 0, `released card: average ${first.average}, ${first.rankLabel} of ${first.classSize}`, first);
    const pdf = await parent('GET', `/parent-portal/children/${child.id}/bulletins/${first.termId}/pdf`);
    ok(pdf.status === 200 && pdf.body.subarray(0, 5).toString() === '%PDF-', 'the parent downloads the report card');
    ok((await parent('GET', `/parent-portal/children/${child.id}/bulletins/${lastTerm.termId}/pdf`)).status === 403, 'a card is not available before the end of the term');
    ok((await parent('GET', `/parent-portal/children/${stranger.id}/bulletins`)).status === 403 && (await parent('GET', `/parent-portal/children/${stranger.id}/bulletins/${first.termId}/pdf`)).status === 403, "another family's child is refused");
    ok((await teacher('GET', `/parent-portal/children/${child.id}/bulletins`)).status === 403, 'the portal is for parents only');

    console.log('Timetable');
    const timetable = await parent('GET', `/parent-portal/children/${child.id}/timetable`);
    ok(timetable.status === 200 && timetable.body.class === enrollment.class.name && Array.isArray(timetable.body.sessions), `timetable of ${timetable.body.class}: ${timetable.body.sessions.length} lessons`);
    ok(timetable.body.sessions.every((s) => s.dayOfWeek >= 1 && s.dayOfWeek <= 7 && /^\d{2}:\d{2}$/.test(s.startTime) && s.subject), 'each lesson has a day, a time and a subject');
    ok((await parent('GET', `/parent-portal/children/${stranger.id}/timetable`)).status === 403, "not for another family's child");

    console.log('Absence justification');
    const absence = await prisma.attendance.create({ data: { classId: enrollment.classId, studentId: child.id, schoolId: child.schoolId, date: day, status: 'ABSENT' } });
    const late = await prisma.attendance.create({ data: { classId: enrollment.classId, studentId: child.id, schoolId: child.schoolId, date: new Date(day.getTime() + 86400000), status: 'RETARD' } });
    ok((await parent('POST', `/parent-portal/children/${child.id}/absences/${absence.id}/justify`, { reason: 'ok' })).status === 400, 'a reason of a few words is required');
    const request = await parent('POST', `/parent-portal/children/${child.id}/absences/${absence.id}/justify`, { reason: 'Rendez-vous médical, certificat remis au secrétariat' });
    ok(request.status === 200 && request.body.status === 'ABSENT' && request.body.justificationRequest.startsWith('Rendez-vous'), 'the reason is recorded, the absence stays unjustified until the office decides');
    ok((await parent('POST', `/parent-portal/children/${child.id}/absences/${late.id}/justify`, { reason: 'Embouteillage sur le pont' })).status === 400, 'only absences can be justified');
    ok((await parent('POST', `/parent-portal/children/${stranger.id}/absences/${absence.id}/justify`, { reason: 'Tentative sur un autre élève' })).status === 403, "not on another family's child");
    const pending = await api('GET', '/attendance/justifications');
    ok(pending.body.some((p) => p.id === absence.id && p.student.id === child.id && p.class.name), 'the office sees the request');
    const notified = await prisma.notification.findFirst({ where: { subject: 'Justificatif à traiter', createdAt: { gte: new Date(Date.now() - 60000) } } });
    ok(!!notified, 'and is notified');
    ok((await api('PATCH', `/attendance/${absence.id}/refuse-justification`)).status === 200 && !(await api('GET', '/attendance/justifications')).body.some((p) => p.id === absence.id), 'refused: the request leaves the list');
    const refusal = await prisma.notification.findFirst({ where: { subject: 'Justificatif refusé', createdAt: { gte: new Date(Date.now() - 60000) } } });
    ok(!!refusal && (await prisma.attendance.findUnique({ where: { id: absence.id } })).status === 'ABSENT', 'the parent is told, the absence stays unjustified');
    await parent('POST', `/parent-portal/children/${child.id}/absences/${absence.id}/justify`, { reason: 'Certificat médical du Dr Koné' });
    const accepted = await api('PATCH', `/attendance/${absence.id}/justify`, { justification: 'Certificat médical du Dr Koné' });
    ok(accepted.status === 200 && accepted.body.status === 'ABSENCE_JUSTIFIEE' && accepted.body.justificationRequest === null, 'accepted: the absence becomes justified');
    ok((await parent('POST', `/parent-portal/children/${child.id}/absences/${absence.id}/justify`, { reason: 'Encore une fois' })).status === 400, 'an absence already justified cannot be justified again');
  } finally {
    for (const t of originalDates) await prisma.term.update({ where: { id: t.id }, data: { startDate: t.startDate, endDate: t.endDate } });
    if (child) await prisma.attendance.deleteMany({ where: { studentId: child.id, date: { gte: day, lte: new Date(day.getTime() + 2 * 86400000) } } });
    await prisma.notification.deleteMany({ where: { subject: { in: ['Justificatif à traiter', 'Justificatif refusé'] }, createdAt: { gte: new Date(Date.now() - 300000) } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
