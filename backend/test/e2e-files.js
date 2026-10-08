/* End-to-end check of the pupil, guardian and staff files (extended fields, links per child).
 * Usage (inside the backend container or in CI): node test/e2e-files.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const TAG = 'Test-Dossier';
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

const cleanup = async () => {
  await prisma.parent.deleteMany({ where: { lastName: TAG } });
  await prisma.student.deleteMany({ where: { lastName: TAG } });
  await prisma.user.deleteMany({ where: { email: 'surveillant@test-dossier.local' } });
  await prisma.organisation.deleteMany({ where: { name: `${TAG} autre groupe` } });
};

(async () => {
  const admin = client(await login('admin@school.local', 'admin123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  try {
    await cleanup();
    const school = await prisma.school.findFirst({ where: { users: { some: { email: 'admin@school.local' } } } });
    const klass = await prisma.class.findFirst({ where: { schoolId: school.id, code: '6A', academicYear: { isCurrent: true } } });

    console.log('Pupil file');
    const pupil = await secretary('POST', '/students', {
      firstName: 'Alice', lastName: TAG, dateOfBirth: '2014-02-03', gender: 'F', classId: klass.id, nationality: 'Ivoirienne', countryOfOrigin: "Côte d'Ivoire",
      city: 'Abidjan', country: "Côte d'Ivoire", regime: 'DEMI_PENSIONNAIRE', previousSchool: 'EPP Cocody', previousClass: 'CM2', previousAverage: 14.5,
    });
    ok(pupil.status === 201 && pupil.body.regime === 'DEMI_PENSIONNAIRE' && pupil.body.previousAverage === 14.5 && !!pupil.body.entryDate, 'schooling details are recorded, with the entry date', pupil.body);
    ok((await secretary('POST', '/students', { firstName: 'X', lastName: TAG, dateOfBirth: '2014-02-03', gender: 'F', regime: 'PENSION' })).status === 400, 'an unknown boarding status is refused');
    ok((await secretary('PATCH', `/students/${pupil.body.id}`, { previousAverage: 25 })).status === 400, 'a previous average above 20 is refused');
    const brother = await secretary('POST', '/students', { firstName: 'Paul', lastName: TAG, dateOfBirth: '2012-06-07', gender: 'M', classId: klass.id });

    console.log('Guardian file and links per child');
    const parent = await secretary('POST', '/parents', {
      firstName: 'Jean', lastName: TAG, email: 'jean@test-dossier.local', phone: '+2250700000001', relationship: 'Père', gender: 'M', nationality: 'Ivoirienne',
      phone2: '+2250500000002', profession: 'Ingénieur', employer: 'SODECI', city: 'Abidjan', idType: 'CNI', idNumber: 'CI-0042-7788', studentIds: [pupil.body.id, brother.body.id],
    });
    ok(parent.status === 201 && parent.body.students.length === 2 && parent.body.guardianships.every((g) => g.relation === 'PERE'), 'one guardian, two children, father of both', parent.body);
    const raw = await prisma.$queryRawUnsafe('select "idNumber" from "Parent" where id = $1', parent.body.id);
    ok(raw[0].idNumber !== 'CI-0042-7788' ? raw[0].idNumber.startsWith('enc:v1:') : !process.env.DATA_ENCRYPTION_KEY, 'the identity document number is encrypted in the database');
    ok((await secretary('GET', `/parents/${parent.body.id}`)).body.idNumber === 'CI-0042-7788', 'and read back in clear by the office');
    ok((await secretary('POST', '/parents', { firstName: 'Y', lastName: TAG, email: 'y@test-dossier.local', phone: '1', relationship: 'Mère', idType: 'BADGE' })).status === 400, 'an unknown identity document type is refused');
    const link = await secretary('PUT', `/parents/${parent.body.id}/students/${brother.body.id}`, { relation: 'TUTEUR', isEmergencyContact: true, canPickUp: false });
    ok(link.status === 200 && link.body.relation === 'TUTEUR' && link.body.canPickUp === false, 'he is the tutor of the second child and may not collect him', link.body);
    const fileA = (await secretary('GET', `/students/${pupil.body.id}`)).body;
    const fileB = (await secretary('GET', `/students/${brother.body.id}`)).body;
    ok(fileA.parents[0].relation === 'PERE' && fileA.parents[0].canPickUp === true && fileB.parents[0].relation === 'TUTEUR' && fileB.parents[0].isEmergencyContact === true, 'each pupil file shows what the guardian is for that child');
    const seen = await teacher('GET', `/students/${pupil.body.id}`);
    ok(seen.status === 200 && seen.body.parents[0].phone && seen.body.parents[0].idNumber === undefined, 'a teacher sees the contact of the guardian, not his identity document');
    const stranger = await prisma.student.findFirst({ where: { schoolId: school.id, lastName: { not: TAG }, archivedAt: null } });
    ok((await secretary('PUT', `/parents/${parent.body.id}/students/${stranger.id}`, { relation: 'PERE' })).status === 404, 'a link cannot be described for a child that is not his');

    console.log('A family across two schools');
    const other = await prisma.organisation.create({
      data: { name: `${TAG} autre groupe`, slug: `test-dossier-${Date.now()}`, email: `autre-${Date.now()}@test-dossier.local`, schools: { create: { name: `${TAG} autre école`, code: `TD-${Date.now()}`, email: 'x@test-dossier.local' } } },
      include: { schools: true },
    });
    const elsewhere = await prisma.student.create({ data: { schoolId: other.schools[0].id, firstName: 'Marc', lastName: TAG, matricule: `TD-${Date.now()}`, dateOfBirth: new Date('2010-01-01'), gender: 'M', parents: { connect: { id: parent.body.id } } } });
    const seenParent = await secretary('GET', `/parents/${parent.body.id}`);
    ok(seenParent.body.students.length === 2 && !seenParent.body.students.some((s) => s.id === elsewhere.id), 'the office sees the children of its own school only');
    const updated = await secretary('PATCH', `/parents/${parent.body.id}`, { studentIds: [pupil.body.id] });
    const links = await prisma.parent.findUnique({ where: { id: parent.body.id }, include: { students: { select: { id: true } }, guardianships: true } });
    ok(updated.status === 200 && links.students.some((s) => s.id === elsewhere.id) && !links.students.some((s) => s.id === brother.body.id), "changing the children here keeps the child enrolled in the other school");
    ok(links.guardianships.length === 1 && links.guardianships[0].studentId === pupil.body.id, 'and the description of the removed link is dropped');

    console.log('Paged lists');
    const page = await secretary('GET', `/parents?page=1&pageSize=5&q=${encodeURIComponent(TAG)}`);
    ok(page.status === 200 && page.body.total === 1 && page.body.items.length === 1 && page.body.pageSize === 5, 'guardians are paged on request, with search', page.body);
    ok(Array.isArray((await secretary('GET', '/parents?search=a')).body), 'and still returned as a plain list without a page');
    const staffPage = await admin('GET', '/staff?page=1&pageSize=3');
    ok(staffPage.status === 200 && staffPage.body.items.length === 3 && staffPage.body.total > 3 && staffPage.body.items.every((u) => u.password === undefined), 'staff are paged on request', staffPage.body && { total: staffPage.body.total });
    ok((await admin('GET', '/staff?page=0')).status === 400, 'a page below 1 is refused');

    console.log('Staff file');
    const staff = await admin('POST', '/staff', { email: 'surveillant@test-dossier.local', firstName: 'Kouadio', lastName: TAG, role: 'SECRETARY', position: 'Surveillant général', hireDate: '2023-09-01' });
    ok(staff.status === 201, 'a staff member is hired', staff.body);
    const profile = await admin('PATCH', `/staff/${staff.body.id}/profile`, {
      category: 'SURVEILLANT', gender: 'M', dateOfBirth: '1988-04-05', nationality: 'Ivoirienne', contractType: 'CDD', diploma: 'Licence', experienceYears: 7,
      emergencyContactName: 'Awa Kouadio', emergencyContactPhone: '+2250700000009', bankName: 'SGCI', bankAccount: 'CI93 0000 1111 2222',
    });
    ok(profile.status === 200 && profile.body.staffMember.category === 'SURVEILLANT' && profile.body.staffMember.contractType === 'CDD' && profile.body.staffMember.bankAccount === 'CI93 0000 1111 2222', 'his file is completed: category, contract, emergency contact, bank details', profile.body);
    const rawStaff = await prisma.$queryRawUnsafe('select "bankAccount" from "StaffMember" where "userId" = $1', staff.body.id);
    ok(rawStaff[0].bankAccount !== 'CI93 0000 1111 2222' ? rawStaff[0].bankAccount.startsWith('enc:v1:') : !process.env.DATA_ENCRYPTION_KEY, 'the bank account is encrypted in the database');
    ok((await admin('PATCH', `/staff/${staff.body.id}/profile`, { category: 'JARDINIER' })).status === 400, 'an unknown category is refused');
    ok((await secretary('PATCH', `/staff/${staff.body.id}/profile`, { diploma: 'Master' })).status === 403, 'only the management edits a staff file');
    const byTeacher = await teacher('GET', `/staff/${staff.body.id}`);
    ok(byTeacher.status === 403 || (byTeacher.status === 200 && !byTeacher.body.staffMember.bankAccount), 'bank details are not shown outside the management and the accounts');
  } catch (e) {
    failures++;
    console.log('  ✘ unexpected error', e);
  } finally {
    await cleanup().catch((e) => console.log('cleanup failed', e.message));
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll file checks passed');
  process.exit(failures ? 1 : 0);
})();
