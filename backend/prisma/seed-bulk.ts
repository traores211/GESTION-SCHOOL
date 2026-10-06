/**
 * Volume demo data: several test schools and thousands of records, so dashboards, tables and
 * pagination can be judged on realistic numbers.
 *
 *   docker compose exec backend npx ts-node prisma/seed-bulk.ts
 *
 * Run after the regular seed (it reuses the "Demo School Group" organisation and DEMO-001).
 * Idempotent: a school that already holds bulk data is skipped. Deterministic: the same run
 * always produces the same names, grades and payments (seeded random generator).
 *
 * What it creates
 *  - DEMO-001 (Abidjan): every level from 6ème to Terminale, 2 sections each (~460 more pupils).
 *  - LMP-BKE  Lycée Moderne Les Palmiers, Bouaké          (collège + lycée, 18 classes)
 *  - CSP-YAM  Collège Saint-Paul, Yamoussoukro           (collège, 12 classes)
 *  - EPC-SPD  École Primaire Les Cocotiers, San-Pédro     (primaire, 12 classes)
 *  - ITN-KGO  Institut Technique du Nord, Korhogo         (separate organisation: tenant isolation)
 *  For each school: director, secretary, accountant and teachers (password demo123), subjects,
 *  classes, pupils + parents, attendance for every school day, grades for the three terms,
 *  three tuition instalments with Mobile Money / cash / bank payments, admissions, transport,
 *  monthly payslips.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------- deterministic randomness

let rngState = 20251015;
function rand() {
  // mulberry32
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const int = (min: number, max: number) => Math.floor(between(min, max + 1));
/** Normal-ish value (sum of uniforms). */
const gauss = (mean: number, sd: number) => mean + ((rand() + rand() + rand() + rand() - 2) / 0.816) * sd;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const id = () => randomUUID();

function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

async function inBatches<T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

// ---------------------------------------------------------------- Ivorian names

const FIRST_M = [
  'Kouadio', 'Konan', 'Yao', 'Koffi', 'Kouakou', 'Kouamé', 'Ibrahim', 'Moussa', 'Seydou', 'Adama', 'Lassina', 'Souleymane',
  'Mamadou', 'Drissa', 'Bakary', 'Aboubacar', 'Jean-Marc', 'Serge', 'Hervé', 'Franck', 'Wilfried', 'Didier', 'Yannick',
  'Arnaud', 'Emmanuel', 'Christian', 'Fabrice', 'Junior', 'Ange', 'Cédric', 'Ismaël', 'Karim', 'Ousmane', 'Siaka', 'Brice',
  'Ghislain', 'Patrice', 'Romaric', 'Sylvain', 'Daouda', 'Abdoulaye', 'Mohamed', 'Issouf', 'Zié', 'Tiémoko', 'Noël',
];
const FIRST_F = [
  'Aya', 'Adjoua', 'Affoué', 'Akissi', 'Amenan', 'Amoin', 'Ahou', 'Aminata', 'Fatou', 'Mariam', 'Awa', 'Kadiatou',
  'Salimata', 'Fanta', 'Rokia', 'Djeneba', 'Grâce', 'Prisca', 'Chantal', 'Solange', 'Laetitia', 'Nadège', 'Odette',
  'Marie-Claire', 'Estelle', 'Sandrine', 'Bénédicte', 'Raïssa', 'Inès', 'Larissa', 'Murielle', 'Clarisse', 'Edwige',
  'Pélagie', 'Josiane', 'Ruth', 'Esther', 'Mireille', 'Nathalie', 'Victoire', 'Assita', 'Massandjé', 'Tenin', 'Ramatou',
];
const LAST = [
  'Kouassi', 'Kouamé', 'Koffi', 'Yao', 'Konan', "N'Guessan", 'Kouadio', 'Bamba', 'Traoré', 'Ouattara', 'Coulibaly',
  'Koné', 'Diabaté', 'Touré', 'Silué', 'Soro', 'Yéo', 'Doumbia', 'Diallo', 'Cissé', 'Fofana', 'Sanogo', 'Camara',
  'Kra', 'Aka', 'Assi', 'Gnamien', 'Zadi', 'Gbagbo', 'Bédié', 'Djédjé', 'Gnahoré', 'Tapé', 'Séka', 'Brou', 'Amani',
  'Angoran', 'Ehui', 'Kacou', 'Loukou', 'Mobio', 'Okou', 'Tano', 'Yapi', 'Dosso', 'Kéita', 'Sylla', 'Dembélé', 'Konaté',
  'Beugré', 'Guéi', 'Dagnogo', 'Tuo', 'Koulibaly', 'Ballo', 'Sangaré', 'Méité', 'Bakayoko', 'Kamagaté', 'Diomandé',
];
const PROFESSIONS = [
  'Commerçant(e)', 'Enseignant(e)', 'Fonctionnaire', 'Infirmier(e)', 'Planteur', 'Chauffeur', 'Comptable', 'Couturière',
  'Mécanicien', 'Ingénieur', 'Médecin', 'Agent de banque', 'Entrepreneur', 'Policier', 'Ménagère', 'Transporteur',
];

