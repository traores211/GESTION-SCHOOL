/* End-to-end check of the school gate: arrivals, departures, QR cards, families.
 * Usage (inside the backend container or in CI): node test/e2e-gate.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const TAG = 'Test-Portail';
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

let childId;
let before;
let admin;
let school;
let hours;
const cleanup = async () => {
  if (childId) {
    await prisma.gateEvent.deleteMany({ where: { studentId: childId } });
    await prisma.notification.deleteMany({ where: { subject: { in: ['Arrivée', 'Sortie'] }, createdAt: { gte: new Date(Date.now() - 3600000) } } });
    await prisma.messageLog.deleteMany({ where: { dedupeKey: { startsWith: 'gate:' } } });
    await prisma.guardianship.updateMany({ where: { studentId: childId }, data: { canPickUp: true } });
  }
  if (hours) await prisma.school.update({ where: { id: school }, data: hours });
  if (before && admin) await admin('PATCH', '/messaging/settings', { events: before.events });
};

(async () => {
  admin = client(await login('admin@school.local', 'admin123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  try {
    const child = (await parent('GET', '/parent-portal/children')).body[0];
    childId = child.id;
    school = child.schoolId;
    const current = await prisma.school.findUnique({ where: { id: school }, select: { timetableStart: true, timetableEnd: true } });
    hours = current;
    before = (await admin('GET', '/messaging/status')).body;
    await cleanup();
    hours = current;
    // A school day that contains "now" whatever the time of the run: every exit is an early exit
    await prisma.school.update({ where: { id: school }, data: { timetableStart: '00:00', timetableEnd: '23:59' } });
    const stranger = await prisma.student.findFirst({ where: { schoolId: school, archivedAt: null, parents: { none: { user: { email: 'parent@school.local' } } } } });
    const guardian = await prisma.parent.findFirst({ where: { user: { email: 'parent@school.local' } } });

    console.log('The card');
    const card = await secretary('GET', `/gate/students/${childId}/card`);
    ok(card.status === 200 && card.body.token.length >= 20 && card.body.qr.startsWith('data:image/png'), 'the office prints the QR card of a pupil', card.body && { ...card.body, qr: '…' });
    ok((await secretary('GET', `/gate/students/${childId}/card`)).body.token === card.body.token, 'the code of a card does not change');
    ok((await teacher('GET', `/gate/students/${childId}/card`)).status === 403, 'a teacher cannot issue cards');
    const file = await secretary('GET', `/students/${childId}`);
    ok(file.status === 200 && file.body.cardToken === undefined, 'the code never appears in the pupil file');

    console.log('Arrival');
    const inScan = await teacher('POST', '/gate/scan', { token: card.body.token, accessPoint: 'Portail principal' });
    ok(inScan.status === 200 && inScan.body.kind === 'ENTREE' && inScan.body.method === 'QR' && inScan.body.accessPoint === 'Portail principal' && inScan.body.recordedByName && inScan.body.duplicate === false, `a scanned card records the arrival (by ${inScan.body?.recordedByName})`, inScan.body);
    const twice = await teacher('POST', '/gate/scan', { token: card.body.token });
    ok(twice.status === 200 && twice.body.duplicate === true && twice.body.id === inScan.body.id, 'the same card shown twice is one passage');
    const notif = await prisma.notification.findFirst({ where: { subject: 'Arrivée', user: { email: 'parent@school.local' } }, orderBy: { createdAt: 'desc' } });
    ok(!!notif && new RegExp(`^Votre enfant ${child.firstName} est arrivée? à \\d{2}:\\d{2}\\.$`).test(notif.message), `the family is told: "${notif?.message}"`);
    ok((await prisma.messageLog.count({ where: { dedupeKey: { startsWith: `gate:${inScan.body.id}` } } })) === 0, 'no SMS while the school has not switched the gate messages on');
    ok((await teacher('POST', '/gate/scan', { token: 'carte-inconnue-0000000000' })).status === 404, 'an unknown card is refused');

    console.log('Leaving before the end of the day');
    ok((await teacher('POST', '/gate/events', { studentId: childId, kind: 'SORTIE' })).status === 400, 'an early exit needs a reason');
    await prisma.guardianship.upsert({ where: { parentId_studentId: { parentId: guardian.id, studentId: childId } }, create: { parentId: guardian.id, studentId: childId, canPickUp: false }, update: { canPickUp: false } });
    const pick = await teacher('GET', `/gate/students/${childId}/pick-up`);
    ok(pick.status === 200 && pick.body.find((g) => g.id === guardian.id).canPickUp === false, 'the person at the gate sees who may collect the pupil');
    ok((await teacher('POST', '/gate/events', { studentId: childId, kind: 'SORTIE', reason: 'Rendez-vous médical', pickedUpParentId: guardian.id })).status === 403, 'a guardian who is not allowed to collect the child is refused');
    ok((await teacher('POST', '/gate/events', { studentId: childId, kind: 'SORTIE', reason: 'Rendez-vous médical', pickedUpBy: 'Un oncle' })).status === 403, 'a teacher cannot hand the pupil to an unrecorded adult');
    ok((await secretary('POST', '/gate/events', { studentId: childId, kind: 'SORTIE', pickedUpBy: 'Un oncle' })).status === 400, 'the office must give the reason');
    await prisma.guardianship.update({ where: { parentId_studentId: { parentId: guardian.id, studentId: childId } }, data: { canPickUp: true } });
    await admin('PATCH', '/messaging/settings', { events: [...before.events.filter((e) => e !== 'GATE'), 'GATE'] });
    const out = await teacher('POST', '/gate/events', { studentId: childId, kind: 'SORTIE', reason: 'Rendez-vous médical', pickedUpParentId: guardian.id });
    ok(out.status === 201 && out.body.early === true && out.body.pickedUpBy === `${guardian.firstName} ${guardian.lastName}` && out.body.method === 'MANUEL', 'an allowed guardian collects the child, with the reason recorded', out.body);
    const sms = await prisma.messageLog.findMany({ where: { dedupeKey: { startsWith: `gate:${out.body.id}` } } });
    ok(sms.length >= 1 && /a quitte|a quitté/.test(sms[0].body) && sms[0].event === 'GATE', `once switched on, the family also gets an SMS: "${sms[0]?.body}"`);

    console.log('Following the day');
    // The automatic direction is tested as if the exit were older than the double-scan delay
    await prisma.gateEvent.update({ where: { id: inScan.body.id }, data: { occurredAt: new Date(Date.now() - 20 * 60000) } });
    await prisma.gateEvent.update({ where: { id: out.body.id }, data: { occurredAt: new Date(Date.now() - 10 * 60000) } });
    const back = await teacher('POST', '/gate/events', { studentId: childId });
    ok(back.status === 201 && back.body.kind === 'ENTREE', 'the next passage of the day is an arrival again');
    const today = await secretary('GET', '/gate/today');
    ok(today.status === 200 && today.body.entries >= 2 && today.body.exits >= 1 && today.body.earlyExits >= 1 && today.body.inside >= 1, 'counters of the day: arrivals, departures, early exits, pupils inside', today.body);
    const list = await secretary('GET', `/gate/events?studentId=${childId}`);
    ok(list.status === 200 && list.body.total === 3 && list.body.items[0].kind === 'ENTREE' && list.body.items[1].kind === 'SORTIE', 'the passages of a pupil, the latest first');
    const day = await secretary('GET', `/gate/events?kind=SORTIE`);
    ok(day.status === 200 && day.body.items.some((e) => e.student.id === childId), 'the exits of the day');

    console.log('Families');
    const mine = await parent('GET', `/gate/family/${childId}`);
    ok(mine.status === 200 && mine.body.length === 3 && mine.body[1].pickedUpBy && mine.body[0].recordedByName === undefined, 'the guardian reads the arrivals and departures of his child');
    ok((await parent('GET', `/gate/family/${stranger.id}`)).status === 403, "not another pupil's");
    ok((await parent('POST', '/gate/events', { studentId: childId })).status === 403 && (await parent('GET', '/gate/today')).status === 403, 'and cannot record a passage');

    console.log('A lost card');
    const renewed = await secretary('POST', `/gate/students/${childId}/card/renew`);
    ok(renewed.status === 201 && renewed.body.token !== card.body.token, 'the office issues a new card');
    ok((await teacher('POST', '/gate/scan', { token: card.body.token })).status === 404, 'the lost card stops working');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll gate checks passed');
  process.exit(failures ? 1 : 0);
})();
