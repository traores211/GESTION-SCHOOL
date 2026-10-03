/* End-to-end check of SMS notifications with the "log" provider (nothing leaves the server).
 * Usage (inside the backend container or in CI, SMS_PROVIDER=log): node test/e2e-messaging.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const NAME = 'Test-Messaging';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : '');
  }
};
const login = async (email, password) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).accessToken;
const client = (token) => (method, path, body) =>
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const api = client(await login('admin@school.local', 'admin123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const startedAt = new Date();
  const before = (await api('GET', '/messaging/status')).body;
  try {
    console.log('Status and settings');
    ok(before.provider === 'log' && before.live === false && before.quota > 0, `provider "${before.provider}", quota ${before.quota}, used ${before.used}`);
    ok((await teacher('GET', '/messaging/status')).status === 403, 'teachers cannot open the messaging journal');
    await api('PATCH', '/messaging/settings', { quota: 1000, events: ['ABSENCE', 'OVERDUE', 'ADMISSION', 'PAYMENT'] });

    // A pupil with two guardians: one valid number, one who refused SMS.
    const klass = (await api('GET', '/classes')).body[0];
    const student = (await api('POST', '/students', { firstName: 'Awa', lastName: NAME, dateOfBirth: '2013-03-03', gender: 'F', classId: klass.id })).body;
    await prisma.parent.create({ data: { firstName: 'Mariam', lastName: NAME, email: 'm@test.local', phone: '07 01 02 03 04', relationship: 'Mère', students: { connect: { id: student.id } } } });
    await prisma.parent.create({ data: { firstName: 'Opt', lastName: NAME, email: 'o@test.local', phone: '0505050505', relationship: 'Père', smsOptOut: true, students: { connect: { id: student.id } } } });
    const logs = async (event) => prisma.messageLog.findMany({ where: { studentId: student.id, ...(event ? { event } : {}) }, orderBy: { createdAt: 'asc' } });

    console.log('Absence');
    const today = new Date().toISOString().slice(0, 10);
    const mark = () => api('POST', '/attendance/mark', { classId: klass.id, date: today, records: [{ studentId: student.id, status: 'ABSENT' }] });
    const marked = await mark();
    let rows = await logs('ABSENCE');
    ok(marked.status === 201 && rows.length === 1 && rows[0].status === 'SENT' && rows[0].to === '+2250701020304', `one SMS to the guardian who accepts them (${rows[0]?.to})`, marked.body);
    ok(rows[0]?.segments === 1 && /Awa/.test(rows[0].body) && !/[^\x00-\x7f]/.test(rows[0].body.replace(/[éèàù]/g, '')), `single-part message: "${rows[0]?.body}"`);
    await mark();
    ok((await logs('ABSENCE')).length === 1, 'marking the same absence again sends nothing more');

    console.log('Payment receipt');
    const invoice = (await api('POST', '/billing/invoices', { studentId: student.id, label: NAME, dueDate: '2027-06-30', items: [{ label: 'Scolarité', amount: 40000 }] })).body;
    await api('POST', `/billing/invoices/${invoice.id}/payments`, { amount: 15000, method: 'CASH' });
    rows = await logs('PAYMENT');
    ok(rows.length === 1 && /15 000 FCFA/.test(rows[0].body) && rows[0].body.includes(invoice.reference), `receipt by SMS: "${rows[0]?.body}"`);

    console.log('Overdue reminders');
    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: new Date(Date.now() - 5 * 86400000), status: 'OVERDUE' } });
    const run1 = await api('POST', '/messaging/reminders/overdue');
    rows = await logs('OVERDUE');
    ok(run1.status === 200 && rows.length === 1 && /25 000 FCFA/.test(rows[0].body), `reminder with what is left to pay: "${rows[0]?.body}"`);
    await api('POST', '/messaging/reminders/overdue');
    ok((await logs('OVERDUE')).length === 1, 'at most one reminder per invoice and week');

    console.log('Event switch, quota, invalid numbers');
    await api('PATCH', '/messaging/settings', { events: ['OVERDUE'] });
    await api('POST', `/billing/invoices/${invoice.id}/payments`, { amount: 5000, method: 'CASH' });
    ok((await logs('PAYMENT')).length === 1, 'a switched-off event sends nothing');
    await api('PATCH', '/messaging/settings', { quota: 0, events: ['ABSENCE', 'OVERDUE', 'ADMISSION', 'PAYMENT'] });
    await api('POST', `/billing/invoices/${invoice.id}/payments`, { amount: 5000, method: 'CASH' });
    rows = await logs('PAYMENT');
    ok(rows.length === 2 && rows[1].status === 'SKIPPED' && /Quota/.test(rows[1].error), 'quota reached: message skipped and journaled');
    await api('PATCH', '/messaging/settings', { quota: 1000 });
    const bad = await api('POST', '/messaging/test', { to: 'n/a 1234 ?' });
    const good = await api('POST', '/messaging/test', { to: '+225 07 99 88 77 66' });
    ok(bad.body.status === 'SKIPPED' && good.body.status === 'SENT' && good.body.to === '+2250799887766', 'test message: invalid number skipped, valid number sent');
    ok((await api('PATCH', '/messaging/settings', { events: ['SPAM'] })).status === 400, 'unknown events are refused');

    console.log('Journal');
    const page = (await api('GET', '/messaging/logs?page=1&pageSize=5&event=PAYMENT')).body;
    ok(page.total >= 2 && page.items.every((m) => m.event === 'PAYMENT'), `paged and filtered journal (${page.total} payment messages)`);
    const after = (await api('GET', '/messaging/status')).body;
    ok(after.used >= before.used + 4, `monthly usage counted: ${before.used} → ${after.used}`);
  } finally {
    await api('PATCH', '/messaging/settings', { quota: before.quota, events: before.events });
    const students = await prisma.student.findMany({ where: { lastName: NAME }, select: { id: true } });
    const ids = students.map((s) => s.id);
    await prisma.messageLog.deleteMany({ where: { OR: [{ studentId: { in: ids } }, { event: 'TEST', to: { in: ['+2250799887766', 'n/a 1234 ?'] } }, { event: 'OVERDUE', createdAt: { gte: startedAt } }] } });
    await prisma.payment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.attendance.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { message: { contains: NAME } } });
    await prisma.parent.deleteMany({ where: { lastName: NAME } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.student.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
