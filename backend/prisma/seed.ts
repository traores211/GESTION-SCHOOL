import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hash(pwd: string) {
  return bcrypt.hash(pwd, 10);
}

async function main() {
  // ---------- Organisation / School ----------
  const org = await prisma.organisation.upsert({
    where: { slug: 'demo-school' },
    update: {},
    create: { name: 'Demo School Group', slug: 'demo-school', email: 'contact@school.local' },
  });

  const school = await prisma.school.upsert({
    where: { code: 'DEMO-001' },
    update: {
      name: 'Groupe Scolaire La Réussite',
      city: 'Abidjan',
      address: 'Cocody, Abidjan',
    },
    create: {
      organisationId: org.id,
      name: 'Groupe Scolaire La Réussite',
      code: 'DEMO-001',
      email: 'ecole@school.local',
      city: 'Abidjan',
      address: 'Cocody, Abidjan',
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

  // ---------- Admin (from earlier step, kept in sync) ----------
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
    { email: 'k.kouassi@school.local', firstName: 'Kouassi', lastName: 'Aya', position: 'Professeur de Mathématiques' },
    { email: 'y.diallo@school.local', firstName: 'Diallo', lastName: 'Yacouba', position: 'Professeur de Français' },
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
        staffMember: { create: { position: t.position, hireDate: new Date('2023-09-01') } },
      },
      include: { staffMember: true },
    });
    teachers[t.email] = user.staffMember!.id;
  }

  // ---------- Secretary ----------
  await prisma.user.upsert({
    where: { email: 'secretaire@school.local' },
    update: {},
    create: {
      email: 'secretaire@school.local',
      password: await hash('secret123'),
      firstName: 'Aminata',
      lastName: 'Traoré',
      role: 'SECRETARY',
      schoolId: school.id,
      staffMember: { create: { position: 'Secrétaire', hireDate: new Date('2024-01-10') } },
    },
  });

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

  // ---------- Classes ----------
  const classDefs = [
    { name: '6ème A', code: '6A', level: '6ème' },
    { name: '5ème A', code: '5A', level: '5ème' },
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
          teacherId: code === 'FR' ? teachers['y.diallo@school.local'] : teachers['k.kouassi@school.local'],
          coefficient: subjects[code].coefficient,
        },
      });
    }
  }

  // ---------- Students ----------
  const studentNames = [
    ['Kouamé', 'Prisca', 'F', '6A'],
    ['Bamba', 'Souleymane', 'M', '6A'],
    ['N\'Guessan', 'Grace', 'F', '6A'],
    ['Ouattara', 'Ibrahim', 'M', '6A'],
    ['Koffi', 'Marie-Claire', 'F', '6A'],
    ['Diabaté', 'Sekou', 'M', '5A'],
    ['Yao', 'Chantal', 'F', '5A'],
    ['Coulibaly', 'Moussa', 'M', '5A'],
    ['Assi', 'Laetitia', 'F', '5A'],
    ['Traoré', 'Abdoulaye', 'M', '5A'],
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
        dateOfBirth: new Date(`201${3 + (seq % 4)}-0${1 + (seq % 9) % 9}-15`),
        gender,
        nationality: "Ivoirienne",
        enrollments: { create: { classId: classes[classCode] } },
      },
    });
    students.push({ id: student.id, matricule, firstName, lastName, classCode });
    seq += 1;
  }

  // ---------- Parents (first student gets a parent with login access) ----------
  const parentUser = await prisma.user.upsert({
    where: { email: 'parent@school.local' },
    update: {},
    create: {
      email: 'parent@school.local',
      password: await hash('parent123'),
      firstName: 'Fatou',
      lastName: 'Kouamé',
      role: 'PARENT',
    },
  });

  await prisma.parent.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: {
      userId: parentUser.id,
      firstName: 'Fatou',
      lastName: 'Kouamé',
      email: 'parent@school.local',
      phone: '+225 07 00 00 00 01',
      relationship: 'Mère',
      students: { connect: [{ id: students[0].id }] },
    },
  });

  for (const s of students.slice(1, 5)) {
    const existing = await prisma.parent.findFirst({ where: { email: `parent.${s.matricule}@school.local` } });
    if (!existing) {
      await prisma.parent.create({
        data: {
          firstName: s.firstName,
          lastName: s.lastName,
          email: `parent.${s.matricule}@school.local`,
          phone: '+225 07 00 00 00 0' + (students.indexOf(s) + 2),
          relationship: 'Père',
          students: { connect: [{ id: s.id }] },
        },
      });
    }
  }

  // ---------- Admissions (sample pipeline) ----------
  const admissionDefs = [
    { firstName: 'Fatoumata', lastName: 'Sylla', email: 'f.sylla@example.com', status: 'CANDIDATURE' },
    { firstName: 'Aboubacar', lastName: 'Sanogo', email: 'a.sanogo@example.com', status: 'DOSSIER_COMPLET' },
    { firstName: 'Ange', lastName: 'Brou', email: 'a.brou@example.com', status: 'ENTRETIEN' },
    { firstName: 'Djeneba', lastName: 'Fofana', email: 'd.fofana@example.com', status: 'ADMIS' },
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

  // ---------- Attendance (today) ----------
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of students) {
    const status = Math.random() > 0.85 ? 'ABSENT' : Math.random() > 0.9 ? 'RETARD' : 'PRESENT';
    await prisma.attendance.upsert({
      where: { classId_studentId_date: { classId: classes[s.classCode], studentId: s.id, date: today } },
      update: {},
      create: { classId: classes[s.classCode], studentId: s.id, schoolId: school.id, date: today, status: status as any },
    });
  }

  // ---------- Grades (term 1, Math + French) ----------
  for (const s of students) {
    for (const code of ['MATH', 'FR']) {
      const existing = await prisma.grade.findFirst({
        where: { studentId: s.id, subjectId: subjects[code].id, termId: term1.id },
      });
      if (!existing) {
        await prisma.grade.create({
          data: {
            studentId: s.id,
            subjectId: subjects[code].id,
            classId: classes[s.classCode],
            termId: term1.id,
            type: 'DEVOIR',
            score: Math.round((8 + Math.random() * 12) * 10) / 10,
            maxScore: 20,
            coefficient: 1,
          },
        });
      }
    }
  }

  // ---------- Invoices + Payments (scolarité) ----------
  let invSeq = 1;
  for (const s of students) {
    const existing = await prisma.invoice.findFirst({ where: { schoolId: school.id, studentId: s.id } });
    if (existing) continue;

    const totalAmount = 450000;
    const invoice = await prisma.invoice.create({
      data: {
        schoolId: school.id,
        studentId: s.id,
        academicYearId: year.id,
        reference: `INV-2026-${String(invSeq).padStart(5, '0')}`,
        label: 'Scolarité annuelle 2025-2026',
        totalAmount,
        dueDate: new Date('2026-01-31'),
        items: { create: [{ label: 'Scolarité (3 tranches)', amount: totalAmount }] },
      },
    });
    invSeq += 1;

    // Simulate varied payment states across students
    const idx = students.indexOf(s);
    const paidAmount = idx % 3 === 0 ? totalAmount : idx % 3 === 1 ? 150000 : 0;
    if (paidAmount > 0) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          studentId: s.id,
          amount: paidAmount,
          method: idx % 2 === 0 ? 'MOBILE_MONEY_ORANGE' : 'CASH',
          status: 'SUCCESS',
        },
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: paidAmount >= totalAmount ? 'PAID' : 'PARTIALLY_PAID' },
      });
    }
  }

  console.log('\nSeed complete. Accounts:');
  console.log('  SUPER_ADMIN : admin@school.local / admin123');
  console.log('  ENSEIGNANT  : k.kouassi@school.local / teach123');
  console.log('  SECRETARY   : secretaire@school.local / secret123');
  console.log('  PARENT      : parent@school.local / parent123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