function person(gender: 'M' | 'F') {
  return { firstName: pick(gender === 'M' ? FIRST_M : FIRST_F), lastName: pick(LAST) };
}

function slug(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------- school calendar 2025-2026

const YEAR_START = new Date('2025-09-15');
const YEAR_END = new Date('2026-06-30');
const TERMS = [
  { name: 'Trimestre 1', order: 1, startDate: new Date('2025-09-15'), endDate: new Date('2025-12-19') },
  { name: 'Trimestre 2', order: 2, startDate: new Date('2026-01-05'), endDate: new Date('2026-03-27') },
  { name: 'Trimestre 3', order: 3, startDate: new Date('2026-04-06'), endDate: new Date('2026-06-30') },
];
// Lessons resumed on 14 September 2026; the calendar keeps recording against 2025-2026 until a new year is opened.
const RENTREE_2026 = new Date('2026-09-14');

function schoolDays(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inTerm = (d: Date) => TERMS.some((t) => d >= t.startDate && d <= t.endDate) || (d >= RENTREE_2026 && d <= today);
  for (let d = new Date(YEAR_START); d <= today; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    if (!inTerm(d)) continue;
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    days.push(day);
  }
  return days;
}

// ---------------------------------------------------------------- level catalogues

type Cycle = 'primaire' | 'college' | 'lycee' | 'technique';
interface LevelDef {
  level: string;
  prefix: string; // class code prefix
  cycle: Cycle;
  fee: number; // annual tuition, FCFA
}
const PRIMAIRE: LevelDef[] = ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'].map((l) => ({ level: l, prefix: l, cycle: 'primaire', fee: 180000 }));
const COLLEGE: LevelDef[] = [
  { level: '6ème', prefix: '6', cycle: 'college', fee: 350000 },
  { level: '5ème', prefix: '5', cycle: 'college', fee: 350000 },
  { level: '4ème', prefix: '4', cycle: 'college', fee: 380000 },
  { level: '3ème', prefix: '3', cycle: 'college', fee: 400000 },
];
const LYCEE: LevelDef[] = [
  { level: '2nde', prefix: '2', cycle: 'lycee', fee: 450000 },
  { level: '1ère', prefix: '1', cycle: 'lycee', fee: 480000 },
  { level: 'Terminale', prefix: 'T', cycle: 'lycee', fee: 520000 },
];
const TECHNIQUE: LevelDef[] = [
  { level: 'BT 1', prefix: 'BT1', cycle: 'technique', fee: 420000 },
  { level: 'BT 2', prefix: 'BT2', cycle: 'technique', fee: 420000 },
  { level: 'BTS 1', prefix: 'BTS1', cycle: 'technique', fee: 650000 },
  { level: 'BTS 2', prefix: 'BTS2', cycle: 'technique', fee: 650000 },
];

/** Usual age on 1 January 2025 for each level. */
const AGE_BY_LEVEL: Record<string, number> = Object.fromEntries(
  [...PRIMAIRE, ...COLLEGE, ...LYCEE].map((l, i) => [l.level, 6 + i]).concat(TECHNIQUE.map((l, i) => [l.level, 16 + i])),
);

const SUBJECTS: Record<Cycle, { name: string; code: string; coefficient: number; difficulty: number }[]> = {
  primaire: [
    { name: 'Lecture', code: 'LEC', coefficient: 3, difficulty: 0 },
    { name: 'Calcul', code: 'CAL', coefficient: 3, difficulty: 0.5 },
    { name: 'Expression écrite', code: 'EXP', coefficient: 2, difficulty: 0.8 },
    { name: 'Sciences', code: 'SCI', coefficient: 1, difficulty: 0 },
    { name: 'Histoire-Géographie', code: 'HG', coefficient: 1, difficulty: 0.2 },
    { name: 'Éducation civique', code: 'EDHC', coefficient: 1, difficulty: -0.8 },
  ],
  college: [
    { name: 'Mathématiques', code: 'MATH', coefficient: 4, difficulty: 1.4 },
    { name: 'Français', code: 'FR', coefficient: 4, difficulty: 0.6 },
    { name: 'Anglais', code: 'ANG', coefficient: 2, difficulty: 0.3 },
    { name: 'Physique-Chimie', code: 'PC', coefficient: 2, difficulty: 1.1 },
    { name: 'SVT', code: 'SVT', coefficient: 2, difficulty: 0.4 },
    { name: 'Histoire-Géographie', code: 'HG', coefficient: 2, difficulty: 0.2 },
    { name: 'EDHC', code: 'EDHC', coefficient: 1, difficulty: -0.9 },
    { name: 'EPS', code: 'EPS', coefficient: 1, difficulty: -1.6 },
  ],
  lycee: [
    { name: 'Mathématiques', code: 'MATH', coefficient: 5, difficulty: 1.6 },
    { name: 'Français', code: 'FR', coefficient: 3, difficulty: 0.7 },
    { name: 'Anglais', code: 'ANG', coefficient: 2, difficulty: 0.3 },
    { name: 'Physique-Chimie', code: 'PC', coefficient: 4, difficulty: 1.3 },
    { name: 'SVT', code: 'SVT', coefficient: 3, difficulty: 0.5 },
    { name: 'Philosophie', code: 'PHILO', coefficient: 2, difficulty: 0.9 },
    { name: 'Histoire-Géographie', code: 'HG', coefficient: 2, difficulty: 0.2 },
    { name: 'EPS', code: 'EPS', coefficient: 1, difficulty: -1.6 },
  ],
  technique: [
    { name: 'Mathématiques appliquées', code: 'MATHA', coefficient: 3, difficulty: 1.2 },
    { name: 'Électrotechnique', code: 'ELEC', coefficient: 4, difficulty: 0.9 },
    { name: 'Mécanique', code: 'MECA', coefficient: 4, difficulty: 0.8 },
    { name: 'Dessin technique', code: 'DT', coefficient: 3, difficulty: 0.3 },
    { name: 'Français', code: 'FR', coefficient: 2, difficulty: 0.5 },
    { name: 'Anglais technique', code: 'ANGT', coefficient: 1, difficulty: 0.2 },
  ],
};

const PAYMENT_METHODS = [
  ['MOBILE_MONEY_ORANGE', 34],
  ['WAVE', 22],
  ['MOBILE_MONEY_MTN', 17],
  ['CASH', 13],
  ['MOBILE_MONEY_MOOV', 7],
  ['BANK_TRANSFER', 6],
  ['CHEQUE', 1],
] as const;

const ADMISSION_STATUSES = [
  ['CANDIDATURE', 14],
  ['DOSSIER_INCOMPLET', 9],
  ['DOSSIER_COMPLET', 8],
  ['ETUDE', 6],
  ['TEST', 5],
  ['ENTRETIEN', 4],
  ['ADMIS', 7],
  ['INSCRIPTION', 6],
  ['CONFIRME', 26],
  ['REJETE', 9],
] as const;

// ---------------------------------------------------------------- one school

interface SchoolPlan {
  code: string;
  name: string;
  city: string;
  address: string;
  organisationId: string;
  levels: LevelDef[];
  sections: string[]; // "A", "B"…
  pupilsPerClass: [number, number];
  capacity: number;
  /** Shifts the whole school: a better school has higher grades, attendance and payment discipline. */
  quality: number;
  tagline: string;
  description: string;
  foundedYear: number;
  matriculePrefix: string;
  skipClassCodes?: Set<string>;
  existing?: { schoolId: string; academicYearId: string };
}

async function seedSchool(plan: SchoolPlan, passwordHash: string) {
  const started = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ---------- school + year + terms ----------
  let schoolId: string;
  let academicYearId: string;
  if (plan.existing) {
    schoolId = plan.existing.schoolId;
    academicYearId = plan.existing.academicYearId;
  } else {
    const school = await prisma.school.create({
      data: {
        organisationId: plan.organisationId,
        name: plan.name,
        code: plan.code,
        email: `contact@${plan.code.toLowerCase()}.local`,
        phone: `+225 27 ${int(20, 39)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
        city: plan.city,
        address: plan.address,
        directeur: '',
        currentAcademicYear: '2025-2026',
        maxStudentsPerClass: plan.capacity,
        tagline: plan.tagline,
        description: plan.description,
        foundedYear: plan.foundedYear,
      },
    });
    schoolId = school.id;
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: '2025-2026',
        startDate: YEAR_START,
        endDate: YEAR_END,
        isCurrent: true,
        terms: { create: TERMS },
      },
    });
    academicYearId = year.id;
  }
  const terms = await prisma.term.findMany({ where: { academicYearId }, orderBy: { order: 'asc' } });

  // ---------- staff ----------
  const domain = `${plan.code.toLowerCase()}.local`;
  const staffUsers: Prisma.UserCreateManyInput[] = [];
  const staffMembers: Prisma.StaffMemberCreateManyInput[] = [];
  const addStaff = (role: 'DIRECTOR' | 'SECRETARY' | 'COMPTABLE' | 'ENSEIGNANT', email: string, position: string, salary: number, department?: string) => {
    const gender = rand() < 0.45 ? 'F' : 'M';
    const p = person(gender);
    const userId = id();
    const staffId = id();
    staffUsers.push({ id: userId, email, password: passwordHash, firstName: p.firstName, lastName: p.lastName, role, schoolId, phone: `+225 07 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}` });
    staffMembers.push({ id: staffId, userId, position, department, hireDate: new Date(2015 + int(0, 10), int(0, 11), 1), baseSalary: salary });
    return { staffId, name: `${p.firstName} ${p.lastName}` };
  };

  if (!plan.existing) {
    const director = addStaff('DIRECTOR', `directeur@${domain}`, "Directeur de l'établissement", 650000, 'Direction');
    addStaff('SECRETARY', `secretariat@${domain}`, 'Secrétaire', 190000, 'Administration');
    addStaff('COMPTABLE', `comptable@${domain}`, 'Comptable', 260000, 'Finances');
    await prisma.school.update({ where: { id: schoolId }, data: { directeur: director.name } });
  }

  const cycles = [...new Set(plan.levels.map((l) => l.cycle))];
  // Subjects of the school (union of its cycles), keyed by code.
  const subjectDefs = new Map<string, (typeof SUBJECTS)[Cycle][number]>();
  for (const c of cycles) for (const s of SUBJECTS[c]) if (!subjectDefs.has(s.code)) subjectDefs.set(s.code, s);

  const subjectIds = new Map<string, string>();
  for (const s of subjectDefs.values()) {
    const subject = await prisma.subject.upsert({
      where: { schoolId_code: { schoolId, code: s.code } },
      update: {},
      create: { schoolId, name: s.name, code: s.code, coefficient: s.coefficient },
    });
    subjectIds.set(s.code, subject.id);
  }

  // Two teachers per subject per 6 classes, at least one.
  const classCount = plan.levels.length * plan.sections.length;
  const teachersBySubject = new Map<string, string[]>();
  let teacherSeq = 1;
  for (const s of subjectDefs.values()) {
    const n = Math.max(1, Math.round(classCount / 6));
    const list: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = addStaff('ENSEIGNANT', `prof${String(teacherSeq).padStart(2, '0')}@${domain}`, `Professeur de ${s.name}`, int(22, 34) * 10000, s.name);
      teacherSeq += 1;
      list.push(t.staffId);
    }
    teachersBySubject.set(s.code, list);
  }
  await prisma.user.createMany({ data: staffUsers });
  await prisma.staffMember.createMany({ data: staffMembers });

  // ---------- classes ----------
  interface ClassRow { id: string; code: string; level: LevelDef; difficulty: number }
  const classes: ClassRow[] = [];
  const classRows: Prisma.ClassCreateManyInput[] = [];
  const classSubjectRows: Prisma.ClassSubjectCreateManyInput[] = [];
  let classIdx = 0;
  for (const level of plan.levels) {
    for (const section of plan.sections) {
      const code = `${level.prefix}${section}`;
      if (plan.skipClassCodes?.has(code)) continue;
      const classId = id();
      const subjectsOfLevel = SUBJECTS[level.cycle];
      const mainTeacher = pick(teachersBySubject.get(subjectsOfLevel[0].code)!);
      classRows.push({
        id: classId,
        schoolId,
        academicYearId,
        name: level.cycle === 'primaire' ? `${level.level} ${section}` : `${level.level} ${section}`,
        code,
        level: level.level,
        capacity: plan.capacity,
        teacherId: mainTeacher,
      });
      for (const s of subjectsOfLevel) {
        const list = teachersBySubject.get(s.code)!;
        classSubjectRows.push({ classId, subjectId: subjectIds.get(s.code)!, teacherId: list[classIdx % list.length], coefficient: s.coefficient });
      }
      classes.push({ id: classId, code, level, difficulty: gauss(0, 0.6) });
      classIdx += 1;
    }
  }
  await prisma.class.createMany({ data: classRows });
  await prisma.classSubject.createMany({ data: classSubjectRows });

  // ---------- pupils, parents, enrollments ----------
  interface Pupil { id: string; classId: string; level: LevelDef; ability: number; assiduity: number; payer: number; withdrawn: boolean; gender: 'M' | 'F'; firstName: string; lastName: string; matricule: string; classDifficulty: number }
  const pupils: Pupil[] = [];
  const studentRows: Prisma.StudentCreateManyInput[] = [];
  const parentRows: Prisma.ParentCreateManyInput[] = [];
  const parentLinks: [string, string][] = [];
  const enrollmentRows: Prisma.EnrollmentCreateManyInput[] = [];
  let matSeq = 1;
  for (const c of classes) {
    const n = int(plan.pupilsPerClass[0], plan.pupilsPerClass[1]);
    for (let i = 0; i < n; i += 1) {
      const gender: 'M' | 'F' = rand() < 0.49 ? 'F' : 'M';
      const p = person(gender);
      const studentId = id();
      const matricule = `${plan.matriculePrefix}${String(matSeq).padStart(4, '0')}`;
      matSeq += 1;
      // Age matches the level: CP1 ≈ 6 years, 6ème ≈ 11, Terminale ≈ 17.
      const age = AGE_BY_LEVEL[c.level.level] + (rand() < 0.2 ? 1 : 0) + (rand() < 0.05 ? 1 : 0);
      const ability = gauss(plan.quality, 1);
      const withdrawn = rand() < 0.015;
      studentRows.push({
        id: studentId,
        schoolId,
        firstName: p.firstName,
        lastName: p.lastName,
        matricule,
        dateOfBirth: new Date(2025 - age, int(0, 11), int(1, 28)),
        gender,
        nationality: rand() < 0.88 ? 'Ivoirienne' : pick(['Burkinabè', 'Malienne', 'Guinéenne', 'Ghanéenne', 'Sénégalaise']),
        placeOfBirth: rand() < 0.6 ? plan.city : pick(['Abidjan', 'Bouaké', 'Daloa', 'Korhogo', 'San-Pédro', 'Man', 'Gagnoa', 'Abengourou']),
        address: `${plan.city}, quartier ${pick(['Commerce', 'Résidentiel', 'Gare', 'Marché', 'Église', 'Mosquée', 'Lycée', 'Plateau'])}`,
        status: withdrawn ? 'RETIRE' : rand() < 0.06 ? 'REDOUBLANT' : 'INSCRIT',
        allergies: rand() < 0.04 ? pick(['Arachide', 'Pénicilline', 'Lactose', 'Asthme']) : null,
      });
      enrollmentRows.push({
        id: id(),
        classId: c.id,
        studentId,
        enrollmentDate: new Date(YEAR_START.getTime() - int(0, 60) * 86400000),
        withdrawalDate: withdrawn ? new Date('2026-0' + int(1, 4) + '-15') : null,
      });
      const parentGender = rand() < 0.55 ? 'F' : 'M';
      const parentId = id();
      parentRows.push({
        id: parentId,
        firstName: pick(parentGender === 'M' ? FIRST_M : FIRST_F),
        lastName: p.lastName,
        email: `${slug(p.lastName)}.${matricule.toLowerCase()}@parents.${domain}`,
        phone: `+225 0${pick(['1', '5', '7'])} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
        relationship: parentGender === 'F' ? 'Mère' : rand() < 0.85 ? 'Père' : 'Tuteur',
        profession: pick(PROFESSIONS),
        address: `${plan.city}`,
      });
      parentLinks.push([parentId, studentId]);
      pupils.push({
        id: studentId,
        classId: c.id,
        level: c.level,
        ability,
        // Assiduity follows ability a little: the at-risk scatter shows a real (noisy) relation.
        assiduity: clamp(0.93 + 0.025 * ability + gauss(0, 0.03) - (c.level.cycle === 'lycee' ? 0.015 : 0), 0.62, 0.995),
        payer: clamp(gauss(plan.quality * 0.6 + 0.4, 1), -3, 3),
        withdrawn,
        gender,
        firstName: p.firstName,
        lastName: p.lastName,
        matricule,
        classDifficulty: c.difficulty,
      });
    }
  }
  await inBatches(studentRows, 2000, (chunk) => prisma.student.createMany({ data: chunk }));
  await inBatches(enrollmentRows, 4000, (chunk) => prisma.enrollment.createMany({ data: chunk }));
  await inBatches(parentRows, 4000, (chunk) => prisma.parent.createMany({ data: chunk }));
  await inBatches(parentLinks, 4000, async (chunk) => {
    const values = chunk.map(([a, b]) => Prisma.sql`(${a}, ${b})`);
    await prisma.$executeRaw`INSERT INTO "_ParentToStudent" ("A", "B") VALUES ${Prisma.join(values)} ON CONFLICT DO NOTHING`;
  });

  // ---------- attendance: every school day ----------
  const days = schoolDays();
  let attendanceCount = 0;
  const flush: Prisma.AttendanceCreateManyInput[] = [];
  const flushAttendance = async (force = false) => {
    if (flush.length >= 8000 || (force && flush.length)) {
      await prisma.attendance.createMany({ data: flush.splice(0, flush.length), skipDuplicates: true });
    }
  };
  for (const day of days) {
    const month = day.getMonth();
    const weekday = day.getDay();
    // Seasonal dips: rainy season (May-June), Monday and Friday absences, the week before holidays.
    const seasonal = (month === 4 || month === 5 ? -0.025 : 0) + (weekday === 1 ? -0.01 : weekday === 5 ? -0.015 : 0) + (month === 11 && day.getDate() > 14 ? -0.02 : 0);
    for (const p of pupils) {
      if (p.withdrawn) continue;
      const presence = clamp(p.assiduity + seasonal, 0.4, 0.999);
      const r = rand();
      let status: 'PRESENT' | 'RETARD' | 'ABSENT' | 'ABSENCE_JUSTIFIEE' = 'PRESENT';
      if (r > presence) status = rand() < 0.45 ? 'ABSENCE_JUSTIFIEE' : 'ABSENT';
      else if (r > presence - 0.045) status = 'RETARD';
      flush.push({
        id: id(),
        classId: p.classId,
        studentId: p.id,
        schoolId,
        date: day,
        status,
        isJustified: status === 'ABSENCE_JUSTIFIEE',
        reason: status === 'ABSENCE_JUSTIFIEE' ? pick(['Maladie', 'Raison familiale', 'Rendez-vous médical', 'Décès dans la famille']) : null,
      });
      attendanceCount += 1;
      await flushAttendance();
    }
  }
  await flushAttendance(true);

  // ---------- grades: three terms (term 3 finished in June) ----------
  const gradeRows: Prisma.GradeCreateManyInput[] = [];
  for (const p of pupils) {
    const subjectsOfLevel = SUBJECTS[p.level.cycle];
    for (const term of terms) {
      if (term.startDate > today) continue;
      const progress = (term.order - 2) * 0.25; // pupils improve slightly over the year
      for (const s of subjectsOfLevel) {
        for (const [type, coefficient] of [
          ['INTERROGATION', 1],
          ['DEVOIR', 1],
          ['COMPOSITION', 2],
        ] as const) {
          const mean = 11.2 + 1.9 * p.ability - 1.1 * s.difficulty + progress - 0.5 * p.classDifficulty;
          const score = Math.round(clamp(gauss(mean, 2.2), 0, 20) * 4) / 4;
          gradeRows.push({
            id: id(),
            studentId: p.id,
            subjectId: subjectIds.get(s.code)!,
            classId: p.classId,
            termId: term.id,
            type,
            score,
            maxScore: 20,
            coefficient,
            createdAt: new Date(Math.min(term.endDate.getTime(), today.getTime()) - int(0, 40) * 86400000),
          });
        }
      }
    }
  }
  await inBatches(gradeRows, 8000, (chunk) => prisma.grade.createMany({ data: chunk }));

  // ---------- billing: three instalments per pupil ----------
  const instalments = [
    { label: '1re tranche', share: 0.4, due: new Date('2025-10-15') },
    { label: '2e tranche', share: 0.35, due: new Date('2026-01-15') },
    { label: '3e tranche', share: 0.25, due: new Date('2026-04-15') },
  ];
  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const itemRows: Prisma.InvoiceItemCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  let invSeq = 1;
  for (const p of pupils) {
    instalments.forEach((inst, k) => {
      const amount = Math.round((p.level.fee * inst.share) / 500) * 500;
      const invoiceId = id();
      // Probability of paying this instalment, and how late. Later instalments are paid less often.
      const willPay = rand() < clamp(0.83 + 0.07 * p.payer - 0.06 * k - (p.withdrawn ? 0.5 : 0), 0.05, 0.99);
      const partial = willPay && rand() < 0.16;
      const paidAmount = willPay ? (partial ? Math.round((amount * between(0.3, 0.7)) / 500) * 500 : amount) : 0;
      const delayDays = Math.round(clamp(gauss(-8 - 6 * p.payer, 22), -45, 260));
      let paidAt = new Date(inst.due.getTime() + delayDays * 86400000);
      if (paidAt > today) paidAt = new Date(today.getTime() - int(0, 20) * 86400000);
      const status = paidAmount === 0 ? (inst.due < today ? 'OVERDUE' : 'PENDING') : paidAmount >= amount ? 'PAID' : inst.due < today ? 'OVERDUE' : 'PARTIALLY_PAID';
      invoiceRows.push({
        id: invoiceId,
        schoolId,
        studentId: p.id,
        academicYearId,
        reference: `${plan.code}-${String(invSeq).padStart(5, '0')}`,
        label: `Scolarité 2025-2026, ${inst.label}`,
        totalAmount: amount,
        dueDate: inst.due,
        status,
        createdAt: new Date(inst.due.getTime() - 30 * 86400000),
      });
      itemRows.push({ id: id(), invoiceId, label: `Frais de scolarité (${inst.label})`, amount });
      invSeq += 1;
      if (paidAmount > 0) {
        // A partial payment is sometimes split in two receipts.
        const parts = partial || rand() < 0.12 ? [Math.round((paidAmount * 0.5) / 500) * 500, 0] : [paidAmount];
        if (parts.length === 2) parts[1] = paidAmount - parts[0];
        parts.forEach((part, j) => {
          const method = weighted(PAYMENT_METHODS);
          const at = new Date(paidAt.getTime() + j * int(10, 40) * 86400000);
          paymentRows.push({
            id: id(),
            invoiceId,
            studentId: p.id,
            amount: part,
            method,
            status: 'SUCCESS',
            reference: method.startsWith('MOBILE') || method === 'WAVE' ? `TX${int(100000000, 999999999)}` : null,
            paidAt: at > today ? today : at,
          });
        });
      }
    });
  }
  await inBatches(invoiceRows, 5000, (chunk) => prisma.invoice.createMany({ data: chunk }));
  await inBatches(itemRows, 5000, (chunk) => prisma.invoiceItem.createMany({ data: chunk }));
  await inBatches(paymentRows, 5000, (chunk) => prisma.payment.createMany({ data: chunk }));

  // ---------- admissions for the year ----------
  const admissionRows: Prisma.AdmissionCreateManyInput[] = [];
  const admissionCount = Math.round(pupils.length * 0.12);
  for (let i = 0; i < admissionCount; i += 1) {
    const gender = rand() < 0.5 ? 'F' : 'M';
    const p = person(gender);
    admissionRows.push({
      id: id(),
      schoolId,
      academicYearId,
      firstName: p.firstName,
      lastName: p.lastName,
      email: `${slug(p.firstName)}.${slug(p.lastName)}${i}@exemple.ci`,
      phone: `+225 07 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
      gender,
      dateOfBirth: new Date(2014 - int(0, 6), int(0, 11), int(1, 28)),
      status: weighted(ADMISSION_STATUSES),
      submittedAt: new Date(new Date('2025-05-01').getTime() + int(0, 500) * 86400000),
    });
  }
  await prisma.admission.createMany({ data: admissionRows.map((a) => ({ ...a, submittedAt: (a.submittedAt as Date) > today ? today : a.submittedAt })) });

  // ---------- transport ----------
  const quarters = ['Nord', 'Sud', 'Centre', 'Gare', 'Université', 'Marché'];
  const routeCount = Math.max(2, Math.round(pupils.length / 140));
  const subscriptions: Prisma.TransportSubscriptionCreateManyInput[] = [];
  for (let r = 0; r < routeCount; r += 1) {
    const vehicle = await prisma.vehicle.create({
      data: {
        schoolId,
        plateNumber: `CI-${int(1000, 9999)}-${pick(['AB', 'CD', 'EF', 'GH', 'KL'])}${r}`,
        brand: pick(['Toyota Coaster', 'Mercedes Sprinter', 'Nissan Civilian', 'Hyundai County']),
        capacity: pick([22, 28, 30, 35]),
        driverName: `${pick(FIRST_M)} ${pick(LAST)}`,
        driverPhone: `+225 07 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
      },
    });
    const route = await prisma.transportRoute.create({
      data: { schoolId, name: `Circuit ${plan.city} ${quarters[r % quarters.length]}`, vehicleId: vehicle.id, departureTime: `06:${String(10 + r * 5).padStart(2, '0')}`, monthlyFee: pick([12000, 15000, 18000, 20000]) },
    });
    const riders = pupils.filter((p, i) => !p.withdrawn && i % routeCount === r && rand() < 0.16 * (vehicle.capacity / 28));
    for (const p of riders.slice(0, vehicle.capacity + 2)) subscriptions.push({ id: id(), routeId: route.id, studentId: p.id });
  }
  await prisma.transportSubscription.createMany({ data: subscriptions, skipDuplicates: true });

  // ---------- payroll: one payslip per month and staff member ----------
  const months: string[] = [];
  for (let d = new Date(2025, 8, 1); d <= today; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    if (d.getMonth() === 6 || d.getMonth() === 7) continue; // no contract months in July / August
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const staffOfSchool = await prisma.staffMember.findMany({ where: { user: { schoolId } }, select: { id: true, baseSalary: true } });
  const existingSlips = new Set(
    (await prisma.payslip.findMany({ where: { schoolId }, select: { staffMemberId: true, period: true } })).map((s) => `${s.staffMemberId}:${s.period}`),
  );
  const payslipRows: Prisma.PayslipCreateManyInput[] = [];
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  for (const s of staffOfSchool) {
    for (const period of months) {
      if (existingSlips.has(`${s.id}:${period}`)) continue;
      const base = s.baseSalary || 200000;
      const bonuses = rand() < 0.25 ? int(1, 6) * 5000 : 0;
      const deductions = Math.round(base * 0.063); // CNPS employee share
      const isCurrent = period === currentPeriod;
      payslipRows.push({
        id: id(),
        schoolId,
        staffMemberId: s.id,
        period,
        baseSalary: base,
        bonuses,
        deductions,
        netSalary: base + bonuses - deductions,
        status: isCurrent ? (rand() < 0.5 ? 'VALIDATED' : 'DRAFT') : 'PAID',
        paidAt: isCurrent ? null : new Date(`${period}-28`),
      });
    }
  }
  await inBatches(payslipRows, 5000, (chunk) => prisma.payslip.createMany({ data: chunk }));

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `  ${plan.code.padEnd(9)} ${String(classes.length).padStart(3)} classes · ${String(pupils.length).padStart(5)} élèves · ` +
      `${String(attendanceCount).padStart(7)} présences · ${String(gradeRows.length).padStart(6)} notes · ` +
      `${String(invoiceRows.length).padStart(5)} factures · ${String(paymentRows.length).padStart(5)} paiements · ${seconds}s`,
  );
  return pupils.length;
}

