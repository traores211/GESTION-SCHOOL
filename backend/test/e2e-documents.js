/* End-to-end check of the documents of the pupil and staff records.
 * Usage (inside the backend container or in CI): node test/e2e-documents.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const TAG = 'Test-Document';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};
const login = async (email, password) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).accessToken;
const client = (token) => {
  const call = (method, path, body) =>
    fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  call.upload = (path, fields, content, fileName = 'piece.pdf') => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (content) form.append('file', new Blob([content]), fileName);
    return fetch(`${BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  call.raw = (path) => fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), text: r.status === 200 ? Buffer.from(await r.arrayBuffer()).toString('latin1') : '' }));
  return call;
};
const pdf = (text) => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`, 'latin1');

const cleanup = async () => {
  await prisma.document.deleteMany({ where: { name: { startsWith: TAG } } });
};

(async () => {
  const admin = client(await login('admin@school.local', 'admin123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  try {
    await cleanup();
    const child = (await parent('GET', '/parent-portal/children')).body[0];
    const stranger = await prisma.student.findFirst({ where: { schoolId: child.schoolId, archivedAt: null, parents: { none: { user: { email: 'parent@school.local' } } } } });
    const staffUser = await prisma.user.findFirst({ where: { email: 'k.kouassi@school.local' } });

    console.log('Adding to a pupil record');
    const birth = await secretary.upload('/documents', { studentId: child.id, name: `${TAG} acte de naissance`, category: 'ACTE_NAISSANCE' }, pdf('acte v1'));
    ok(birth.status === 201 && birth.body.version === 1 && birth.body.visibility === 'INTERNE' && birth.body.uploadedByName && birth.body.type === 'PDF', `the office adds a document (signed ${birth.body?.uploadedByName})`, birth.body);
    const report = await secretary.upload('/documents', { studentId: child.id, name: `${TAG} certificat de scolarité`, category: 'CERTIFICAT_SCOLARITE', visibility: 'FAMILLE', documentDate: '2026-09-20' }, pdf('certificat'));
    ok(report.status === 201 && report.body.visibility === 'FAMILLE', 'a document can be shared with the family');
    ok((await secretary.upload('/documents', { studentId: child.id, name: `${TAG} exe` }, Buffer.from('MZ this is not a document'), 'virus.pdf')).status === 400, 'a file that is not a PDF or an image is refused, whatever its name');
    ok((await secretary.upload('/documents', { studentId: child.id, name: `${TAG} vide` }, null)).status === 400, 'a request without a file is refused');
    ok((await secretary.upload('/documents', { studentId: child.id, category: 'SELFIE' }, pdf('x'))).status === 400, 'an unknown category is refused');
    ok((await teacher.upload('/documents', { studentId: child.id, name: `${TAG} prof` }, pdf('x'))).status === 403, 'a teacher does not add documents to the record');

    console.log('Reading');
    const list = await secretary('GET', `/documents?studentId=${child.id}`);
    ok(list.status === 200 && list.body.filter((d) => d.name.startsWith(TAG)).length === 2 && list.body[0].filePath === undefined, 'the office lists the record; storage paths are not exposed', list.body);
    const got = await secretary.raw(`/documents/${birth.body.id}/file`);
    ok(got.status === 200 && got.type === 'application/pdf' && got.text.includes('acte v1'), 'and opens the file');
    const forTeacher = await teacher('GET', `/documents?studentId=${child.id}`);
    ok(forTeacher.status === 200 && forTeacher.body.some((d) => d.id === report.body.id) && !forTeacher.body.some((d) => d.id === birth.body.id), 'a teacher of the pupil sees what is shared, not the internal papers');
    ok((await teacher.raw(`/documents/${birth.body.id}/file`)).status === 403, 'and cannot open an internal document by its id');

    console.log('Families');
    const family = await parent('GET', `/documents/family/${child.id}`);
    ok(family.status === 200 && family.body.length >= 1 && family.body.every((d) => d.id !== birth.body.id) && family.body.some((d) => d.id === report.body.id), 'the guardian sees the shared documents of his child only');
    ok((await parent.raw(`/documents/family/${child.id}/${report.body.id}/file`)).status === 200, 'and downloads them');
    ok((await parent.raw(`/documents/family/${child.id}/${birth.body.id}/file`)).status === 404, 'an internal document is not reachable, even by its id');
    ok((await parent('GET', `/documents/family/${stranger.id}`)).status === 403, "another pupil's documents are refused");
    ok((await parent('GET', `/documents?studentId=${child.id}`)).status === 403, 'the staff routes are closed to families');

    console.log('Versions, archive, removal');
    const v2 = await secretary.upload(`/documents/${birth.body.id}/replace`, {}, pdf('acte v2'));
    ok(v2.status === 201 && v2.body.version === 2 && v2.body.replacesId === birth.body.id && v2.body.name === birth.body.name, 'replacing a document creates version 2', v2.body);
    const archived = await secretary('GET', `/documents?studentId=${child.id}&archived=true`);
    ok(archived.body.some((d) => d.id === birth.body.id && d.status === 'ARCHIVE'), 'the former version is archived, not lost');
    ok((await secretary.raw(`/documents/${birth.body.id}/file`)).text.includes('acte v1'), 'and can still be opened');
    ok((await admin('DELETE', `/documents/${v2.body.id}`)).status === 400, 'an active document cannot be deleted');
    ok((await secretary('PATCH', `/documents/${v2.body.id}`, { status: 'ARCHIVE' })).body.status === 'ARCHIVE', 'it is archived first');
    ok((await secretary('DELETE', `/documents/${v2.body.id}`)).status === 403, 'only the management deletes for good');
    ok((await admin('DELETE', `/documents/${v2.body.id}`)).status === 200 && (await secretary.raw(`/documents/${v2.body.id}/file`)).status === 404, 'then the management removes it');

    console.log('Staff records');
    const contract = await admin.upload('/documents', { staffUserId: staffUser.id, name: `${TAG} contrat`, category: 'CONTRAT', visibility: 'FAMILLE' }, pdf('contrat'));
    ok(contract.status === 201 && contract.body.visibility === 'INTERNE' && contract.body.staffId, 'the management adds a contract to a staff record; it is never shared', contract.body);
    ok((await secretary('GET', `/documents?staffUserId=${staffUser.id}`)).status === 403 && (await secretary.raw(`/documents/${contract.body.id}/file`)).status === 403, 'staff documents are closed to the office');
    ok((await teacher.raw(`/documents/${contract.body.id}/file`)).status === 403, 'and to the staff member himself through this route');
    ok((await admin('GET', `/documents`)).status === 400, 'a list without a pupil or a staff member is refused');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll document checks passed');
  process.exit(failures ? 1 : 0);
})();
