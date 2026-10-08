/* End-to-end check that no API response carries credentials (password hash, two-factor secret,
 * token hash), whoever asks. Usage (inside the backend container or in CI): node test/e2e-leaks.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const FORBIDDEN = ['password', 'totpSecret', 'tokenHash'];
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};
const login = async (email, password) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).accessToken;

/** Paths (a.b[].c) of forbidden keys found in a JSON value. */
function findKeys(value, path = '', found = []) {
  if (Array.isArray(value)) value.slice(0, 50).forEach((v) => findKeys(v, `${path}[]`, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN.includes(k)) found.push(`${path}.${k}`);
      else findKeys(v, `${path}.${k}`, found);
    }
  }
  return found;
}

(async () => {
  const tokens = {
    admin: await login('admin@school.local', 'admin123'),
    teacher: await login('k.kouassi@school.local', 'teach123'),
    secretary: await login('secretaire@school.local', 'secret123'),
    parent: await login('parent@school.local', 'parent123'),
  };
  try {
    const admin = await prisma.user.findUnique({ where: { email: 'admin@school.local' } });
    const klass = await prisma.class.findFirst({ where: { schoolId: admin.schoolId, teacherId: { not: null } } });
    const anyClass = klass ?? (await prisma.class.findFirst({ where: { schoolId: admin.schoolId } }));
    const staff = await prisma.user.findFirst({ where: { schoolId: admin.schoolId, role: 'ENSEIGNANT' } });
    const student = await prisma.student.findFirst({ where: { schoolId: admin.schoolId, archivedAt: null } });
    const year = await prisma.academicYear.findFirst({ where: { schoolId: admin.schoolId, isCurrent: true }, include: { terms: true } });
    // The teacher has a secret in the database for the duration of the test: it must never come out.
    await prisma.user.update({ where: { id: staff.id }, data: { totpSecret: 'LEAKCHECKSECRETLEAKCHECK' } });

    const routes = [
      '/auth/me',
      '/staff',
      `/staff/${staff.id}`,
      '/classes',
      `/classes/${anyClass.id}`,
      '/subjects',
      '/students?page=1&pageSize=5',
      `/students/${student.id}`,
      '/parents',
      '/payroll',
      `/grades/class/${anyClass.id}`,
      `/bulletins/class/${anyClass.id}/${year.terms[0].id}`,
      '/timetable/sessions',
      '/audit?page=1&pageSize=20',
      '/discipline?page=1',
      '/messaging/logs?page=1',
      '/dashboard/overview',
      '/admissions',
      '/notifications',
      '/parent-portal/children',
    ];
    let checked = 0;
    const leaks = [];
    for (const [role, token] of Object.entries(tokens)) {
      for (const route of routes) {
        const res = await fetch(`${BASE}${route}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status !== 200) continue;
        const text = await res.text();
        checked++;
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          continue;
        }
        const keys = findKeys(body);
        if (keys.length || /LEAKCHECKSECRET|\$2[aby]\$\d{2}\$/.test(text)) leaks.push(`${role} ${route}: ${[...new Set(keys)].slice(0, 4).join(', ') || 'secret value in the body'}`);
      }
    }
    ok(checked >= 30, `${checked} responses examined for 4 roles`);
    ok(leaks.length === 0, 'no password hash, two-factor secret or token hash in any response', leaks);

    const metrics = await (await fetch(`${BASE}/metrics`)).text();
    ok(/http_requests_total\{method="GET",status="2xx"\} \d+/.test(metrics) && /school_erp_database_up 1/.test(metrics) && !/@|admin|Bearer/.test(metrics), 'the metrics page counts requests and carries no personal data');

    const created = await fetch(`${BASE}/staff`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'Temp', lastName: 'Test-Leaks', email: `test-leaks-${Date.now()}@school.local`, role: 'ENSEIGNANT', position: 'Professeur', hireDate: '2026-01-01' }) });
    const body = await created.json();
    ok(created.status === 201 && findKeys(body).length === 0 && typeof body.temporaryPassword === 'string', 'creating an account returns the temporary password once, never the stored hash', findKeys(body));
    const login2 = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@school.local', password: 'admin123' }) });
    ok(findKeys(await login2.json()).length === 0, 'signing in returns no credential field');
  } finally {
    await prisma.user.updateMany({ where: { totpSecret: 'LEAKCHECKSECRETLEAKCHECK' }, data: { totpSecret: null } });
    await prisma.auditLog.deleteMany({ where: { user: { lastName: 'Test-Leaks' } } });
    await prisma.user.deleteMany({ where: { lastName: 'Test-Leaks' } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
