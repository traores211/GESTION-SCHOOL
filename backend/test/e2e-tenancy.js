/* Tenant isolation: a director of school A must neither read nor change anything of school B.
 * Destructive attempts only target throw-away records created for the test in school B.
 * Usage (inside the backend container or in CI): node test/e2e-tenancy.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : '');
  }
};

(async () => {
  const token = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@school.local', password: 'admin123' }) })).json()).accessToken;
  const me = await prisma.user.findUnique({ where: { email: 'admin@school.local' } });
  const other = await prisma.school.findFirst({ where: { id: { not: me.schoolId } } });
  if (!other) {
    console.log('Une seule école : test sans objet');
    process.exit(0);
  }
  const call = (method, path, body) =>
    fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.status);
  const denied = (status) => status === 403 || status === 404;

  // Records of school B (existing ones for reads/updates, throw-away ones for deletions).
  const year = await prisma.academicYear.findFirst({ where: { schoolId: other.id } });
  const [student, klass, staff, admission, invoice, payslip, parent, announcement, subject] = await Promise.all([
    prisma.student.findFirst({ where: { schoolId: other.id } }),
    prisma.class.findFirst({ where: { schoolId: other.id } }),
    prisma.user.findFirst({ where: { schoolId: other.id, staffMember: { isNot: null } } }),
    prisma.admission.findFirst({ where: { schoolId: other.id } }),
    prisma.invoice.findFirst({ where: { schoolId: other.id } }),
    prisma.payslip.findFirst({ where: { schoolId: other.id } }),
    prisma.parent.findFirst({ where: { students: { some: { schoolId: other.id } } } }),
    prisma.announcement.findFirst({ where: { schoolId: other.id } }),
    prisma.subject.findFirst({ where: { schoolId: other.id } }),
  ]);
  const temp = await prisma.student.create({
    data: { schoolId: other.id, firstName: 'Tenancy', lastName: 'Test-Isolation', matricule: `TEN-${Date.now()}`, dateOfBirth: new Date('2012-01-01'), gender: 'M' },
  });
  const tempRoom = await prisma.room.create({ data: { schoolId: other.id, name: `Salle isolation ${Date.now()}` } });
  const myClass = await prisma.class.findFirst({ where: { schoolId: me.schoolId } });

  try {
    console.log(`School A = ${me.schoolId.slice(0, 8)}…, school B = ${other.code}`);
    const checks = [
      ['GET', `/students/${student?.id}`],
      ['PATCH', `/students/${student?.id}`, { phone: '0000000000' }],
      ['DELETE', `/students/${temp.id}`],
      ['GET', `/classes/${klass?.id}`],
      ['PATCH', `/classes/${klass?.id}`, { name: 'Piratée' }],
      ['POST', `/classes/${myClass?.id}/enroll/${temp.id}`],
      ['GET', `/staff/${staff?.id}`],
      ['PATCH', `/staff/${staff?.id}/salary`, { baseSalary: 1 }],
      ['GET', `/admissions/${admission?.id}`],
      ['POST', `/admissions/${admission?.id}/notes`, { message: 'intrusion' }],
      ['GET', `/billing/invoices/${invoice?.id}`],
      ['POST', `/billing/invoices/${invoice?.id}/payments`, { amount: 1, method: 'CASH' }],
      ['PATCH', `/payroll/${payslip?.id}`, { bonuses: 1 }],
      ['PATCH', `/parents/${parent?.id}`, { phone: '0000000000' }],
      ['PATCH', `/announcements/${announcement?.id}`, { title: 'Piratée' }],
      ['PATCH', `/subjects/${subject?.id}`, { name: 'Piratée' }],
      ['DELETE', `/timetable/rooms/${tempRoom.id}`],
      ['GET', `/bulletins/${student?.id}/x/pdf`],
      ['GET', `/students/${student?.id}/report`],
    ].filter(([, path]) => !path.includes('undefined'));

    for (const [method, path, body] of checks) {
      const status = await call(method, path, body);
      ok(denied(status), `${method} ${path.replace(/[0-9a-z-]{20,}/gi, ':id')} → ${status}`);
    }
    ok(!!(await prisma.student.findUnique({ where: { id: temp.id } })), 'the student of school B still exists');
    ok(!!(await prisma.room.findUnique({ where: { id: tempRoom.id } })), 'the room of school B still exists');
    ok((await prisma.enrollment.count({ where: { studentId: temp.id } })) === 0, 'no enrolment of a school B student into a school A class');
    if (student) ok((await prisma.student.findUnique({ where: { id: student.id } })).phone !== '0000000000', 'the school B student was not modified');

    // (The audit journal is left out: it rightly records this test's own refused attempts on B's ids.)
    const lists = ['/students', '/classes', '/staff', '/admissions', '/billing/invoices', '/parents', '/timetable/sessions'];
    for (const path of lists) {
      const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      ok(!text.includes(other.id) && (!student || !text.includes(student.id)) && !text.includes(temp.id), `list ${path} contains nothing from school B`);
    }
    if (year) ok(denied(await call('GET', `/timetable/resources?academicYearId=${year.id}`)), 'cannot open the timetable of school B by its year');
  } finally {
    await prisma.enrollment.deleteMany({ where: { studentId: temp.id } });
    await prisma.student.deleteMany({ where: { id: temp.id } });
    await prisma.room.deleteMany({ where: { id: tempRoom.id } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} fuite(s) ou échec(s)` : '\nAucune fuite entre établissements');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
