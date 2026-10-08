/* End-to-end check of personal data protection: encryption at rest, export, anonymisation, consent.
 * Usage (inside the backend container or in CI, with DATA_ENCRYPTION_KEY set): node test/e2e-privacy.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const NAME = 'Test-Privacy';
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
  fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const api = client(await login('admin@school.local', 'admin123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const before = (await api('GET', '/privacy/settings')).body;
  const ids = { students: [], parents: [] };
  try {
    console.log('Encryption at rest');
    ok(before.encryption === true, 'sensitive columns are encrypted (DATA_ENCRYPTION_KEY set)');
    const student = (await api('POST', '/students', { firstName: 'Awa', lastName: NAME, dateOfBirth: '2012-06-15', gender: 'F', allergies: 'Arachides — EpiPen', specialNeeds: 'Tiers-temps', address: 'Cocody', phone: '0700000001' })).body;
    ids.students.push(student.id);
    // The test reads the table directly (no application layer): this is what a dump or a backup contains.
    const raw = (await prisma.$queryRaw`select allergies, "specialNeeds" from "Student" where id = ${student.id}`)[0];
    ok(raw.allergies.startsWith('enc:v1:') && !raw.allergies.includes('Arachides') && raw.specialNeeds.startsWith('enc:v1:'), `stored encrypted: ${raw.allergies.slice(0, 24)}…`);
    const read = (await api('GET', `/students/${student.id}`)).body;
    ok(read.allergies === 'Arachides — EpiPen' && read.specialNeeds === 'Tiers-temps', 'and read back in clear by the application');
    await api('PATCH', `/students/${student.id}`, { allergies: 'Arachides, pollen' });
    const raw2 = (await prisma.$queryRaw`select allergies from "Student" where id = ${student.id}`)[0];
    ok(raw2.allergies.startsWith('enc:v1:') && (await api('GET', `/students/${student.id}`)).body.allergies === 'Arachides, pollen', 'updates stay encrypted');
    const journal = await prisma.auditLog.findMany({ where: { resourceId: student.id } });
    ok(journal.length > 0 && journal.every((j) => !/Arachides/.test(`${j.oldValues}${j.newValues}`)), 'health data never reaches the audit journal');
    const plainLeft = (await prisma.$queryRaw`select count(*)::int as n from "Student" where allergies is not null and allergies <> '' and allergies not like 'enc:v1:%'`)[0].n;
    ok(plainLeft === 0, 'no health value left in clear text in the table');

    console.log('Right of access');
    const parent = await prisma.parent.create({ data: { firstName: 'Mariam', lastName: NAME, email: 'mariam@test.local', phone: '0701020304', relationship: 'Mère', students: { connect: { id: student.id } } } });
    ids.parents.push(parent.id);
    await api('POST', '/billing/invoices', { studentId: student.id, label: NAME, dueDate: '2027-06-30', items: [{ label: 'Scolarité', amount: 30000 }] });
    const exp = await api('GET', `/privacy/students/${student.id}/export`);
    ok(exp.status === 200 && exp.body.student.lastName === NAME && exp.body.student.parents[0].lastName === NAME && exp.body.student.invoices.length === 1 && exp.body.student.allergies === 'Arachides, pollen', 'export holds the identity, guardians, invoices and health data');
    ok((await secretary('GET', `/privacy/students/${student.id}/export`)).status === 403, 'reserved to the management');

    console.log('Erasure');
    ok((await api('POST', `/privacy/students/${student.id}/anonymize`, { reason: 'Demande de la famille' })).status === 400, 'an active pupil cannot be anonymised');
    await api('DELETE', `/students/${student.id}?reason=D%C3%A9part`);
    const listed = (await api('GET', '/privacy/archived')).body;
    ok(listed.some((s) => s.id === student.id && s.due === false), 'archived file listed, not yet past the retention period');
    await prisma.student.update({ where: { id: student.id }, data: { archivedAt: new Date(Date.now() - 6 * 365 * 86400000) } });
    const due = (await api('GET', '/privacy/archived?due=true')).body;
    ok(due.some((s) => s.id === student.id && s.due), 'after the retention period it is due for anonymisation');
    ok((await api('POST', `/privacy/students/${student.id}/anonymize`, {})).status === 400, 'a reason is required');
    const anon = await api('POST', `/privacy/students/${student.id}/anonymize`, { reason: 'Fin de la durée de conservation' });
    ok(anon.status === 200 && anon.body.guardiansErased === 1, 'anonymised with its only guardian', anon.body);
    const row = await prisma.student.findUnique({ where: { id: student.id }, include: { invoices: true, parents: true } });
    const guardian = await prisma.parent.findUnique({ where: { id: parent.id } });
    ok(row.firstName === 'Élève' && !row.lastName.includes(NAME) && !row.allergies && !row.address && !row.phone && row.anonymizedAt && row.dateOfBirth.toISOString().startsWith('2012-01-01'), `identity erased: "${row.firstName} ${row.lastName}"`);
    ok(row.invoices.length === 1 && row.parents.length === 0, 'invoices kept for the accounts, guardian detached');
    ok(guardian.lastName === 'Anonymisé' && guardian.phone === '' && !guardian.email.includes('mariam'), 'guardian erased');
    const journalAfter = await prisma.auditLog.findMany({ where: { resourceId: student.id } });
    ok(journalAfter.length > 0 && journalAfter.every((j) => !/Test-Privacy|Awa|Cocody|0700000001|Arachides/.test(`${j.oldValues}${j.newValues}`)), `${journalAfter.length} audit lines kept, without any personal detail`);
    ok((await api('POST', `/privacy/students/${student.id}/anonymize`, { reason: 'Encore' })).status === 400, 'cannot be anonymised twice');

    console.log('Consent and settings');
    const refused = await client(null)('POST', '/public/schools/DEMO-001/admissions', { firstName: 'Koffi', lastName: NAME, email: 'famille@example.com' });
    const accepted = await client(null)('POST', '/public/schools/DEMO-001/admissions', { firstName: 'Koffi', lastName: NAME, email: 'famille@example.com', consent: true });
    const dossier = await prisma.admission.findFirst({ where: { lastName: NAME }, orderBy: { submittedAt: 'desc' } });
    ok(refused.status === 400 && accepted.status === 201 && dossier?.consentAt, 'online application refused without consent, consent date recorded');
    const set = await api('PATCH', '/privacy/settings', { retentionYears: 3, privacyContact: 'donnees@ecole.example.ci' });
    ok(set.status === 200 && set.body.retentionYears === 3 && set.body.privacyContact === 'donnees@ecole.example.ci', 'retention period and privacy contact are configurable');
    ok((await api('PATCH', '/privacy/settings', { retentionYears: 0 })).status === 400, 'retention must be at least one year');
  } finally {
    await api('PATCH', '/privacy/settings', { retentionYears: before.retentionYears });
    await prisma.school.updateMany({ where: { privacyContact: 'donnees@ecole.example.ci' }, data: { privacyContact: null } });
    await prisma.admission.deleteMany({ where: { lastName: NAME } });
    await prisma.payment.deleteMany({ where: { studentId: { in: ids.students } } });
    await prisma.invoice.deleteMany({ where: { studentId: { in: ids.students } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: [...ids.students, ...ids.parents] } } });
    await prisma.parent.deleteMany({ where: { id: { in: ids.parents } } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: ids.students } } });
    await prisma.student.deleteMany({ where: { id: { in: ids.students } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
