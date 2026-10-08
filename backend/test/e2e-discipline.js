/* End-to-end check of the discipline module (school life records).
 * Usage (inside the backend container or in CI): node test/e2e-discipline.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const TAG = 'Test-Discipline';
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

(async () => {
  const api = client(await login('admin@school.local', 'admin123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  const today = new Date().toISOString().slice(0, 10);
  const before = (await api('GET', '/messaging/status')).body;
  try {
    const child = (await parent('GET', '/parent-portal/children')).body[0];
    const stranger = await prisma.student.findFirst({ where: { schoolId: child.schoolId, id: { not: child.id }, archivedAt: null } });

    console.log('Reporting');
    const obs = await teacher('POST', '/discipline', { studentId: child.id, date: today, kind: 'OBSERVATION', reason: `${TAG} : bavardages répétés en cours`, sanction: 'Rappel à l’ordre' });
    ok(obs.status === 201 && obs.body.reportedByName && obs.body.student.matricule === child.matricule && obs.body.visibleToParents === true, `a teacher reports an incident (signed ${obs.body.reportedByName})`, obs.body);
    ok((await teacher('POST', '/discipline', { studentId: child.id, date: today, kind: 'PUNITION', reason: 'x' })).status === 400, 'unknown kind and empty reason refused');
    ok((await teacher('POST', '/discipline', { studentId: child.id, date: '2099-01-01', kind: 'OBSERVATION', reason: `${TAG} futur` })).status === 400, 'a date in the future is refused');
    const hidden = await api('POST', '/discipline', { studentId: child.id, date: today, kind: 'AVERTISSEMENT', reason: `${TAG} : note interne`, visibleToParents: false });
    const notif = await prisma.notification.findFirst({ where: { message: { contains: `${TAG} : bavardages` } } });
    const hiddenNotif = await prisma.notification.findFirst({ where: { message: { contains: `${TAG} : note interne` } } });
    ok(!!notif && !hiddenNotif, 'the parent is notified of what is shared, not of an internal note');

    console.log('SMS for serious sanctions');
    await api('PATCH', '/messaging/settings', { events: [...before.events.filter((e) => e !== 'DISCIPLINE')] });
    const quiet = await api('POST', '/discipline', { studentId: child.id, date: today, kind: 'CONVOCATION', reason: `${TAG} : convocation sans SMS` });
    ok(quiet.status === 201 && (await prisma.messageLog.count({ where: { dedupeKey: { startsWith: `discipline:${quiet.body.id}` } } })) === 0, 'no SMS while the school has not switched the event on');
    await api('PATCH', '/messaging/settings', { events: [...before.events.filter((e) => e !== 'DISCIPLINE'), 'DISCIPLINE'] });
    const excl = await api('POST', '/discipline', { studentId: child.id, date: today, kind: 'EXCLUSION', reason: `${TAG} : bagarre dans la cour`, sanction: 'Exclusion de 2 jours' });
    const sms = await prisma.messageLog.findMany({ where: { dedupeKey: { startsWith: `discipline:${excl.body.id}` } } });
    ok(sms.length >= 1 && /exclusion temporaire/.test(sms[0].body) && sms[0].event === 'DISCIPLINE', `once switched on, an exclusion sends an SMS: "${sms[0]?.body}"`);
    const noSms = await prisma.messageLog.count({ where: { dedupeKey: { startsWith: `discipline:${obs.body.id}` } } });
    ok(noSms === 0, 'a simple observation never sends an SMS');

    console.log('Follow-up');
    const list = await api('GET', `/discipline?page=1&studentId=${child.id}&q=${encodeURIComponent(TAG)}`);
    ok(list.status === 200 && list.body.total === 4 && list.body.items[0].student.enrollments[0].class.name, `${list.body.total} records for the pupil, with the class`);
    const byKind = await api('GET', `/discipline?page=1&kind=EXCLUSION&q=${encodeURIComponent(TAG)}`);
    ok(byKind.body.total === 1 && byKind.body.items[0].sanction === 'Exclusion de 2 jours', 'filter by kind');
    const stats = await api('GET', '/discipline/stats');
    ok(stats.body.byKind.find((k) => k.kind === 'EXCLUSION').count >= 1 && stats.body.mostSanctioned.some((s) => s.studentId === child.id), 'statistics per kind and most sanctioned pupils');
    ok((await secretary('PATCH', `/discipline/${obs.body.id}`, { sanction: 'Modifié par un tiers' })).status === 403, 'only the author or the management corrects a record');
    const fixed = await teacher('PATCH', `/discipline/${obs.body.id}`, { sanction: 'Mot dans le carnet' });
    ok(fixed.status === 200 && fixed.body.sanction === 'Mot dans le carnet', 'the author corrects their own record');
    ok((await teacher('DELETE', `/discipline/${obs.body.id}`)).status === 403 && (await api('DELETE', `/discipline/${quiet.body.id}`)).status === 200, 'only the management deletes a record');

    console.log('Family view');
    const family = await parent('GET', `/parent-portal/children/${child.id}/discipline`);
    const mine = family.body.filter((r) => r.reason.startsWith(TAG));
    ok(family.status === 200 && mine.length === 2 && !mine.some((r) => /note interne/.test(r.reason)) && !('description' in mine[0]) && !('reportedByName' in mine[0]), 'the family sees what is shared, without internal notes nor the name of the reporter');
    ok((await parent('GET', `/parent-portal/children/${stranger.id}/discipline`)).status === 403 && (await parent('GET', '/discipline')).status === 403, "not another family's child, nor the staff list");
    ok(hidden.status === 201, 'internal note recorded');
  } finally {
    await api('PATCH', '/messaging/settings', { events: before.events });
    const records = await prisma.disciplineRecord.findMany({ where: { reason: { startsWith: TAG } }, select: { id: true } });
    await prisma.messageLog.deleteMany({ where: { OR: records.map((r) => ({ dedupeKey: { startsWith: `discipline:${r.id}` } })).concat([{ id: '-' }]) } });
    await prisma.notification.deleteMany({ where: { message: { contains: TAG } } });
    await prisma.disciplineRecord.deleteMany({ where: { reason: { startsWith: TAG } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
