/* End-to-end check of billing integrity, number sequences and archiving.
 * Usage (inside the backend container or in CI): node test/e2e-records.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
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
  const created = { students: [], staff: null };
  try {
    console.log('Student numbers and archiving');
    const klass = (await api('GET', '/classes')).body[0];
    const students = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => api('POST', '/students', { firstName: `Eleve${i}`, lastName: 'Test-Records', dateOfBirth: '2013-05-0' + i, gender: 'F' })),
    );
    created.students = students.map((s) => s.body.id);
    const matricules = students.map((s) => s.body.matricule);
    ok(students.every((s) => s.status === 201) && new Set(matricules).size === 5, `5 simultaneous students, 5 different numbers (${matricules.join(', ')})`);
    const s1 = students[0].body;
    const page = (await api('GET', '/students?page=1&pageSize=5&q=Test-Records')).body;
    ok(page.total === 5 && page.items.length === 5 && page.pageCount === 1, `paged list with search: ${page.total} result(s)`);

    console.log('Invoices and payments');
    const invoices = await Promise.all(
      Array.from({ length: 10 }, (_, i) => api('POST', '/billing/invoices', { studentId: s1.id, label: `Frais ${i}`, dueDate: '2026-12-31', items: [{ label: 'Scolarité', amount: 50000 }] })),
    );
    const refs = invoices.map((i) => i.body.reference);
    ok(invoices.every((i) => i.status === 201) && new Set(refs).size === 10, `10 simultaneous invoices, 10 different references`);
    ok((await api('POST', '/billing/invoices', { studentId: s1.id, label: 'x', dueDate: '2026-12-31', items: [{ label: 'x', amount: 100.5 }] })).status === 400, 'amounts must be whole francs');
    const inv = invoices[0].body;
    ok((await api('POST', `/billing/invoices/${inv.id}/payments`, { amount: 60000, method: 'CASH' })).status === 400, 'overpayment refused');
    const p1 = await api('POST', `/billing/invoices/${inv.id}/payments`, { amount: 20000, method: 'CASH' });
    let detail = (await api('GET', `/billing/invoices/${inv.id}`)).body;
    ok(p1.status === 201 && detail.status === 'PARTIALLY_PAID' && detail.paidAmount === 20000 && detail.remainingAmount === 30000, `partial payment: ${detail.paidAmount} paid, ${detail.remainingAmount} left`);
    ok((await api('POST', `/billing/invoices/${inv.id}/cancel`, { reason: 'Erreur de saisie' })).status === 400, 'an invoice holding money cannot be cancelled');
    const refund = await api('POST', `/billing/payments/${p1.body.id}/refund`, { reason: 'Double encaissement' });
    ok(refund.status === 201 && refund.body.status === 'PENDING' && refund.body.paidAmount === 0, 'refund keeps the line and resets the balance');
    const cancel = await api('POST', `/billing/invoices/${inv.id}/cancel`, { reason: 'Erreur de saisie' });
    ok(cancel.status === 201 && cancel.body.status === 'CANCELLED' && cancel.body.cancelReason === 'Erreur de saisie', 'cancelled with its reason');
    ok((await api('POST', `/billing/invoices/${inv.id}/payments`, { amount: 1000, method: 'CASH' })).status === 400, 'no payment on a cancelled invoice');
    const pay2 = await api('POST', `/billing/invoices/${invoices[1].body.id}/payments`, { amount: 50000, method: 'WAVE' });
    detail = (await api('GET', `/billing/invoices/${invoices[1].body.id}`)).body;
    ok(pay2.status === 201 && detail.status === 'PAID', 'fully paid invoice');

    console.log('Archiving');
    const archive = await api('DELETE', `/students/${s1.id}?reason=D%C3%A9m%C3%A9nagement`);
    const row = await prisma.student.findUnique({ where: { id: s1.id }, include: { invoices: true } });
    ok(archive.status === 200 && row.archivedAt && row.invoices.length === 10, 'deleting a student archives it and keeps its 10 invoices');
    const active = (await api('GET', '/students?page=1&q=Test-Records')).body;
    const archived = (await api('GET', '/students?page=1&q=Test-Records&archived=true')).body;
    ok(active.total === 4 && archived.total === 1, 'archived students leave the list and appear in the archive');
    ok((await api('POST', '/billing/invoices', { studentId: s1.id, label: 'x', dueDate: '2026-12-31', items: [{ label: 'x', amount: 1000 }] })).status === 400, 'an archived student cannot be invoiced');
    ok((await api('POST', `/students/${s1.id}/restore`)).status === 201, 'restored');

    if (klass) {
      ok((await api('DELETE', `/classes/${klass.id}`)).status === 400, `a class with history cannot be deleted (${klass.name})`);
    }

    console.log('Staff archiving cuts sessions');
    const email = `test-records-${Date.now()}@school.local`;
    const staff = await api('POST', '/staff', { email, firstName: 'Temp', lastName: 'Test-Records', role: 'SECRETARY', position: 'Secrétaire', hireDate: '2026-01-01' });
    created.staff = staff.body?.id;
    ok(staff.status === 201 && staff.body.temporaryPassword?.length >= 10, 'staff created with a policy-compliant temporary password');
    const staffToken = await login(email, staff.body.temporaryPassword);
    ok((await client(staffToken)('GET', '/students')).status === 200, 'the new account works');
    await api('DELETE', `/staff/${staff.body.id}`);
    ok((await client(staffToken)('GET', '/students')).status === 401, 'archived account: its session is refused at once');
    ok((await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: staff.body.temporaryPassword }) })).status === 401, 'and it can no longer sign in');
  } finally {
    // Remove the test records (invoices first: they reference the students).
    await prisma.payment.deleteMany({ where: { student: { lastName: 'Test-Records' } } });
    await prisma.invoice.deleteMany({ where: { student: { lastName: 'Test-Records' } } });
    await prisma.enrollment.deleteMany({ where: { student: { lastName: 'Test-Records' } } });
    await prisma.student.deleteMany({ where: { lastName: 'Test-Records' } });
    await prisma.auditLog.deleteMany({ where: { user: { lastName: 'Test-Records' } } });
    await prisma.user.deleteMany({ where: { lastName: 'Test-Records' } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
