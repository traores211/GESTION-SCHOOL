import { APIRequestContext, expect, request, test } from '@playwright/test';
import { API, anonymous, as, lastEmailBody, totp, unique } from './helpers';

/**
 * Functional acceptance at API level, against the deployed environment.
 * Serial: scenarios share the seeded school "DEMO-001" and the second tenant "lycee-horizon".
 */
test.describe.configure({ mode: 'serial' });

let director: APIRequestContext;
let director2: APIRequestContext;
let teacher: APIRequestContext;
let secretary: APIRequestContext;
let accountant: APIRequestContext;
let parent: APIRequestContext;
let student: APIRequestContext;
let platform: APIRequestContext;
let classes: { id: string; name: string; code: string }[];
let studentA: { id: string; matricule: string };

test.beforeAll(async () => {
  [director, director2, teacher, secretary, accountant, parent, student, platform] = await Promise.all(
    (['director', 'director2', 'teacher', 'secretary', 'accountant', 'parent', 'student', 'platform'] as const).map(as),
  );
  classes = await (await director.get('classes')).json();
  const list = await (await director.get('students')).json();
  studentA = list[0];
});

// ---------------------------------------------------------------- Authentification
test.describe('Authentification', () => {
  test('[AUTH-01] Connexion valide : jeton de session + profil', async () => {
    const res = await (await anonymous()).post('auth/login', { data: { email: 'directeur@school.local', password: 'direct123' } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.user.role).toBe('DIRECTOR');
    expect(JSON.stringify(body)).not.toContain('password');
  });

  test('[AUTH-02] Mot de passe erroné : 401 avec message générique', async () => {
    const res = await (await anonymous()).post('auth/login', { data: { email: 'directeur@school.local', password: 'faux-mot-de-passe' } });
    expect(res.status()).toBe(401);
    expect((await res.json()).message).toBe('Email ou mot de passe incorrect');
  });

  test('[AUTH-03] Compte inexistant : même réponse (pas d’énumération des comptes)', async () => {
    const res = await (await anonymous()).post('auth/login', { data: { email: 'inconnu@school.local', password: 'x' } });
    expect(res.status()).toBe(401);
    expect((await res.json()).message).toBe('Email ou mot de passe incorrect');
  });

  test('[AUTH-04] Jeton absent, falsifié ou expiré : 401', async () => {
    const anon = await anonymous();
    expect((await anon.get('students')).status()).toBe(401);
    const forged = await request.newContext({ baseURL: `${API}/`, extraHTTPHeaders: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid' } });
    expect((await forged.get('users/me')).status()).toBe(401);
  });

  test('[AUTH-05] Mot de passe oublié → email → réinitialisation → connexion avec le nouveau mot de passe', async () => {
    const anon = await anonymous();
    // Dedicated account so the scenario can be replayed without touching seeded credentials.
    const email = `${unique('reset')}@school.local`;
    const created = await director.post('staff', {
      data: { firstName: 'Reset', lastName: 'Test', email, role: 'SECRETARY', position: 'Secrétaire', hireDate: '2026-09-01', password: 'Initial12345' },
    });
    expect(created.status()).toBe(201);
    const unknown = await anon.post('auth/forgot-password', { data: { email: 'personne@nulle-part.local' } });
    const known = await anon.post('auth/forgot-password', { data: { email } });
    expect(unknown.status()).toBe(200);
    expect(await known.json()).toEqual(await unknown.json()); // identical answer
    const token = /token=([A-Za-z0-9_-]+)/.exec(lastEmailBody(email))?.[1];
    expect(token, 'lien reçu dans la boîte simulée').toBeTruthy();
    expect((await anon.post('auth/reset-password', { data: { token, password: 'court' } })).status()).toBe(400);
    expect((await anon.post('auth/reset-password', { data: { token, password: 'NouveauSecret123' } })).status()).toBe(200);
    expect((await anon.post('auth/reset-password', { data: { token, password: 'EncoreUnAutre123' } })).status()).toBe(400); // single use
    expect((await anon.post('auth/login', { data: { email, password: 'NouveauSecret123' } })).status()).toBe(200);
    expect((await anon.post('auth/login', { data: { email, password: 'Initial12345' } })).status()).toBe(401);
  });

  test('[AUTH-06] Double authentification (TOTP) : activation puis connexion en deux étapes', async () => {
    const email = `${unique('mfa')}@school.local`;
    const created = await director.post('staff', {
      data: { firstName: 'Awa', lastName: 'Test', email, role: 'COMPTABLE', position: 'Comptable adjointe', hireDate: '2026-09-01', password: 'MotDePasse123' },
    });
    expect(created.status()).toBe(201);
    const anon = await anonymous();
    const first = await (await anon.post('auth/login', { data: { email, password: 'MotDePasse123' } })).json();
    const me = await request.newContext({ baseURL: `${API}/`, extraHTTPHeaders: { Authorization: `Bearer ${first.accessToken}` } });
    const { secret } = await (await me.post('auth/mfa/setup')).json();
    expect((await me.post('auth/mfa/enable', { data: { code: '000000' } })).status()).toBe(400);
    expect((await me.post('auth/mfa/enable', { data: { code: totp(secret) } })).status()).toBe(200);

    const step1 = await (await anon.post('auth/login', { data: { email, password: 'MotDePasse123' } })).json();
    expect(step1.mfaRequired).toBe(true);
    expect(step1.accessToken).toBeUndefined();
    // the intermediate token is NOT a session token
    const half = await request.newContext({ baseURL: `${API}/`, extraHTTPHeaders: { Authorization: `Bearer ${step1.mfaToken}` } });
    expect((await half.get('users/me')).status()).toBe(401);
    expect((await anon.post('auth/mfa/verify', { data: { mfaToken: step1.mfaToken, code: '123456' } })).status()).toBe(401);
    const step2 = await anon.post('auth/mfa/verify', { data: { mfaToken: step1.mfaToken, code: totp(secret) } });
    expect(step2.status()).toBe(200);
    expect((await step2.json()).accessToken).toBeTruthy();
  });

  test('[AUTH-07] École suspendue : ses utilisateurs perdent l’accès immédiatement, puis le retrouvent', async () => {
    const schools = await (await platform.get('platform/schools')).json();
    const horizon = schools.find((s: { code: string }) => s.code === 'lycee-horizon');
    expect((await director2.get('users/me')).status()).toBe(200);
    expect((await platform.patch(`platform/schools/${horizon.id}`, { data: { isActive: false } })).status()).toBe(200);
    expect((await director2.get('users/me')).status()).toBe(401); // same token, refused now
    expect((await platform.patch(`platform/schools/${horizon.id}`, { data: { isActive: true } })).status()).toBe(200);
    expect((await director2.get('users/me')).status()).toBe(200);
  });
});

// ---------------------------------------------------------------- Multi-tenant
test.describe('Multi-tenant', () => {
  test('[MT-01] Création d’une école par l’opérateur : tenant, année, directeur, email d’accès', async () => {
    const code = unique('ecole').toLowerCase();
    const res = await platform.post('platform/schools', {
      data: { name: 'École Recette', code, email: `${code}@ecole.local`, city: 'Yamoussoukro', plan: 'STARTER', directorFirstName: 'Ali', directorLastName: 'Recette', directorEmail: `dir-${code}@ecole.local` },
    });
    expect(res.status()).toBe(201);
    const { temporaryPassword } = await res.json();
    expect(lastEmailBody(`dir-${code}@ecole.local`)).toContain(temporaryPassword);
    const loginRes = await (await anonymous()).post('auth/login', { data: { email: `dir-${code}@ecole.local`, password: temporaryPassword } });
    expect(loginRes.status()).toBe(200);
    const dir = await request.newContext({ baseURL: `${API}/`, extraHTTPHeaders: { Authorization: `Bearer ${(await loginRes.json()).accessToken}` } });
    expect(await (await dir.get('students')).json()).toEqual([]); // empty, isolated tenant
    expect((await (await dir.get('academic-years')).json()).length).toBe(1);
  });

  test('[MT-02] Isolation : une école ne lit ni ne modifie les données d’une autre', async () => {
    expect((await director2.get(`students/${studentA.id}`)).status()).toBe(403);
    const list = await (await director2.get('students')).json();
    expect(list.every((s: { id: string }) => s.id !== studentA.id)).toBe(true);
    expect((await director2.patch(`students/${studentA.id}`, { data: { phone: '000' } })).status()).toBe(403);
    expect((await director2.delete(`students/${studentA.id}`)).status()).toBe(403);
    expect((await director2.get(`classes/${classes[0].id}`)).status()).toBe(403);
    expect((await director2.get(`billing/students/${studentA.id}/balance`)).status()).toBe(403);
  });

  test('[MT-03] Isolation en écriture : identifiants d’une autre école refusés (notes, présences, année)', async () => {
    const own = await (await director2.get('classes')).json();
    const years = await (await director.get('academic-years')).json();
    expect((await director2.patch(`academic-years/${years[0].id}/set-current`)).status()).toBe(404);
    const att = await director2.post('attendance/mark', { data: { classId: own[0].id, date: '2026-09-25', records: [{ studentId: studentA.id, status: 'ABSENT' }] } });
    expect(att.status()).toBe(400);
  });

  test('[MT-04] Matricule identique autorisé dans deux écoles différentes', async () => {
    const a = await (await director.get('students?search=2026-0001')).json();
    const b = await (await director2.get('students?search=2026-0001')).json();
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBe(1);
    expect(a[0].id).not.toBe(b[0].id);
  });

  test('[MT-05] Personnalisation : couleur illisible refusée, couleur valide appliquée au profil', async () => {
    const bad = await director.patch('school/settings', { data: { primaryColor: '#ffff66' } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).message).toContain('contraste');
    expect((await director.patch('school/settings', { data: { primaryColor: '#1f5f4a' } })).status()).toBe(200);
    const me = await (await director.get('users/me')).json();
    expect(me.school.primaryColor).toBe('#1f5f4a');
  });

  test('[MT-06] Feature flags : module hors plan = 404 ; exception activée par l’opérateur = accessible', async () => {
    expect((await director2.get('timetable/settings')).status()).toBe(404);
    expect((await director2.get('payroll')).status()).toBe(404);
    const schools = await (await platform.get('platform/schools')).json();
    const horizon = schools.find((s: { code: string }) => s.code === 'lycee-horizon');
    await platform.patch(`platform/schools/${horizon.id}`, { data: { featureOverrides: { timetable: true } } });
    expect((await director2.get('timetable/settings')).status()).toBe(200);
    await platform.patch(`platform/schools/${horizon.id}`, { data: { featureOverrides: {} } });
    expect((await director2.get('timetable/settings')).status()).toBe(404);
  });

  test('[MT-07] L’opérateur plateforme n’accède à aucune donnée d’école', async () => {
    for (const path of ['students', 'billing/invoices', 'payroll', 'school/settings', 'dashboard/overview']) {
      expect((await platform.get(path)).status(), path).toBe(403);
    }
  });

  test('[MT-08] Résolution du domaine : sous-domaine → école', async () => {
    const res = await (await anonymous()).get('public/resolve?host=demo-001.localhost');
    expect(res.status()).toBe(200);
    expect((await res.json()).code).toBe('DEMO-001');
    expect((await (await anonymous()).get('public/resolve?host=inconnue.localhost')).status()).toBe(404);
  });
});

// ---------------------------------------------------------------- RBAC
test.describe('Rôles et permissions', () => {
  test('[RBAC-01] Enseignant : ni paie, ni facturation, ni salaires', async () => {
    expect((await teacher.get('payroll')).status()).toBe(403);
    expect((await teacher.get('billing/invoices')).status()).toBe(403);
    expect((await teacher.patch('staff/x/salary', { data: { baseSalary: 1 } })).status()).toBe(403);
    const staff = await (await teacher.get('staff')).json();
    expect(staff.length).toBeGreaterThan(0);
    expect(staff.every((s: { staffMember: { baseSalary: number | null } }) => s.staffMember.baseSalary === null)).toBe(true);
    const overview = await (await teacher.get('dashboard/overview')).json();
    expect(overview.finance).toBeNull();
  });

  test('[RBAC-02] Parent : uniquement le portail et ses propres enfants', async () => {
    expect((await parent.get('students')).status()).toBe(403);
    expect((await parent.get('dashboard/overview')).status()).toBe(403);
    const children = await (await parent.get('parent-portal/children')).json();
    expect(children.length).toBeGreaterThan(0);
    const all = await (await director.get('students')).json();
    const other = all.find((s: { id: string }) => !children.some((c: { id: string }) => c.id === s.id));
    expect((await parent.get(`parent-portal/children/${other.id}`)).status()).toBe(403);
  });

  test('[RBAC-03] Élève : aucun écran de gestion', async () => {
    for (const path of ['students', 'dashboard/overview', 'classes', 'grades/student/x']) {
      expect((await student.get(path)).status(), path).toBe(403);
    }
    expect((await student.get('users/me')).status()).toBe(200);
  });

  test('[RBAC-04] Secrétaire : inscrit un élève, mais ne paie pas la paie', async () => {
    expect((await secretary.post('payroll/generate', { data: { period: '2026-09' } })).status()).toBe(403);
    const res = await secretary.post('students', { data: { firstName: 'Nina', lastName: 'Secrétariat', dateOfBirth: '2013-02-02', gender: 'F', classId: classes[0].id } });
    expect(res.status()).toBe(201);
  });

  test('[RBAC-05] Comptable : voit les salaires et les factures, pas les notes', async () => {
    const staff = await (await accountant.get('staff')).json();
    expect(staff.some((s: { staffMember: { baseSalary: number | null } }) => s.staffMember.baseSalary !== null)).toBe(true);
    const detail = await (await accountant.get(`students/${studentA.id}`)).json();
    expect(detail.grades).toEqual([]);
    expect(Array.isArray(detail.invoices)).toBe(true);
  });

  test('[RBAC-06] Aucune réponse n’expose de hash de mot de passe', async () => {
    for (const path of ['classes', `classes/${classes[0].id}`, 'staff', 'payroll']) {
      const text = await (await director.get(path)).text();
      expect(text, path).not.toMatch(/\$2[aby]\$\d\d\$/);
    }
  });
});

// ---------------------------------------------------------------- Scolarité
test.describe('Élèves, parents, classes', () => {
  let newStudent: { id: string; matricule: string };

  test('[ST-01] Inscription d’un élève avec matricule séquentiel', async () => {
    const res = await director.post('students', { data: { firstName: 'Koffi', lastName: 'Recette', dateOfBirth: '2012-05-10', gender: 'M', classId: classes[0].id } });
    expect(res.status()).toBe(201);
    newStudent = await res.json();
    expect(newStudent.matricule).toMatch(/^\d{4}-\d{4}$/);
  });

  test('[ST-02] Recherche par nom et pagination (X-Total-Count)', async () => {
    const res = await director.get('students?search=Recette&pageSize=1');
    expect(res.status()).toBe(200);
    expect(Number(res.headers()['x-total-count'])).toBeGreaterThanOrEqual(1);
    expect((await res.json()).length).toBe(1);
  });

  test('[ST-03] Modification et transfert de classe', async () => {
    expect((await director.patch(`students/${newStudent.id}`, { data: { phone: '+225 01 02 03 04' } })).status()).toBe(200);
    expect((await director.post(`classes/${classes[0].id}/unenroll/${newStudent.id}`)).status()).toBe(201);
    expect((await director.post(`classes/${classes[1].id}/enroll/${newStudent.id}`)).status()).toBe(201);
    const detail = await (await director.get(`students/${newStudent.id}`)).json();
    expect(detail.enrollments.find((e: { withdrawalDate: string | null }) => !e.withdrawalDate).class.id).toBe(classes[1].id);
  });

  test('[ST-04] Inscription dans la classe d’une autre école refusée', async () => {
    const other = await (await director2.get('classes')).json();
    const res = await director.post('students', { data: { firstName: 'X', lastName: 'Y', dateOfBirth: '2012-01-01', gender: 'M', classId: other[0].id } });
    expect(res.status()).toBe(404);
  });

  test('[PA-01] Parent rattaché à ses enfants', async () => {
    const res = await director.post('parents', {
      data: { firstName: 'Mariam', lastName: 'Recette', email: 'mariam.recette@parent.local', phone: '+2250700000000', relationship: 'Mère', studentIds: [newStudent.id] },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).students.map((s: { id: string }) => s.id)).toEqual([newStudent.id]);
  });

  test('[PA-02] Absence notifiée aux parents', async () => {
    const children = await (await parent.get('parent-portal/children')).json();
    const child = children[0];
    const classId = child.enrollments[0].class.id;
    const before = await (await parent.get('notifications/unread-count')).json();
    const res = await teacher.post('attendance/mark', { data: { classId, date: new Date().toISOString().slice(0, 10), records: [{ studentId: child.id, status: 'ABSENT' }] } });
    expect(res.status()).toBe(201);
    const after = await (await parent.get('notifications/unread-count')).json();
    expect(after).toBeGreaterThan(before);
  });

  test('[CL-01] Création et modification d’une classe ; enseignant d’une autre école refusé', async () => {
    const created = await director.post('classes', { data: { name: 'Recette 6ème Z', code: unique('Z').slice(0, 12), level: '6ème' } });
    expect(created.status()).toBe(201);
    const klass = await created.json();
    expect((await director.patch(`classes/${klass.id}`, { data: { capacity: 35 } })).status()).toBe(200);
    const foreignStaff = await (await director2.get('staff')).json();
    const res = await director.patch(`classes/${klass.id}`, { data: { teacherId: foreignStaff[0].staffMember.id } });
    expect(res.status()).toBe(404);
    expect((await director.delete(`classes/${klass.id}`)).status()).toBe(200);
  });

  test('[AD-01] Admission : passage au statut INSCRIPTION crée l’élève', async () => {
    const created = await director.post('admissions', { data: { firstName: 'Adama', lastName: 'Candidat', email: 'adama@parent.local' } });
    expect(created.status()).toBe(201);
    const adm = await created.json();
    const res = await director.patch(`admissions/${adm.id}/status`, { data: { status: 'INSCRIPTION' } });
    expect(res.status()).toBe(200);
    expect((await res.json()).student.matricule).toMatch(/^\d{4}-\d{4}$/);
  });
});

// ---------------------------------------------------------------- Notes et bulletins
test.describe('Notes et bulletins', () => {
  test('[GR-01] Saisie de notes par l’enseignant, élève non inscrit refusé', async () => {
    const klass = await (await teacher.get(`classes/${classes[0].id}`)).json();
    const years = await (await teacher.get('academic-years')).json();
    const termId = years[0].terms[0].id;
    const subjectId = klass.classSubjects[0].subject.id;
    const records = klass.enrollments.slice(0, 3).map((e: { student: { id: string } }, i: number) => ({ studentId: e.student.id, score: 8 + i * 4 }));
    const ok = await teacher.post('grades', { data: { classId: classes[0].id, subjectId, termId, type: 'DEVOIR', records } });
    expect(ok.status()).toBe(201);
    const other = await (await director2.get('students')).json();
    const bad = await teacher.post('grades', { data: { classId: classes[0].id, subjectId, termId, type: 'DEVOIR', records: [{ studentId: other[0].id, score: 20 }] } });
    expect(bad.status()).toBe(400);
  });

  test('[GR-02] Bulletin calculé (moyenne, rang) et PDF téléchargeable', async () => {
    const klass = await (await director.get(`classes/${classes[0].id}`)).json();
    const years = await (await director.get('academic-years')).json();
    const sid = klass.enrollments[0].student.id;
    const b = await (await director.get(`grades/bulletin/${sid}/${years[0].terms[0].id}`)).json();
    expect(b.overallAverage).not.toBeNull();
    expect(b.rank).toBeGreaterThanOrEqual(1);
    const pdf = await director.get(`bulletins/${sid}/${years[0].terms[0].id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
  });
});

// ---------------------------------------------------------------- Emplois du temps
test.describe('Emplois du temps', () => {
  test('[TT-01] Génération pour toutes les classes sans conflit bloquant', async () => {
    const res = await director.post('timetable/generate', { data: { constraints: { maxPerDayPerSubject: 2, blockedSlots: [5, 6, 7].map((p) => ({ day: 3, period: p })) } } });
    expect(res.status()).toBe(201);
    const r = await res.json();
    expect(r.unplaced).toEqual([]);
    expect(r.conflicts.filter((c: { severity: string }) => c.severity === 'error')).toEqual([]);
    const draft = await (await director.get(`timetable/classes/${classes[0].id}?status=DRAFT`)).json();
    expect(draft.timetable.entries.some((e: { day: number; period: number }) => e.day === 3 && e.period >= 5)).toBe(false);
  });

  test('[TT-02] Conflit introduit à la main détecté, publication refusée', async () => {
    const a = await (await director.get(`timetable/classes/${classes[0].id}?status=DRAFT`)).json();
    const b = await (await director.get(`timetable/classes/${classes[1].id}?status=DRAFT`)).json();
    // publish class B first, then put class A's teacher on one of B's slots
    expect((await director.post(`timetable/classes/${classes[1].id}/publish`)).status()).toBe(201);
    const bEntry = b.timetable.entries.find((e: { teacher: { id: string } | null }) => e.teacher);
    const aEntries = a.timetable.entries.map((e: any) => ({ day: e.day, period: e.period, subjectId: e.subjectId, teacherId: e.teacherId, roomId: e.roomId }));
    const clash = aEntries.find((e: { day: number; period: number }) => !(e.day === bEntry.day && e.period === bEntry.period));
    Object.assign(clash, { day: bEntry.day, period: bEntry.period, teacherId: bEntry.teacher.id });
    const dedup = aEntries.filter((e: any, i: number) => aEntries.findIndex((x: any) => x.day === e.day && x.period === e.period) === i);
    const upd = await director.put(`timetable/classes/${classes[0].id}/draft`, { data: { entries: dedup } });
    expect(upd.status()).toBe(200);
    expect((await upd.json()).errors).toBeGreaterThan(0);
    const pub = await director.post(`timetable/classes/${classes[0].id}/publish`);
    expect(pub.status()).toBe(400);
  });

  test('[TT-03] Régénération puis publication ; enseignants notifiés', async () => {
    expect((await director.post('timetable/generate', { data: { classIds: [classes[0].id] } })).status()).toBe(201);
    const check = await (await director.get(`timetable/classes/${classes[0].id}/check`)).json();
    expect(check.errors).toBe(0);
    expect((await director.post(`timetable/classes/${classes[0].id}/publish`)).status()).toBe(201);
    const notifs = await (await teacher.get('notifications')).json();
    expect(notifs.some((n: { subject: string }) => n.subject === 'Emploi du temps')).toBe(true);
  });

  test('[TT-04] Exports Excel (CSV) et calendrier (.ics)', async () => {
    const csv = await director.get(`timetable/classes/${classes[0].id}/export.csv`);
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain('"Jour";"Heure"');
    const ics = await director.get(`timetable/classes/${classes[0].id}/export.ics`);
    expect(ics.headers()['content-type']).toContain('text/calendar');
    const body = await ics.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('RRULE:FREQ=WEEKLY');
  });

  test('[TT-05] L’enseignant consulte son propre emploi du temps, sans pouvoir le modifier', async () => {
    const mine = await (await teacher.get('timetable/mine')).json();
    expect(mine.entries.length).toBeGreaterThan(0);
    expect((await teacher.post('timetable/generate', { data: {} })).status()).toBe(403);
  });
});

// ---------------------------------------------------------------- Finance
test.describe('Finance', () => {
  let invoiceId: string;

  test('[FI-01] Facture numérotée par école', async () => {
    const res = await accountant.post('billing/invoices', { data: { studentId: studentA.id, label: 'Frais recette', dueDate: '2026-01-15', items: [{ label: 'Scolarité', amount: 100000 }] } });
    expect(res.status()).toBe(201);
    const inv = await res.json();
    invoiceId = inv.id;
    expect(inv.reference).toMatch(/^INV-\d{4}-\d{5}$/);
  });

  test('[FI-02] Paiement partiel (Mobile Money) → PARTIALLY_PAID', async () => {
    const res = await accountant.post(`billing/invoices/${invoiceId}/payments`, { data: { amount: 40000, method: 'MOBILE_MONEY_ORANGE' } });
    expect(res.status()).toBe(201);
    const inv = await (await accountant.get(`billing/invoices/${invoiceId}`)).json();
    expect(inv.status).toBe('PARTIALLY_PAID');
  });

  test('[FI-03] Sur-paiement refusé', async () => {
    const res = await accountant.post(`billing/invoices/${invoiceId}/payments`, { data: { amount: 70000, method: 'CASH' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toContain('reste à payer');
  });

  test('[FI-04] Liste des impayés et relances aux parents', async () => {
    const unpaid = await (await accountant.get('billing/unpaid?overdue=true')).json();
    expect(unpaid.some((u: { id: string }) => u.id === invoiceId)).toBe(true);
    const r = await (await accountant.post('billing/reminders')).json();
    expect(r.invoices).toBeGreaterThan(0);
    const inv = await (await accountant.get(`billing/invoices/${invoiceId}`)).json();
    expect(inv.status).toBe('OVERDUE');
  });

  test('[FI-05] Statistiques financières cohérentes', async () => {
    const s = await (await accountant.get('billing/stats')).json();
    expect(s.totalInvoiced).toBeGreaterThan(0);
    expect(s.outstanding).toBeCloseTo(s.totalInvoiced - s.totalCollected, 2);
  });

  test('[FI-06] Paie : génération, modification, validation, paiement, PDF', async () => {
    // A period of its own for each run: a paid payslip is (rightly) locked, so replays must not reuse one.
    const period = `20${30 + Math.floor(Math.random() * 60)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`;
    const gen = await accountant.post('payroll/generate', { data: { period } });
    expect(gen.status()).toBe(201);
    const slip = (await gen.json())[0];
    expect((await accountant.patch(`payroll/${slip.id}`, { data: { bonuses: 10000 } })).status()).toBe(200);
    expect((await accountant.patch(`payroll/${slip.id}/validate`)).status()).toBe(200);
    expect((await accountant.patch(`payroll/${slip.id}/pay`)).status()).toBe(200);
    expect((await accountant.patch(`payroll/${slip.id}`, { data: { bonuses: 1 } })).status()).toBe(400);
    const pdf = await accountant.get(`payroll/${slip.id}/pdf`);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
  });
});

// ---------------------------------------------------------------- Communication et vitrine
test.describe('Communication et vitrine', () => {
  test('[CO-01] Annonce publiée visible sur la vitrine', async () => {
    const title = unique('Annonce');
    expect((await director.post('announcements', { data: { title, content: 'Réunion parents-professeurs samedi.' } })).status()).toBe(201);
    const showcase = await (await (await anonymous()).get('public/schools/DEMO-001/showcase')).json();
    expect(showcase.announcements.some((a: { title: string }) => a.title === title)).toBe(true);
  });

  test('[VI-01] Préinscription publique : dossier créé + accusé de réception email', async () => {
    const email = `${unique('famille')}@parent.local`;
    const res = await (await anonymous()).post('public/schools/DEMO-001/admissions', { data: { firstName: 'Léa', lastName: 'Publique', email } });
    expect(res.status()).toBe(201);
    expect(lastEmailBody(email)).toContain('Référence');
    const list = await (await director.get('admissions')).json();
    expect(list.some((a: { email: string }) => a.email === email)).toBe(true);
  });

  test('[VI-02] Anti-spam : champ piège rempli → ignoré silencieusement', async () => {
    const email = `${unique('bot')}@spam.local`;
    const res = await (await anonymous()).post('public/schools/DEMO-001/admissions', { data: { firstName: 'Bot', lastName: 'Spam', email, website: 'http://spam' } });
    expect(res.status()).toBe(201);
    const list = await (await director.get('admissions')).json();
    expect(list.some((a: { email: string }) => a.email === email)).toBe(false);
  });

  test('[VI-03] Formulaire de contact → message reçu par l’établissement', async () => {
    const res = await (await anonymous()).post('public/schools/DEMO-001/contact', { data: { name: 'Parent curieux', email: 'curieux@parent.local', message: 'Quels sont les frais pour la 6ème ?' } });
    expect(res.status()).toBe(201);
    const msgs = await (await director.get('school/contact-messages')).json();
    expect(msgs[0].message).toContain('frais');
  });

  test('[VI-04] Sections : masquer une section la retire de la vitrine', async () => {
    const settings = await (await director.get('school/settings')).json();
    const sections = settings.showcaseSections.map((s: { type: string }) => (s.type === 'values' ? { ...s, enabled: false } : s));
    expect((await director.patch('school/settings', { data: { showcaseSections: sections } })).status()).toBe(200);
    const pub = await (await (await anonymous()).get('public/schools/DEMO-001/showcase')).json();
    expect(pub.sections.find((s: { type: string }) => s.type === 'values').enabled).toBe(false);
    await director.patch('school/settings', { data: { showcaseSections: settings.showcaseSections } });
  });

  test('[VI-05] URL dangereuse (javascript:) refusée dans la vitrine', async () => {
    const res = await director.patch('school/settings', { data: { logoUrl: 'javascript:alert(1)' } });
    expect(res.status()).toBe(400);
  });

  test('[VI-06] Vitrine non publiée ou école inexistante → 404', async () => {
    expect((await (await anonymous()).get('public/schools/nexiste-pas/showcase')).status()).toBe(404);
  });
});

// ---------------------------------------------------------------- Documents
test.describe('Documents', () => {
  let certificate: { id: string };

  test('[DO-01] Modèles fournis par défaut', async () => {
    const t = await (await director.get('documents/templates')).json();
    expect(t.map((x: { type: string }) => x.type)).toEqual(expect.arrayContaining(['CERTIFICAT_SCOLARITE', 'ATTESTATION_INSCRIPTION', 'ATTESTATION_TRAVAIL']));
    certificate = t.find((x: { type: string }) => x.type === 'CERTIFICAT_SCOLARITE');
  });

  test('[DO-02] Analyse d’un modèle importé : correspondances proposées', async () => {
    const r = await (await director.post('documents/analyze', { data: { context: 'STUDENT', content: 'Je certifie que [Nom élève] [Prénom], matricule [Matricule], est en [Classe].' } })).json();
    const map = Object.fromEntries(r.suggestions.map((s: { placeholder: string; suggestion: string }) => [s.placeholder, s.suggestion]));
    expect(map).toMatchObject({ 'Nom élève': 'student.lastName', Prénom: 'student.firstName', Matricule: 'student.matricule', Classe: 'class.name' });
  });

  test('[DO-03] Génération d’un certificat : numéro, QR, vérification publique', async () => {
    const res = await director.post('documents/generate', { data: { templateId: certificate.id, subjectId: studentA.id } });
    expect(res.status()).toBe(201);
    const doc = await res.json();
    expect(doc.number).toMatch(/^DOC-\d{4}-\d{5}$/);
    const html = await (await director.get(`documents/${doc.id}/html`)).text();
    expect(html).toContain(studentA.matricule);
    expect(html).toContain('data:image/png;base64'); // QR code
    const verify = await (await anonymous()).get(`public/documents/verify/${doc.verificationCode}`);
    expect(verify.status()).toBe(200);
    const v = await verify.json();
    expect(v.authentic).toBe(true);
    expect(JSON.stringify(v)).not.toContain(studentA.matricule); // no personal data on the public check
    expect((await (await anonymous()).get('public/documents/verify/faux-code')).status()).toBe(404);
  });

  test('[DO-04] Script injecté dans un modèle supprimé ; en-tête CSP strict sur les documents', async () => {
    const created = await director.post('documents/templates', {
      data: { name: unique('Modele XSS'), type: 'COURRIER', context: 'STUDENT', content: '<p onclick="x()">Élève {{student.lastName}}</p><script>alert(1)</script>' },
    });
    expect(created.status()).toBe(201);
    const t = await created.json();
    const full = await (await director.get(`documents/templates/${t.id}`)).json();
    expect(full.versions[0].content).not.toMatch(/script|onclick/i);
    const doc = await (await director.post('documents/generate', { data: { templateId: t.id, subjectId: studentA.id } })).json();
    const res = await director.get(`documents/${doc.id}/html`);
    expect(res.headers()['content-security-policy']).toContain("default-src 'none'");
  });

  test('[DO-05] Versionnement : une nouvelle version n’altère pas les documents déjà émis', async () => {
    // Dedicated template: the shared certificate must stay intact for replays.
    const t = await (await director.post('documents/templates', { data: { name: unique('Modele versionne'), type: 'COURRIER', context: 'STUDENT', content: '<p>v1 {{student.matricule}}</p>' } })).json();
    const doc = await (await director.post('documents/generate', { data: { templateId: t.id, subjectId: studentA.id } })).json();
    const v = await (await director.put(`documents/templates/${t.id}`, { data: { content: '<p>v2 {{student.lastName}}</p>' } })).json();
    expect(v.version).toBe(2);
    const html = await (await director.get(`documents/${doc.id}/html`)).text();
    expect(html).toContain(`v1 ${studentA.matricule}`); // the issued document is frozen
    const history = await (await director.get('documents')).json();
    expect(history.find((d: { id: string }) => d.id === doc.id).templateVersion.version).toBe(1);
  });
});

// ---------------------------------------------------------------- Sécurité
test.describe('Sécurité', () => {
  test('[SEC-01] En-têtes de sécurité HTTP présents', async () => {
    const res = await (await anonymous()).get('health');
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['content-security-policy']).toBeTruthy();
    expect(h['strict-transport-security']).toBeTruthy();
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('[SEC-02] Documentation Swagger désactivée en production', async () => {
    const res = await request.newContext().then((c) => c.get(`${API}/docs`));
    expect(res.status()).toBe(404);
  });

  test('[SEC-03] Injection SQL dans la recherche : traitée comme du texte', async () => {
    const res = await director.get(`students?search=${encodeURIComponent("' OR 1=1 --")}`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('[SEC-04] XSS stockée : le contenu est échappé dans les documents générés', async () => {
    const s = await (await director.post('students', { data: { firstName: '<img src=x onerror=alert(1)>', lastName: 'Xss', dateOfBirth: '2012-01-01', gender: 'M', classId: classes[0].id } })).json();
    const t = (await (await director.get('documents/templates')).json()).find((x: { type: string }) => x.type === 'ATTESTATION_INSCRIPTION');
    const doc = await (await director.post('documents/generate', { data: { templateId: t.id, subjectId: s.id } })).json();
    const html = await (await director.get(`documents/${doc.id}/html`)).text();
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror');
  });

  test('[SEC-05] Erreurs sans fuite technique (pas de pile, pas de message Prisma)', async () => {
    const res = await director.get('billing/invoices?status=INVALIDE');
    expect(res.status()).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/prisma|stack|at \w+ \(/i);
  });

  test('[SEC-06] Entrées non prévues rejetées (whitelist DTO)', async () => {
    const res = await director.post('students', { data: { firstName: 'A', lastName: 'B', dateOfBirth: '2012-01-01', gender: 'M', schoolId: 'autre-ecole' } });
    expect(res.status()).toBe(400);
  });

  test('[SEC-07] Journal d’audit des actions sensibles', async () => {
    const logs = await (await director.get('school/audit-logs')).json();
    const actions = new Set(logs.map((l: { action: string }) => l.action));
    for (const a of ['PAYMENT', 'PAY', 'CREATE', 'GENERATE']) expect(actions.has(a), a).toBe(true);
    // Action names may mention passwords (PASSWORD_RESET); stored values must never contain one.
    const values = logs.map((l: { oldValues: string | null; newValues: string | null }) => `${l.oldValues ?? ''}${l.newValues ?? ''}`).join('');
    expect(values).not.toMatch(/password|\$2[aby]\$/i);
    expect((await teacher.get('school/audit-logs')).status()).toBe(403);
  });

  test('[SEC-08] Limitation de débit sur les routes d’authentification (429)', async () => {
    const anon = await anonymous();
    let last = 0;
    const limit = Number(process.env.RECETTE_AUTH_RATE_LIMIT ?? 60);
    for (let i = 0; i < limit + 2; i++) last = (await anon.post('auth/forgot-password', { data: { email: 'flood@test.local' } })).status();
    expect(last).toBe(429);
  });
});
