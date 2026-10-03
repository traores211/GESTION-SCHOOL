/* End-to-end check of online payments (payment links) with the simulated gateway.
 * Usage (inside the backend container or in CI, without CinetPay keys): node test/e2e-payments.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const LABEL = 'Test-Payments';
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
  fetch(`${BASE}${path}`, { method, redirect: 'manual', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({
    status: r.status,
    location: r.headers.get('location'),
    body: await r.json().catch(() => null),
  }));

(async () => {
  const api = client(await login('admin@school.local', 'admin123'));
  const parentApi = client(await login('parent@school.local', 'parent123'));
  const anonymous = client(null);
  try {
    const config = (await anonymous('GET', '/payments/config')).body;
    ok(config.enabled && config.simulated, `online payment available with the simulated gateway (${config.provider})`);
    if (!config.simulated) throw new Error('This script needs the simulated gateway (no CINETPAY_* keys).');

    const child = (await parentApi('GET', '/parent-portal/children')).body[0];
    const other = (await api('GET', '/students?page=1&pageSize=50')).body.items.find((s) => s.id !== child.id);
    const invoice = (await api('POST', '/billing/invoices', { studentId: child.id, label: LABEL, dueDate: '2027-06-30', items: [{ label: 'Scolarité', amount: 50000 }] })).body;
    const foreign = (await api('POST', '/billing/invoices', { studentId: other.id, label: LABEL, dueDate: '2027-06-30', items: [{ label: 'Scolarité', amount: 50000 }] })).body;

    console.log('Payment link created by the school');
    ok((await api('POST', `/billing/invoices/${invoice.id}/pay-link`, { amount: 60000 })).status === 400, 'a link above the remaining amount is refused');
    ok((await api('POST', `/billing/invoices/${invoice.id}/pay-link`, { amount: 1003 })).status === 400, 'amounts must be multiples of 5 FCFA');
    const link = await api('POST', `/billing/invoices/${invoice.id}/pay-link`, { amount: 20000 });
    ok(link.status === 201 && link.body.transactionId && link.body.shareUrl.endsWith(`/pay/${link.body.transactionId}`), `link created (${link.body.transactionId})`);
    const again = await api('POST', `/billing/invoices/${invoice.id}/pay-link`, { amount: 20000 });
    ok(again.body.transactionId === link.body.transactionId, 'asking again reuses the pending link');
    const tx = link.body.transactionId;

    let detail = (await api('GET', `/billing/invoices/${invoice.id}`)).body;
    ok(detail.status === 'PENDING' && detail.paidAmount === 0, 'a pending online payment does not count as paid');

    console.log('Public payment page');
    const status = await anonymous('GET', `/payments/${tx}`);
    ok(status.status === 200 && status.body.status === 'PENDING' && status.body.amount === 20000 && status.body.invoiceReference === invoice.reference, 'the payer sees the amount and the invoice reference');
    ok(!JSON.stringify(status.body).includes(child.lastName), 'without the full name of the pupil');
    ok((await anonymous('GET', '/payments/PAY-DOES-NOT-EXIST')).status === 404, 'unknown transaction: 404');
    const refresh = await anonymous('POST', `/payments/${tx}/refresh`);
    ok(refresh.body.status === 'PENDING', 'refreshing does not confirm an unpaid transaction');

    console.log('Confirmation by the gateway');
    const paid = await anonymous('POST', `/payments/${tx}/simulate`, { outcome: 'SUCCESS', method: 'WAVE' });
    ok(paid.status === 200 && paid.body.status === 'SUCCESS', 'payment confirmed');
    detail = (await api('GET', `/billing/invoices/${invoice.id}`)).body;
    const line = detail.payments.find((p) => p.transactionId === tx);
    ok(detail.status === 'PARTIALLY_PAID' && detail.paidAmount === 20000 && line.method === 'WAVE' && line.payerPhone, `invoice updated: ${detail.paidAmount} paid by ${line.method}`);
    await Promise.all([anonymous('POST', `/payments/${tx}/refresh`), anonymous('POST', `/payments/${tx}/simulate`, { outcome: 'FAILED' }), anonymous('POST', `/payments/${tx}/refresh`)]);
    detail = (await api('GET', `/billing/invoices/${invoice.id}`)).body;
    ok(detail.paidAmount === 20000 && detail.payments.filter((p) => p.status === 'SUCCESS').length === 1, 'repeated confirmations change nothing (idempotent)');
    const back = await anonymous('GET', `/payments/${tx}/return`);
    ok(back.status === 303 && back.location.endsWith(`/pay/${tx}`), 'the gateway return address sends the payer to the payment page');

    console.log('Failed payment');
    const link2 = (await api('POST', `/billing/invoices/${invoice.id}/pay-link`, {})).body;
    ok(link2.amount === 30000, `default amount is what is left to pay (${link2.amount})`);
    const failed = await anonymous('POST', `/payments/${link2.transactionId}/simulate`, { outcome: 'FAILED' });
    detail = (await api('GET', `/billing/invoices/${invoice.id}`)).body;
    ok(failed.body.status === 'FAILED' && detail.paidAmount === 20000 && detail.status === 'PARTIALLY_PAID', 'a refused payment leaves the invoice unchanged');

    console.log('Parent portal');
    const parentPay = await parentApi('POST', `/parent-portal/invoices/${invoice.id}/pay`, {});
    ok(parentPay.status === 201 && parentPay.body.amount === 30000, 'a parent pays the invoice of their child');
    ok((await parentApi('POST', `/parent-portal/invoices/${foreign.id}/pay`, {})).status === 403, "but not the invoice of someone else's child");
    await anonymous('POST', `/payments/${parentPay.body.transactionId}/simulate`, { outcome: 'SUCCESS', method: 'MOBILE_MONEY_MTN' });
    detail = (await api('GET', `/billing/invoices/${invoice.id}`)).body;
    ok(detail.status === 'PAID' && detail.remainingAmount === 0, 'invoice fully paid');
    ok((await parentApi('POST', `/parent-portal/invoices/${invoice.id}/pay`, {})).status === 400, 'nothing left to pay: no new link');
    const notif = await prisma.notification.findFirst({ where: { subject: 'Paiement reçu', message: { contains: invoice.reference } }, orderBy: { createdAt: 'desc' } });
    ok(!!notif, 'the parent is notified of the payment');

    console.log('Webhook');
    const hook = await anonymous('POST', '/payments/cinetpay/notify', { cpm_trans_id: tx, cpm_site_id: '1' });
    ok(hook.status === 404 || hook.status === 403, `a forged CinetPay notification is refused (${hook.status})`);
    ok((await client(null)('POST', `/billing/invoices/${invoice.id}/pay-link`, {})).status === 401, 'creating a link requires a session');
  } finally {
    const invoices = await prisma.invoice.findMany({ where: { label: LABEL }, select: { id: true, reference: true } });
    await prisma.notification.deleteMany({ where: { OR: invoices.map((i) => ({ message: { contains: i.reference } })).concat([{ id: '-' }]) } });
    await prisma.messageLog.deleteMany({ where: { OR: invoices.map((i) => ({ body: { contains: i.reference } })).concat([{ id: '-' }]) } });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoices.map((i) => i.id) } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoices.map((i) => i.id) } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
