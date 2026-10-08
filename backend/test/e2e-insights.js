/* End-to-end check of the decision aids: weekly summary (screen and e-mail), collection forecast,
 * appreciation suggestion. Usage (inside the backend container or in CI): node test/e2e-insights.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const MAILHOG = process.env.MAILHOG_URL || 'http://mailhog:8025';
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
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const api = client(await login('admin@school.local', 'admin123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  try {
    console.log('Weekly summary');
    const weekly = await api('GET', '/insights/weekly');
    const f = weekly.body.figures;
    ok(weekly.status === 200 && f.thisWeek.attendance.marked >= 0 && typeof f.outstanding === 'number' && Array.isArray(weekly.body.lines) && weekly.body.lines.length >= 2, `${weekly.body.lines?.length} sentences for the running week`, weekly.body);
    ok(weekly.body.lines.every((l) => ['attendance', 'finance', 'grades', 'admissions'].includes(l.topic) && ['good', 'warning', 'info'].includes(l.tone) && l.text.endsWith('.')), 'each sentence has a topic and a tone');
    // Cross-check one figure against the table: money collected since Monday.
    const from = new Date(weekly.body.from);
    const admin = await prisma.user.findUnique({ where: { email: 'admin@school.local' } });
    const collected = await prisma.payment.aggregate({ where: { status: 'SUCCESS', paidAt: { gte: from }, invoice: { schoolId: admin.schoolId } }, _sum: { amount: true } });
    ok(f.thisWeek.collected === Number(collected._sum.amount ?? 0) && from.getDay() === 1, `money collected since Monday matches the payments table (${f.thisWeek.collected} FCFA)`);
    const previous = await api('GET', '/insights/weekly?week=previous');
    ok(previous.status === 200 && new Date(previous.body.to) < from && new Date(previous.body.from).getDay() === 1, 'the previous week is available, Monday to Sunday');
    ok((await secretary('GET', '/insights/weekly')).status === 403 && (await parent('GET', '/insights/weekly')).status === 403, 'reserved to the management');

    console.log('E-mail');
    const sent = await api('POST', '/insights/weekly/send');
    ok(sent.status === 200 && sent.body.delivered === true && sent.body.to === 'admin@school.local', 'summary sent to the signed-in manager');
    const inbox = await (await fetch(`${MAILHOG}/api/v2/search?kind=to&query=admin@school.local&limit=5`)).json();
    const mail = inbox.items.find((m) => /Synth/.test(m.Content.Headers.Subject[0]) || /Synth/.test(Buffer.from((m.Content.Headers.Subject[0].match(/\?B\?([^?]+)\?=/) || [])[1] || '', 'base64').toString()));
    ok(!!mail, 'received in the mailbox');

    console.log('Collection forecast');
    const forecast = await api('GET', '/insights/forecast');
    const b = forecast.body.buckets;
    ok(forecast.status === 200 && b.length === 4 && b.reduce((s, x) => s + x.outstanding, 0) === forecast.body.outstanding && b.reduce((s, x) => s + x.expected, 0) === forecast.body.expected, `outstanding ${forecast.body.outstanding} FCFA, expected ${forecast.body.expected} FCFA (${forecast.body.basis}, ${forecast.body.historySize} past invoices)`, forecast.body);
    ok(b.every((x) => x.rate >= 0 && x.rate <= 1 && x.expected <= x.outstanding) && forecast.body.atRisk === forecast.body.outstanding - forecast.body.expected, 'rates between 0 and 1, expected never above what is due');
    const open = await prisma.invoice.findMany({ where: { schoolId: admin.schoolId, status: { notIn: ['CANCELLED', 'DRAFT'] } }, include: { payments: { where: { status: 'SUCCESS' } } } });
    const due = open.reduce((s, i) => s + Math.max(0, Number(i.totalAmount) - i.payments.reduce((p, x) => p + Number(x.amount), 0)), 0);
    ok(Math.round(due) === forecast.body.outstanding, 'the outstanding amount matches the invoices table');
    ok((await secretary('GET', '/insights/forecast')).status === 403, 'the forecast is for the management and the accountant');

    console.log('Appreciation suggestion');
    const child = await prisma.student.findFirst({ where: { parents: { some: { user: { email: 'parent@school.local' } } } }, include: { enrollments: { where: { withdrawalDate: null }, include: { class: { include: { academicYear: { include: { terms: { orderBy: { order: 'asc' } } } } } } } } } });
    const term = child.enrollments[0].class.academicYear.terms[0];
    const suggestion = await teacher('GET', `/bulletins/${child.id}/${term.id}/suggestion`);
    ok(suggestion.status === 200 && typeof suggestion.body.suggestion === 'string' && /trimestre|Résultats/.test(suggestion.body.suggestion) && suggestion.body.suggestion.length <= 500, `"${suggestion.body.suggestion}"`);
    ok((await parent('GET', `/bulletins/${child.id}/${term.id}/suggestion`)).status === 403, 'not for parents');
  } finally {
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
