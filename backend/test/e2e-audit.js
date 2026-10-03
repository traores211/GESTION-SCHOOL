/* End-to-end check of the audit journal. Usage (inside the backend container): node test/e2e-audit.js */
const BASE = process.argv[2] || 'http://localhost:4000/api';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};
const login = async (email, password) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).accessToken;
const call = (token, method, path, body) =>
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const admin = await login('admin@school.local', 'admin123');
  const teacher = await login('k.kouassi@school.local', 'teach123');
  await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@school.local', password: 'mauvais-mot-de-passe' }) });

  const students = (await call(admin, 'GET', '/students')).body;
  const s = (Array.isArray(students) ? students : students.items)[0];
  const original = s.phone ?? null;
  await call(admin, 'PATCH', `/students/${s.id}`, { phone: '0700112233' });
  await call(admin, 'PATCH', `/students/${s.id}`, { phone: original ?? '' });
  await new Promise((r) => setTimeout(r, 300));

  const journal = (await call(admin, 'GET', `/audit?area=students&resourceId=${s.id}`)).body;
  const entry = journal.items?.find((e) => e.newValues?.body?.phone === '0700112233');
  ok(!!entry, `student edit journaled (${journal.total} entrée(s) pour cet élève)`);
  ok(entry?.action === 'UPDATE' && entry?.user?.name && entry?.oldValues?.id === s.id, 'with author, action and the state before the change');
  ok(entry?.newValues?.result === 'OK' && entry?.ipAddress, 'with the result and the IP address');

  const failed = (await call(admin, 'GET', '/audit?action=LOGIN_FAILED')).body;
  ok(failed.items?.some((e) => e.newValues?.email === 'admin@school.local'), 'failed sign-in journaled');
  ok(!JSON.stringify(failed).includes('mauvais-mot-de-passe'), 'the typed password is never stored');

  const secret = await call(admin, 'POST', '/auth/change-password', { currentPassword: 'faux', newPassword: 'Secret-Test-2026' });
  const masked = (await call(admin, 'GET', '/audit?area=auth')).body;
  ok(secret.status === 400 && !JSON.stringify(masked).includes('Secret-Test-2026') && JSON.stringify(masked).includes('[masqué]'), 'password fields are masked in the journal');

  ok((await call(teacher, 'GET', '/audit')).status === 403, 'teachers cannot read the journal');
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
