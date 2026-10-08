/* Custom domains (SchoolDomain): a school owner (DIRECTOR / ADMIN_ORGANISATION) can register a
 * hostname, verify it by DNS and have it marked as the primary domain of the school; the
 * hostname → school mapping is unique platform-wide (prevents takeover); another school's
 * hostname is strictly off-limits even for same-role accounts of another school; the resolver
 * maps a Host header to the right tenant and returns the public school identity.
 *
 * Uses the DIRECTOR account seeded by seed-bulk (demo123) so the scoping rules of a non
 * SUPER_ADMIN are exercised.
 *
 * Usage: node test/e2e-domains.js
 */
const { PrismaClient } = require('@prisma/client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = new PrismaClient();
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};

const login = async (email, password) => {
  const res = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await res.json().catch(() => ({}));
  return body.accessToken || null;
};

const call = (token, method, path, body, host) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(host ? { 'X-Forwarded-Host': host } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.text().then((t) => (t ? JSON.parse(t) : null)).catch(() => null) }));

(async () => {
  // Two directors from TWO DIFFERENT ORGANISATIONS: a director has authority over every school of
  // his own organisation (that is the point of a school group), so the isolation story only makes
  // sense when A and B belong to separate groups.
  const schoolsByOrg = await prisma.school.findMany({ select: { id: true, code: true, organisationId: true }, orderBy: { organisationId: 'asc' } });
  const orgs = [...new Set(schoolsByOrg.map((s) => s.organisationId))];
  if (orgs.length < 2) {
    console.log('Deux organisations distinctes requises (seed-bulk crée Demo School Group + Réseau des Écoles Techniques du Nord) : test ignoré');
    process.exit(0);
  }
  const dirA = await prisma.user.findFirst({ where: { role: 'DIRECTOR', school: { organisationId: orgs[0] } }, orderBy: { email: 'asc' } });
  const dirB = await prisma.user.findFirst({ where: { role: 'DIRECTOR', school: { organisationId: orgs[1] } }, orderBy: { email: 'asc' } });
  if (!dirA || !dirB) {
    console.log('Deux directeurs dans deux organisations différentes requis (seed-bulk) : test ignoré');
    process.exit(0);
  }
  const tokenA = await login(dirA.email, 'demo123');
  const tokenB = await login(dirB.email, 'demo123');
  if (!tokenA || !tokenB) {
    console.log(`Connexion impossible pour ${dirA.email} / ${dirB.email}`);
    process.exit(0);
  }
  const schoolA = await prisma.school.findUnique({ where: { id: dirA.schoolId } });
  const schoolB = await prisma.school.findUnique({ where: { id: dirB.schoolId } });

  // Clean up any left-over row from a previous failed run.
  await prisma.schoolDomain.deleteMany({ where: { hostname: { in: ['e2e-domain-1.test', 'e2e-domain-takeover.test'] } } });

  // The default plan (STARTER) caps customDomains to 0; grant an override on both organisations so
  // this test exercises the domain logic, not the quota logic (which has its own e2e).
  for (const o of [schoolA, schoolB]) {
    await prisma.organisationQuotaOverride.upsert({
      where: { organisationId: o.organisationId },
      update: { customDomains: 10 },
      create: { organisationId: o.organisationId, customDomains: 10 },
    });
  }

  console.log(`Direction A = ${dirA.email} (${schoolA.code})`);
  console.log(`Direction B = ${dirB.email} (${schoolB.code})`);

  try {
    // ---------- 1. Director A creates a custom domain under their school ----------
    const create = await call(tokenA, 'POST', `/schools/${schoolA.id}/domains`, { hostname: 'e2e-domain-1.test' });
    ok(create.status === 201 && create.body?.hostname === 'e2e-domain-1.test', 'POST /schools/:id/domains creates the domain', create);
    ok(create.body?.status === 'PENDING', 'the new domain starts in PENDING', create.body?.status);
    ok(create.body?.verificationRecord?.name === '_school-verify.e2e-domain-1.test', 'verification record name is _school-verify.<host>');
    const domainId = create.body.id;

    // ---------- 2. Director B of another school cannot touch A's domain ----------
    const foreignRead = await call(tokenB, 'GET', `/domains/${domainId}`);
    ok(foreignRead.status === 403 || foreignRead.status === 404, 'another school\'s director cannot read the domain', foreignRead);
    const foreignUpdate = await call(tokenB, 'PATCH', `/domains/${domainId}`, { notes: 'hacked' });
    ok(foreignUpdate.status === 403 || foreignUpdate.status === 404, 'another school\'s director cannot patch the domain', foreignUpdate);
    const foreignDelete = await call(tokenB, 'DELETE', `/domains/${domainId}`);
    ok(foreignDelete.status === 403 || foreignDelete.status === 404, 'another school\'s director cannot delete the domain', foreignDelete);
    const foreignList = await call(tokenB, 'GET', '/domains');
    ok(Array.isArray(foreignList.body) && !foreignList.body.some((d) => d.id === domainId), 'the domain does not leak in the listing of another school', foreignList.body);

    // ---------- 3. The hostname is unique platform-wide ----------
    const dup = await call(tokenA, 'POST', `/schools/${schoolA.id}/domains`, { hostname: 'e2e-domain-1.test' });
    ok(dup.status === 409, 'reserving the same hostname twice is refused (409)', dup);

    // ---------- 4. Director B cannot steal the hostname by claiming it under their own school ----------
    const stealA = await call(tokenB, 'POST', `/schools/${schoolB.id}/domains`, { hostname: 'e2e-domain-1.test' });
    ok(stealA.status === 409, 'a different school cannot claim the same hostname (409)', stealA);

    // ---------- 5. Marking an unverified domain as primary is refused ----------
    const earlyPrimary = await call(tokenA, 'PATCH', `/domains/${domainId}`, { isPrimary: true });
    ok(earlyPrimary.status === 400, 'cannot mark a PENDING domain as primary', earlyPrimary);

    // ---------- 6. Verify fails without the DNS record (public .test zone has none) ----------
    const verify = await call(tokenA, 'POST', `/domains/${domainId}/verify`);
    ok(verify.status === 201 && verify.body?.ok === false, 'POST /domains/:id/verify fails when DNS is absent', verify);

    // ---------- 7. Force the row to ACTIVE directly in DB (simulates a successful verification) ----------
    await prisma.schoolDomain.update({ where: { id: domainId }, data: { status: 'ACTIVE', verifiedAt: new Date(), lastError: null } });

    // ---------- 8. Mark as primary works now ----------
    const primary = await call(tokenA, 'PATCH', `/domains/${domainId}`, { isPrimary: true });
    ok(primary.status === 200 && primary.body?.isPrimary === true, 'ACTIVE domain can be marked as primary', primary);

    // ---------- 9. The resolver returns the right school from the Host header ----------
    const who = await call(tokenA, 'GET', '/public/host', undefined, 'e2e-domain-1.test');
    ok(who.status === 200 && who.body?.school?.id === schoolA.id, 'GET /public/host resolves the hostname to the owning school', who.body);
    ok(who.body?.kind === 'CUSTOM_DOMAIN', 'the resolved kind is CUSTOM_DOMAIN');

    // ---------- 10. Platform resolution for an unknown host does not leak another school ----------
    const unknown = await call(tokenA, 'GET', '/public/host', undefined, 'nothing-here.example');
    ok(unknown.status === 200 && !unknown.body?.school, 'an unknown hostname returns no school', unknown.body);

    // ---------- 11. Deleting my own domain works and invalidates the resolver cache ----------
    const removed = await call(tokenA, 'DELETE', `/domains/${domainId}`);
    ok(removed.status === 200, 'DELETE /domains/:id removes my own domain', removed);
    const whoAfter = await call(tokenA, 'GET', '/public/host', undefined, 'e2e-domain-1.test');
    ok(!whoAfter.body?.school, 'the deleted hostname no longer resolves to a school', whoAfter.body);

    // ---------- 12. The audit journal recorded the lifecycle ----------
    const logs = await prisma.auditLog.findMany({ where: { resource: 'domains' }, orderBy: { createdAt: 'desc' }, take: 5 });
    ok(logs.some((l) => l.action === 'CREATE') && logs.some((l) => l.action === 'DELETE'), 'CREATE and DELETE are present in the audit journal');
  } finally {
    await prisma.schoolDomain.deleteMany({ where: { hostname: { in: ['e2e-domain-1.test', 'e2e-domain-takeover.test'] } } });
    // Remove the quota overrides we added at the start.
    await prisma.organisationQuotaOverride.deleteMany({ where: { organisationId: { in: [schoolA.organisationId, schoolB.organisationId] } } });
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} échec(s)` : '\nDomaines personnalisés : OK');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
