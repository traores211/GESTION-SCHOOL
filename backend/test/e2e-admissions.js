/* End-to-end check of the admission workflow against a running backend with the demo seed.
 * Usage (inside the backend container): node test/e2e-admissions.js [http://localhost:4000/api]
 */
const BASE = process.argv[2] || 'http://localhost:4000/api';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};

async function login(email, password) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  return j.accessToken || j.access_token || j.token;
}

function client(token) {
  const call = async (method, path, body) => {
    const isForm = body instanceof FormData;
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: r.status, body: json, headers: r.headers };
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b) };
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

(async () => {
  const office = client(await login('secretaire@school.local', 'secret123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const anonymous = client(null);

  console.log('Office application');
  const created = await office.post('/admissions', {
    firstName: 'Awa',
    lastName: 'Test-Workflow',
    phone: '0700000000',
    dateOfBirth: '2013-04-12',
    gender: 'F',
    requestedLevel: '6ème',
    previousSchool: 'EPP Cocody 2',
    guardianName: 'Mariam Test-Workflow',
    guardianPhone: '0101010101',
    guardianRelation: 'Mère',
  });
  ok(created.status === 201 && /^ADM-\d{4}-\d{4}$/.test(created.body.reference), `created ${created.body.reference}`, created.body);
  const id = created.body.id;
  let d = (await office.get(`/admissions/${id}`)).body;
  ok(d.pieces.length === 5 && d.events.length === 1 && d.events[0].type === 'CREATED', 'default pieces and first timeline entry');
  const validate = d.transitions.find((t) => t.to === 'DOSSIER_COMPLET');
  ok(validate && !validate.allowed && /manquantes/.test(validate.blockedBy), `cannot validate yet: ${validate?.blockedBy}`);
  ok((await office.post(`/admissions/${id}/transition`, { to: 'ADMIS' })).status === 400, 'skipping steps is refused');

  console.log('Pieces');
  const required = d.pieces.filter((p) => p.required);
  const fd = new FormData();
  fd.append('file', new Blob([PDF], { type: 'application/pdf' }), 'acte-naissance.pdf');
  const up = await office.post(`/admissions/${id}/pieces/${required[0].id}/file`, fd);
  ok(up.status === 201 && up.body.pieces.find((p) => p.id === required[0].id).status === 'RECU', 'PDF uploaded, piece received');
  const fake = new FormData();
  fake.append('file', new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' }), 'piege.pdf');
  ok((await office.post(`/admissions/${id}/pieces/${required[1].id}/file`, fake)).status === 400, 'non-PDF content refused despite its name');
  const dl = await fetch(`${BASE}/admissions/${id}/pieces/${required[0].id}/file`, { headers: { Authorization: `Bearer ${await login('secretaire@school.local', 'secret123')}` } });
  ok(dl.status === 200 && dl.headers.get('content-type') === 'application/pdf', 'document downloaded with authentication');
  ok((await fetch(`${BASE}/admissions/${id}/pieces/${required[0].id}/file`)).status === 401, 'document refused without authentication');
  ok((await anonymous.get('/uploads/.admissions/x.pdf')).status === 404, 'private folder not served by the public uploads');
  ok((await office.patch(`/admissions/${id}/pieces/${required[1].id}`, { status: 'REFUSE' })).status === 400, 'refusing a piece needs a reason');
  for (const p of required.slice(1)) await office.patch(`/admissions/${id}/pieces/${p.id}`, { status: 'VALIDE' });
  d = (await office.get(`/admissions/${id}`)).body;
  ok(d.status === 'DOSSIER_COMPLET' && d.events.some((e) => e.userName === 'Automatique'), 'file completed automatically once every required piece is in');

  console.log('Study, test, interview, decision');
  await office.post(`/admissions/${id}/transition`, { to: 'ETUDE' });
  await office.post(`/admissions/${id}/transition`, { to: 'TEST' });
  d = (await office.get(`/admissions/${id}`)).body;
  ok(d.transitions.find((t) => t.to === 'ADMIS').allowed === false, 'decision blocked until the test score is entered');
  ok((await office.post(`/admissions/${id}/test`, { score: 25, maxScore: 20 })).status === 400, 'score above the scale refused');
  await office.post(`/admissions/${id}/test`, { scheduledAt: '2026-10-10T08:00:00.000Z' });
  await office.post(`/admissions/${id}/test`, { score: 15.5, maxScore: 20, comment: 'Bon niveau en mathématiques' });
  await office.post(`/admissions/${id}/transition`, { to: 'ENTRETIEN' });
  ok((await office.post(`/admissions/${id}/interview`, { done: true })).status === 400, 'an interview marked done needs a summary');
  await office.post(`/admissions/${id}/interview`, { done: true, notes: 'Élève motivée, famille impliquée', opinion: 'FAVORABLE' });
  const admitted = await office.post(`/admissions/${id}/transition`, { to: 'ADMIS', reason: 'Bon test et entretien favorable' });
  ok(admitted.status === 201 && admitted.body.status === 'ADMIS' && admitted.body.decidedAt, 'admitted');
  ok(admitted.body.transitions.find((t) => t.to === 'INSCRIPTION').allowed === false, 'enrolment blocked until a class is assigned');

  console.log('Class and enrolment');
  const classes = (await office.get(`/admissions/${id}/classes`)).body;
  const target = classes.find((c) => c.matchesLevel && c.free > 0);
  ok(!!target, `class options: ${classes.length}, chosen ${target?.name} (${target?.free} free)`);
  await office.post(`/admissions/${id}/class`, { classId: target.id });
  const enrolled = await office.post(`/admissions/${id}/transition`, { to: 'INSCRIPTION' });
  ok(enrolled.status === 201 && enrolled.body.student?.matricule, `student created: ${enrolled.body.student?.matricule}`, enrolled.body);
  const students = (await office.get(`/classes/${target.id}`)).body;
  const inClass = JSON.stringify(students).includes(enrolled.body.student?.id);
  ok(inClass, `enrolled in ${target.name}`);
  const confirmed = await office.post(`/admissions/${id}/transition`, { to: 'CONFIRME' });
  ok(confirmed.status === 201 && confirmed.body.status === 'CONFIRME' && confirmed.body.transitions.length === 0, 'confirmed, dossier closed');
  ok((await office.patch(`/admissions/${id}`, { phone: '0999' })).status === 400, 'a confirmed dossier can no longer be edited');

  console.log('Timeline');
  const types = confirmed.body.events.map((e) => e.type);
  ok(['CREATED', 'PIECE', 'STATUS', 'TEST', 'INTERVIEW', 'CLASS', 'ENROLLED'].every((t) => types.includes(t)), `${confirmed.body.events.length} events: ${[...new Set(types)].join(', ')}`);
  ok(confirmed.body.events.every((e) => e.userName), 'every event says who did it');
  const order = confirmed.body.events.map((e) => new Date(e.createdAt).getTime());
  ok(order.every((t, i) => i === 0 || order[i - 1] >= t), 'newest first');

  console.log('Notes, edits, rejection, reopening');
  const second = (await office.post('/admissions', { firstName: 'Yao', lastName: 'Test-Rejet', requestedLevel: '3ème' })).body;
  await office.post(`/admissions/${second.id}/notes`, { message: 'Appel du père : documents apportés lundi', kind: 'CONTACT' });
  const edited = (await office.patch(`/admissions/${second.id}`, { phone: '0505050505', previousSchool: 'Collège Moderne' })).body;
  const upd = edited.events.find((e) => e.type === 'UPDATED');
  ok(upd && upd.data.changes.length === 2, `edit traced: ${upd?.message}`);
  ok((await office.post(`/admissions/${second.id}/transition`, { to: 'REJETE' })).status === 400, 'rejection without a reason refused');
  const rejected = (await office.post(`/admissions/${second.id}/transition`, { to: 'REJETE', reason: 'Plus de place en 3ème' })).body;
  ok(rejected.status === 'REJETE' && rejected.decisionReason === 'Plus de place en 3ème', 'rejected with its reason');
  const reopened = (await office.post(`/admissions/${second.id}/transition`, { to: 'ETUDE', reason: 'Une place s’est libérée' })).body;
  ok(reopened.status === 'ETUDE' && !reopened.decisionReason, 'reopened for a new review');

  console.log('Online application and roles');
  const pub = await anonymous.post('/public/schools/DEMO-001/admissions', { firstName: 'Koffi', lastName: 'Test-En-Ligne', email: 'famille@example.com', requestedLevel: '6ème', guardianName: 'Ama Test' });
  ok(pub.status === 201 && /^ADM-/.test(pub.body.reference), `online application: ${pub.body.reference}`);
  const list = (await office.get('/admissions')).body;
  const online = list.find((a) => a.reference === pub.body.reference);
  ok(online && online.source === 'EN_LIGNE' && online.piecesRequired === 4 && online.piecesReceived === 0, 'listed with its source and piece counts');
  ok((await teacher.get('/admissions')).status === 403, 'a teacher cannot open admissions');

  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