// ---------------------------------------------------------------- main

async function main() {
  const passwordHash = await bcrypt.hash('demo123', 10);

  const demoOrg = await prisma.organisation.findUnique({ where: { slug: 'demo-school' } });
  const demo = await prisma.school.findUnique({ where: { code: 'DEMO-001' } });
  if (!demoOrg || !demo) throw new Error('Lancez d’abord le seed principal (npm run seed).');
  const demoYear = await prisma.academicYear.findFirst({ where: { schoolId: demo.id, isCurrent: true } });
  if (!demoYear) throw new Error('DEMO-001 n’a pas d’année scolaire en cours.');

  const northOrg = await prisma.organisation.upsert({
    where: { slug: 'reseau-nord' },
    update: { subscriptionPlan: 'ENTERPRISE' },
    create: { name: 'Réseau des Écoles Techniques du Nord', slug: 'reseau-nord', email: 'contact@reseau-nord.local', city: 'Korhogo', subscriptionPlan: 'ENTERPRISE' },
  });

  const plans: SchoolPlan[] = [
    {
      code: 'DEMO-001',
      name: demo.name,
      city: demo.city || 'Abidjan',
      address: demo.address || 'Cocody, Abidjan',
      organisationId: demoOrg.id,
      levels: [...COLLEGE, ...LYCEE],
      sections: ['A', 'B'],
      pupilsPerClass: [30, 44],
      capacity: 45,
      quality: 0.25,
      tagline: '',
      description: '',
      foundedYear: 1998,
      matriculePrefix: '2026-1',
      skipClassCodes: new Set(['6A', '5A', '4A']),
      existing: { schoolId: demo.id, academicYearId: demoYear.id },
    },
    {
      code: 'LMP-BKE',
      name: 'Lycée Moderne Les Palmiers',
      city: 'Bouaké',
      address: 'Quartier Commerce, Bouaké',
      organisationId: demoOrg.id,
      levels: [...COLLEGE, ...LYCEE],
      sections: ['A', 'B', 'C'],
      pupilsPerClass: [38, 52],
      capacity: 55,
      quality: -0.15,
      tagline: 'Former des bacheliers solides au cœur du Gbêkê.',
      description: 'Lycée de référence de la région du Gbêkê, de la 6ème à la Terminale, avec des séries scientifiques et littéraires.',
      foundedYear: 1987,
      matriculePrefix: 'BKE25-',
    },
    {
      code: 'CSP-YAM',
      name: 'Collège Saint-Paul',
      city: 'Yamoussoukro',
      address: 'Quartier Habitat, Yamoussoukro',
      organisationId: demoOrg.id,
      levels: COLLEGE,
      sections: ['A', 'B', 'C'],
      pupilsPerClass: [34, 46],
      capacity: 48,
      quality: 0.55,
      tagline: 'Exigence, discipline et bienveillance depuis 1975.',
      description: 'Collège confessionnel de la capitale politique, réputé pour ses résultats au BEPC.',
      foundedYear: 1975,
      matriculePrefix: 'YAM25-',
    },
    {
      code: 'EPC-SPD',
      name: 'École Primaire Les Cocotiers',
      city: 'San-Pédro',
      address: 'Quartier Bardot, San-Pédro',
      organisationId: demoOrg.id,
      levels: PRIMAIRE,
      sections: ['A', 'B'],
      pupilsPerClass: [32, 45],
      capacity: 45,
      quality: 0.1,
      tagline: 'Les premiers pas vers la réussite, au bord de la mer.',
      description: 'École primaire privée du CP1 au CM2, préparation au CEPE.',
      foundedYear: 2006,
      matriculePrefix: 'SPD25-',
    },
    {
      code: 'ITN-KGO',
      name: 'Institut Technique du Nord',
      city: 'Korhogo',
      address: 'Route de Ferkessédougou, Korhogo',
      organisationId: northOrg.id,
      levels: TECHNIQUE,
      sections: ['A', 'B'],
      pupilsPerClass: [24, 36],
      capacity: 40,
      quality: -0.3,
      tagline: 'Des techniciens qualifiés pour le Nord.',
      description: 'Établissement technique et professionnel : électrotechnique, mécanique, BT et BTS.',
      foundedYear: 2001,
      matriculePrefix: 'KGO25-',
    },
  ];

  console.log('Données de volume :');
  let total = 0;
  for (const plan of plans) {
    const alreadyBulk = plan.existing
      ? await prisma.class.findFirst({ where: { schoolId: plan.existing.schoolId, code: '3A' } })
      : await prisma.school.findUnique({ where: { code: plan.code } });
    if (alreadyBulk) {
      console.log(`  ${plan.code.padEnd(9)} déjà rempli, ignoré`);
      continue;
    }
    total += await seedSchool(plan, passwordHash);
  }

  console.log(`\n${total} élèves ajoutés.`);
  console.log('Comptes des écoles de test (mot de passe demo123) :');
  for (const p of plans.filter((x) => !x.existing)) {
    console.log(`  ${p.name.padEnd(32)} directeur@${p.code.toLowerCase()}.local · comptable@${p.code.toLowerCase()}.local · secretariat@${p.code.toLowerCase()}.local`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
