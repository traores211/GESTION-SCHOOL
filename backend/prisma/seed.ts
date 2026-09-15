import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hash(pwd: string) {
  return bcrypt.hash(pwd, 10);
}

function pastWeekdays(count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
}

async function main() {
  // ---------- Organisation / School ----------
  const org = await prisma.organisation.upsert({
    where: { slug: 'demo-school' },
    update: {},
    create: { name: 'Demo School Group', slug: 'demo-school', email: 'contact@school.local' },
  });

  const schoolMarketing = {
    tagline: "Révéler le potentiel de chaque élève, de la 6ème à la Terminale.",
    description:
      "Fondé sur l'excellence académique et l'épanouissement personnel, le Groupe Scolaire La Réussite accompagne " +
      "ses élèves avec des enseignants qualifiés, des infrastructures modernes et un encadrement personnalisé. " +
      "Notre établissement combine rigueur pédagogique et ouverture sur le monde pour préparer les leaders de demain.",
    website: 'https://www.la-reussite-demo.ci',
    phone: '+225 27 22 00 00 00',
  };

  const school = await prisma.school.upsert({
    where: { code: 'DEMO-001' },
    update: {
      name: 'Groupe Scolaire La Réussite',
      city: 'Abidjan',
      address: 'Cocody, Abidjan',
      ...schoolMarketing,
    },
    create: {
      organisationId: org.id,
      name: 'Groupe Scolaire La Réussite',
      code: 'DEMO-001',
      email: 'ecole@school.local',
      city: 'Abidjan',
      address: 'Cocody, Abidjan',
      ...schoolMarketing,
    },
  });

  // ---------- Academic year + terms ----------
  let year = await prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true } });
  if (!year) {
    year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: '2025-2026',
        startDate: new Date('2025-09-15'),
        endDate: new Date('2026-06-30'),
        isCurrent: true,
        terms: {
          create: [
            { name: 'Trimestre 1', order: 1, startDate: new Date('2025-09-15'), endDate: new Date('2025-12-19') },
            { name: 'Trimestre 2', order: 2, startDate: new Date('2026-01-05'), endDate: new Date('2026-03-27') },
            { name: 'Trimestre 3', order: 3, startDate: new Date('2026-04-06'), endDate: new Date('2026-06-30') },
          ],
        },
      },
    });
  }
  const term1 = await prisma.term.findFirstOrThrow({ where: { academicYearId: year.id, order: 1 } });
  const term2 = await prisma.term.findFirstOrThrow({ where: { academicYearId: year.id, order: 2 } });

  // ---------- Admin ----------
  await prisma.user.upsert({
    where: { email: 'admin@school.local' },
    update: { password: await hash('admin123'), status: 'ACTIVE' },
    create: {
      email: 'admin@school.local',
      password: await hash('admin123'),
      firstName: 'Admin',
      lastName: 'Système',
      role: 'SUPER_ADMIN',
      schoolId: school.id,
    },
  });

  // ---------- Teachers ----------
  const teacherDefs = [
    { email: 'k.kouassi@school.local', firstName: 'Kouassi', lastName: 'Aya', position: 'Professeur de Mathématiques', baseSalary: 285000 },
    { email: 'y.diallo@school.local', firstName: 'Diallo', lastName: 'Yacouba', position: 'Professeur de Français', baseSalary: 270000 },
    { email: 'a.kone@school.local', firstName: 'Koné', lastName: 'Aminata', position: "Professeur d'Anglais", baseSalary: 260000 },
  ];
  const teachers: Record<string, string> = {};
  for (const t of teacherDefs) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email,
        password: await hash('teach123'),
        firstName: t.firstName,
        lastName: t.lastName,
        role: 'ENSEIGNANT',
        schoolId: school.id,
        staffMember: { create: { position: t.position, hireDate: new Date('2023-09-01'), baseSalary: t.baseSalary } },
      },
      include: { staffMember: true },
    });
    teachers[t.email] = user.staffMember!.id;
    await prisma.staffMember.update({ where: { id: user.staffMember!.id }, data: { baseSalary: t.baseSalary } });
  }

  // ---------- Secretary + Accountant ----------
  const secretaryUser = await prisma.user.upsert({
    where: { email: 'secretaire@school.local' },
    update: {},
    create: {
      email: 'secretaire@school.local',
      password: await hash('secret123'),
      firstName: 'Aminata',
      lastName: 'Traoré',
      role: 'SECRETARY',
      schoolId: school.id,
      staffMember: { create: { position: 'Secrétaire', hireDate: new Date('2024-01-10'), baseSalary: 180000 } },
    },
    include: { staffMember: true },
  });
  if (secretaryUser.staffMember) {
    await prisma.staffMember.update({ where: { id: secretaryUser.staffMember.id }, data: { baseSalary: 180000 } });
  }

  const comptableUser = await prisma.user.upsert({
    where: { email: 'comptable@school.local' },
    update: {},
    create: {
      email: 'comptable@school.local',
      password: await hash('compta123'),
      firstName: 'Jean-Baptiste',
      lastName: 'Kacou',
      role: 'COMPTABLE',
      schoolId: school.id,
      staffMember: { create: { position: 'Comptable', hireDate: new Date('2024-02-01'), baseSalary: 220000 } },
    },
    include: { staffMember: true },
  });
  if (comptableUser.staffMember) {
    await prisma.staffMember.update({ where: { id: comptableUser.staffMember.id }, data: { baseSalary: 220000 } });
  }

  // ---------- Subjects ----------
  const subjectDefs = [
    { name: 'Mathématiques', code: 'MATH', coefficient: 4 },
    { name: 'Français', code: 'FR', coefficient: 4 },
    { name: 'Anglais', code: 'ANG', coefficient: 2 },
    { name: 'SVT', code: 'SVT', coefficient: 2 },
    { name: 'Histoire-Géographie', code: 'HG', coefficient: 2 },
    { name: 'EPS', code: 'EPS', coefficient: 1 },
  ];
  const subjects: Record<string, { id: string; coefficient: number }> = {};
  for (const s of subjectDefs) {
    const subject = await prisma.subject.upsert({
      where: { schoolId_code: { schoolId: school.id, code: s.code } },
      update: {},
      create: { ...s, schoolId: school.id },
    });
    subjects[s.code] = { id: subject.id, coefficient: s.coefficient };
  }

  const subjectTeacher = (code: string) => {
    if (code === 'FR') return teachers['y.diallo@school.local'];
    if (code === 'ANG') return teachers['a.kone@school.local'];
    return teachers['k.kouassi@school.local'];
  };

  // ---------- Classes ----------
  const classDefs = [
    { name: '6ème A', code: '6A', level: '6ème' },
    { name: '5ème A', code: '5A', level: '5ème' },
    { name: '4ème A', code: '4A', level: '4ème' },
  ];
  const classes: Record<string, string> = {};
  for (const c of classDefs) {
    const klass = await prisma.class.upsert({
      where: { academicYearId_code: { academicYearId: year.id, code: c.code } },
      update: {},
      create: { ...c, schoolId: school.id, academicYearId: year.id, teacherId: teachers['k.kouassi@school.local'] },
    });
    classes[c.code] = klass.id;

    for (const code of Object.keys(subjects)) {
      await prisma.classSubject.upsert({
        where: { classId_subjectId: { classId: klass.id, subjectId: subjects[code].id } },
        update: {},
        create: {
          classId: klass.id,
          subjectId: subjects[code].id,
          teacherId: subjectTeacher(code),
          coefficient: subjects[code].coefficient,
        },
      });
    }
  }

  // ---------- Students (6 per class x 3 classes = 18) ----------
  const studentNames = [
    ['Kouamé', 'Prisca', 'F', '6A'],
    ['Bamba', 'Souleymane', 'M', '6A'],
    ["N'Guessan", 'Grace', 'F', '6A'],
    ['Ouattara', 'Ibrahim', 'M', '6A'],
    ['Koffi', 'Marie-Claire', 'F', '6A'],
    ['Zadi', 'Emmanuel', 'M', '6A'],
    ['Diabaté', 'Sekou', 'M', '5A'],
    ['Yao', 'Chantal', 'F', '5A'],
    ['Coulibaly', 'Moussa', 'M', '5A'],
    ['Assi', 'Laetitia', 'F', '5A'],
    ['Traoré', 'Abdoulaye', 'M', '5A'],
    ['Gnamien', 'Solange', 'F', '5A'],
    ['Kouassi', 'Franck', 'M', '4A'],
    ['Doumbia', 'Awa', 'F', '4A'],
    ['Silué', 'Boubacar', 'M', '4A'],
    ['Aka', 'Nadège', 'F', '4A'],
    ['Toure', 'Idrissa', 'M', '4A'],
    ['Kra', 'Odette', 'F', '4A'],
  ] as const;

  const students: { id: string; matricule: string; firstName: string; lastName: string; classCode: string }[] = [];
  let seq = 1;
  for (const [lastName, firstName, gender, classCode] of studentNames) {
    const matricule = `2026-${String(seq).padStart(4, '0')}`;
    const student = await prisma.student.upsert({
      where: { schoolId_matricule: { schoolId: school.id, matricule } },
      update: {},
      create: {
        schoolId: school.id,
        firstName,
        lastName,
        matricule,
        dateOfBirth: new Date(`201${3 + (seq % 4)}-0${1 + (seq % 9)}-15`),
        gender,
        nationality: 'Ivoirienne',
        enrollments: { create: { classId: classes[classCode] } },
      },
    });
    students.push({ id: student.id, matricule, firstName, lastName, classCode });
    seq += 1;
  }

  // ---------- Parents ----------
  const portalParents = [
    { email: 'parent@school.local', firstName: 'Fatou', lastName: 'Kouamé', relationship: 'Mère', studentIdx: 0 },
    { email: 'parent2@school.local', firstName: 'Yves', lastName: 'Diabaté', relationship: 'Père', studentIdx: 6 },
    { email: 'parent3@school.local', firstName: 'Henriette', lastName: 'Kouassi', relationship: 'Mère', studentIdx: 12 },
  ];
  for (const p of portalParents) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: { email: p.email, password: await hash('parent123'), firstName: p.firstName, lastName: p.lastName, role: 'PARENT' },
    });
    await prisma.parent.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: '+225 07 00 00 00 0' + (p.studentIdx + 1),
        relationship: p.relationship,
        students: { connect: [{ id: students[p.studentIdx].id }] },
      },
    });
  }

  const portalStudentIds = new Set(portalParents.map((p) => students[p.studentIdx].id));
  for (const s of students) {
    if (portalStudentIds.has(s.id)) continue;
    const email = `parent.${s.matricule}@school.local`;
    const existing = await prisma.parent.findFirst({ where: { email } });
    if (!existing) {
      await prisma.parent.create({
        data: {
          firstName: s.firstName,
          lastName: s.lastName,
          email,
          phone: '+225 07 ' + String(10000000 + students.indexOf(s)).slice(0, 8),
          relationship: students.indexOf(s) % 2 === 0 ? 'Père' : 'Mère',
          students: { connect: [{ id: s.id }] },
        },
      });
    }
  }

  // ---------- Admissions (every workflow stage represented) ----------
  const admissionDefs = [
    { firstName: 'Fatoumata', lastName: 'Sylla', email: 'f.sylla@example.com', status: 'CANDIDATURE' },
    { firstName: 'Moussa', lastName: 'Keita', email: 'm.keita@example.com', status: 'DOSSIER_INCOMPLET' },
    { firstName: 'Aboubacar', lastName: 'Sanogo', email: 'a.sanogo@example.com', status: 'DOSSIER_COMPLET' },
    { firstName: 'Rokia', lastName: 'Ba', email: 'r.ba@example.com', status: 'ETUDE' },
    { firstName: 'Yannick', lastName: 'Angoran', email: 'y.angoran@example.com', status: 'TEST' },
    { firstName: 'Ange', lastName: 'Brou', email: 'a.brou@example.com', status: 'ENTRETIEN' },
    { firstName: 'Djeneba', lastName: 'Fofana', email: 'd.fofana@example.com', status: 'ADMIS' },
    { firstName: 'Kader', lastName: 'Ouedraogo', email: 'k.ouedraogo@example.com', status: 'REJETE' },
    { firstName: 'Salimata', lastName: 'Camara', email: 's.camara@example.com', status: 'INSCRIPTION' },
    { firstName: 'Bertin', lastName: 'Yao', email: 'b.yao@example.com', status: 'CONFIRME' },
  ] as const;
  for (const a of admissionDefs) {
    const existing = await prisma.admission.findFirst({ where: { schoolId: school.id, email: a.email } });
    if (!existing) {
      await prisma.admission.create({
        data: {
          schoolId: school.id,
          academicYearId: year.id,
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email,
          status: a.status as any,
        },
      });
    }
  }

  // ---------- Attendance (last 5 school days) ----------
  const days = pastWeekdays(5);
  for (const day of days) {
    for (const s of students) {
      const roll = Math.random();
      const status = roll > 0.92 ? 'ABSENT' : roll > 0.85 ? 'RETARD' : roll > 0.8 ? 'ABSENCE_JUSTIFIEE' : 'PRESENT';
      await prisma.attendance.upsert({
        where: { classId_studentId_date: { classId: classes[s.classCode], studentId: s.id, date: day } },
        update: {},
        create: { classId: classes[s.classCode], studentId: s.id, schoolId: school.id, date: day, status: status as any },
      });
    }
  }

  // ---------- Grades (all subjects, term 1 + term 2) ----------
  for (const s of students) {
    for (const code of Object.keys(subjects)) {
      for (const [term, types] of [
        [term1, ['DEVOIR', 'COMPOSITION']],
        [term2, ['DEVOIR']],
      ] as const) {
        for (const type of types) {
          const existing = await prisma.grade.findFirst({
            where: { studentId: s.id, subjectId: subjects[code].id, termId: term.id, type },
          });
          if (!existing) {
            await prisma.grade.create({
              data: {
                studentId: s.id,
                subjectId: subjects[code].id,
                classId: classes[s.classCode],
                termId: term.id,
                type,
                score: Math.round((7 + Math.random() * 13) * 10) / 10,
                maxScore: 20,
                coefficient: type === 'COMPOSITION' ? 2 : 1,
              },
            });
          }
        }
      }
    }
  }

  // ---------- Invoices + Payments (scolarité, varied statuses incl. overdue) ----------
  let invSeq = (await prisma.invoice.count({ where: { schoolId: school.id } })) + 1;
  for (const s of students) {
    const existing = await prisma.invoice.findFirst({ where: { schoolId: school.id, studentId: s.id } });
    if (existing) continue;

    const totalAmount = 450000;
    const idx = students.indexOf(s);
    const overdue = idx % 7 === 0;
    const dueDate = overdue ? new Date('2025-11-30') : new Date('2026-01-31');

    const invoice = await prisma.invoice.create({
      data: {
        schoolId: school.id,
        studentId: s.id,
        academicYearId: year.id,
        reference: `INV-2026-${String(invSeq).padStart(5, '0')}`,
        label: 'Scolarité annuelle 2025-2026',
        totalAmount,
        dueDate,
        items: { create: [{ label: 'Scolarité (3 tranches)', amount: totalAmount }] },
        status: overdue ? 'OVERDUE' : 'PENDING',
      },
    });
    invSeq += 1;

    const paidAmount = overdue ? 0 : idx % 3 === 0 ? totalAmount : idx % 3 === 1 ? 150000 : 0;
    if (paidAmount > 0) {
      const methods = ['MOBILE_MONEY_ORANGE', 'MOBILE_MONEY_MTN', 'CASH', 'BANK_TRANSFER', 'WAVE'] as const;
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          studentId: s.id,
          amount: paidAmount,
          method: methods[idx % methods.length],
          status: 'SUCCESS',
        },
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: paidAmount >= totalAmount ? 'PAID' : 'PARTIALLY_PAID' },
      });
    }
  }

  // ---------- Announcements (public showcase news) ----------
  const announcementDefs = [
    {
      title: 'Rentrée scolaire 2025-2026',
      content: "La rentrée aura lieu le 15 septembre. Les inscriptions pour les places restantes sont encore ouvertes.",
    },
    {
      title: 'Portes ouvertes',
      content: "Venez visiter nos infrastructures et rencontrer notre équipe pédagogique lors de notre journée portes ouvertes.",
    },
    {
      title: 'Résultats aux examens 2025',
      content: 'Nos élèves de Terminale ont obtenu un taux de réussite de 94% au Baccalauréat cette année. Félicitations à tous !',
    },
  ];
  for (const a of announcementDefs) {
    const existing = await prisma.announcement.findFirst({ where: { schoolId: school.id, title: a.title } });
    if (!existing) {
      await prisma.announcement.create({ data: { ...a, schoolId: school.id, isPublished: true } });
    }
  }

  // ---------- Transport ----------
  const vehicle = await prisma.vehicle.upsert({
    where: { schoolId_plateNumber: { schoolId: school.id, plateNumber: 'CI-4521-AB' } },
    update: {},
    create: {
      schoolId: school.id,
      plateNumber: 'CI-4521-AB',
      brand: 'Toyota Coaster',
      capacity: 28,
      driverName: 'Serge Kouadio',
      driverPhone: '+225 07 45 21 00',
    },
  });

  const route = await prisma.transportRoute.findFirst({ where: { schoolId: school.id, name: 'Circuit Cocody' } });
  const finalRoute =
    route ||
    (await prisma.transportRoute.create({
      data: {
        schoolId: school.id,
        name: 'Circuit Cocody',
        vehicleId: vehicle.id,
        departureTime: '06:30',
        monthlyFee: 15000,
      },
    }));

  for (const s of students.slice(0, 4)) {
    await prisma.transportSubscription.upsert({
      where: { routeId_studentId: { routeId: finalRoute.id, studentId: s.id } },
      update: {},
      create: { routeId: finalRoute.id, studentId: s.id },
    });
  }

  console.log('\nSeed complete.');
  console.log(`  ${students.length} élèves répartis sur ${Object.keys(classes).length} classes`);
  console.log('\nAccounts:');
  console.log('  SUPER_ADMIN : admin@school.local / admin123');
  console.log('  ENSEIGNANT  : k.kouassi@school.local / teach123 (Maths, SVT, HG, EPS)');
  console.log('  ENSEIGNANT  : y.diallo@school.local / teach123 (Français)');
  console.log('  ENSEIGNANT  : a.kone@school.local / teach123 (Anglais)');
  console.log('  SECRETARY   : secretaire@school.local / secret123');
  console.log('  COMPTABLE   : comptable@school.local / compta123');
  console.log('  PARENT      : parent@school.local / parent123');
  console.log('  PARENT      : parent2@school.local / parent123');
  console.log('  PARENT      : parent3@school.local / parent123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
