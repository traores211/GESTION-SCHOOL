/* End-to-end check of bulk imports (pupils with guardians, staff, opening balances, marks).
 * Usage (inside the backend container or in CI): node test/e2e-imports.js
 */
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
const NAME = 'Test-Import';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};
const login = async (email, password) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).accessToken;

function uploader(token) {
  return async (kind, content, { commit = false, name = 'import.csv' } = {}) => {
    const form = new FormData();
    form.append('file', new Blob([content]), name);
    const res = await fetch(`${BASE}/imports/${kind}${commit ? '?commit=true' : ''}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

(async () => {
  const adminToken = await login('admin@school.local', 'admin123');
  const upload = uploader(adminToken);
  const teacherUpload = uploader(await login('k.kouassi@school.local', 'teach123'));
  const get = (path) => fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  try {
    const klass = (await (await get('/classes')).json())[0];

    console.log('Templates and access');
    const kinds = await (await get('/imports')).json();
    ok(kinds.length === 4 && kinds.find((k) => k.kind === 'students').columns.some((c) => c.header === 'Date de naissance' && c.required), 'four import types with their columns');
    const template = await get('/imports/students/template');
    const templateText = await template.text();
    ok(template.status === 200 && /attachment/.test(template.headers.get('content-disposition')) && templateText.includes('Nom;Prénoms;Date de naissance;Sexe'), 'template downloadable');
    ok((await teacherUpload('students', 'Nom;Prénoms\nA;B')).status === 403 && (await teacherUpload('staff', 'x')).status === 403, 'a teacher cannot import pupils or staff');
    ok((await upload('unknown', 'a;b\n1;2')).status === 400, 'unknown import type refused');

    console.log('Pupils and guardians (CSV)');
    const csv = [
      'NOM;Prénom;Né le;Sexe;Classe;Nom du responsable;Tel parent;Email parent;Remarque',
      `${NAME};Awa;15/06/2013;F;${klass.name};${NAME};07 11 22 33 44;parent.import@test.local;RAS`,
      `${NAME};Koffi;03/02/2014;Garçon;${klass.name};${NAME};0711223344;;frère`,
      `${NAME};Sans-Date;;M;;;;;`,
      `${NAME};Mauvaise-Classe;01/01/2013;F;Classe inconnue;;;;`,
      `${NAME};Mauvais-Tel;01/01/2013;F;;Parent;12;;`,
      `${NAME};Awa;15/06/2013;F;;;;;doublon dans le fichier`,
    ].join('\n');
    const preview = await upload('students', csv);
    ok(preview.status === 200 && preview.body.committed === false && preview.body.total === 6 && preview.body.ok === 2 && preview.body.errors === 3 && preview.body.skipped === 1, `analysis: ${preview.body.ok} valid, ${preview.body.errors} errors, ${preview.body.skipped} duplicate`, preview.body);
    ok(preview.body.ignoredColumns.includes('Remarque') && preview.body.rows[0].status === 'error' && preview.body.rows[0].line === 4 && /Date de naissance manquante/.test(preview.body.rows[0].messages.join()), 'problems first, with the line number and the reason');
    ok((await prisma.student.count({ where: { lastName: NAME } })) === 0, 'the analysis writes nothing');
    const done = await upload('students', csv, { commit: true });
    const created = await prisma.student.findMany({ where: { lastName: NAME }, include: { parents: true, enrollments: true }, orderBy: { firstName: 'asc' } });
    ok(done.body.imported === 2 && created.length === 2 && created.every((s) => /^\d{4}-\d{4,}$/.test(s.matricule) && s.enrollments.length === 1), `2 pupils created and enrolled (${created.map((s) => s.matricule).join(', ')})`, done.body);
    ok(created[0].parents.length === 1 && created[0].parents[0].id === created[1].parents[0].id && created[0].parents[0].phone === '+2250711223344', 'brother and sister share one guardian record, phone in international format');
    const again = await upload('students', csv, { commit: true });
    ok(again.body.imported === 0 && again.body.skipped === 3 && (await prisma.student.count({ where: { lastName: NAME } })) === 2, 'importing the same file again creates nothing');
    ok((await upload('students', 'Nom;Classe\nX;Y')).status === 400, 'missing required columns are named');

    console.log('Pupils (Excel)');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Élèves');
    sheet.addRow(['Nom', 'Prénoms', 'Date de naissance', 'Sexe']);
    sheet.addRow([NAME, 'Excel', new Date(Date.UTC(2012, 8, 1)), 'F']);
    const xlsx = await upload('students', Buffer.from(await workbook.xlsx.writeBuffer()), { commit: true, name: 'eleves.xlsx' });
    const excelStudent = await prisma.student.findFirst({ where: { lastName: NAME, firstName: 'Excel' } });
    ok(xlsx.body.imported === 1 && excelStudent?.dateOfBirth.toISOString().startsWith('2012-09-01'), 'Excel file read, date cell understood', xlsx.body);
    ok((await upload('students', Buffer.from('%PDF-1.4 fake'), { name: 'eleves.pdf' })).status === 400, 'a PDF is refused with a clear message');

    console.log('Staff');
    const staffCsv = `Nom,Prénoms,E-mail,Fonction,Rôle,Salaire de base\n${NAME},Jean,jean.import@test.local,Professeur de SVT,Professeur,250 000\n${NAME},Paul,pas-un-email,Surveillant,,\n${NAME},Admin,admin@school.local,Directeur,Directeur,`;
    const staff = await upload('staff', staffCsv, { commit: true });
    const user = await prisma.user.findUnique({ where: { email: 'jean.import@test.local' }, include: { staffMember: true } });
    ok(staff.body.imported === 1 && staff.body.errors === 1 && staff.body.skipped === 1 && user.role === 'ENSEIGNANT' && Number(user.staffMember.baseSalary) === 250000, 'staff created (comma-separated file), invalid e-mail refused, existing account skipped', staff.body);
    const signIn = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jean.import@test.local', password: '' }) });
    ok(signIn.status >= 400, 'imported accounts have no usable password until the person sets one');

    console.log('Opening balances');
    const m = created[0].matricule;
    const balances = await upload('balances', `Matricule;Montant;Libellé;Échéance\n${m};75 000 FCFA;Solde 2025-2026;31/10/2026\n${m};abc;;\nINCONNU;5000;;`, { commit: true });
    const invoice = await prisma.invoice.findFirst({ where: { studentId: created[0].id }, include: { items: true } });
    ok(balances.body.imported === 1 && balances.body.errors === 2 && Number(invoice.totalAmount) === 75000 && invoice.label === 'Solde 2025-2026' && /^INV-/.test(invoice.reference) && invoice.items.length === 1, `invoice ${invoice?.reference} created for the balance`, balances.body);
    ok((await upload('balances', `Matricule;Montant;Libellé\n${m};75000;Solde 2025-2026`, { commit: true })).body.skipped === 1, 'the same balance is not invoiced twice');

    console.log('Marks');
    const subject = await prisma.subject.findFirst({ where: { schoolId: created[0].schoolId } });
    const grades = await upload('grades', `Matricule;Matière;Trimestre;Note;Type\n${m};${subject.name};1;14,5;Devoir\n${m};${subject.code};T1;7/10;Interro\n${m};${subject.name};1;25;Devoir\n${m};Alchimie;1;10;`, { commit: true });
    const marks = await prisma.grade.findMany({ where: { studentId: created[0].id }, orderBy: { createdAt: 'asc' } });
    ok(grades.body.imported === 2 && grades.body.errors === 2 && marks[0].score === 14.5 && marks[1].maxScore === 10 && marks[1].type === 'INTERROGATION', 'marks imported by subject name or code, scale read from "7/10", out-of-scale mark refused', grades.body);
  } finally {
    const students = await prisma.student.findMany({ where: { lastName: NAME }, select: { id: true } });
    const ids = students.map((s) => s.id);
    await prisma.grade.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.parent.deleteMany({ where: { lastName: NAME } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.student.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { user: { lastName: NAME } } });
    await prisma.user.deleteMany({ where: { lastName: NAME } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
