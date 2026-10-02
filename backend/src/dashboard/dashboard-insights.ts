import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Detailed dashboard sections, computed alongside the headline analytics:
 * demographics, attendance by weekday, billing schedule vs collections, grade distribution,
 * subject and term averages, at-risk pupils, payroll and (for group roles) the comparison
 * of the organisation's schools.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISATION'];

/** Teaching order of the levels, so charts read from the youngest to the oldest pupils. */
const LEVEL_ORDER = [
  'CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2',
  '6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale',
  'BT 1', 'BT 2', 'BTS 1', 'BTS 2',
];
export const levelRank = (level: string) => {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? 99 : i;
};

const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

const round1 = (v: number) => Math.round(v * 10) / 10;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export interface InsightScope {
  schoolId: string;
  academicYearId: string;
  yearStart: Date;
  from: Date;
  to: Date;
  classId?: string;
  termId: string | null;
  role: string;
  /** Class id → level, for the classes of the year in scope. */
  classLevels: Map<string, string>;
}

export async function computeInsights(prisma: PrismaService, scope: InsightScope) {
  const { schoolId, academicYearId, from, to, classId } = scope;
  const classFilter: Prisma.AttendanceWhereInput = classId ? { classId } : { class: { academicYearId } };
  const gradeScope: Prisma.GradeWhereInput = { class: { schoolId, academicYearId }, ...(classId ? { classId } : {}) };

  const [enrollments, attendanceByStudent, attendanceByDay, grades, classSubjects, terms, invoices, payments, payslips] =
    await Promise.all([
      prisma.enrollment.findMany({
        where: { withdrawalDate: null, class: { schoolId, academicYearId }, ...(classId ? { classId } : {}) },
        select: {
          classId: true,
          student: { select: { id: true, firstName: true, lastName: true, matricule: true, gender: true } },
          class: { select: { name: true, level: true } },
        },
      }),
      // Since the start of the year: a pupil's rate over a few days is too coarse to flag a risk.
      prisma.attendance.groupBy({
        by: ['studentId', 'status'],
        where: { schoolId, ...classFilter, date: { gte: scope.yearStart, lte: to } },
        _count: true,
      }),
      prisma.attendance.groupBy({
        by: ['date', 'classId', 'status'],
        where: { schoolId, ...classFilter, date: { gte: from, lte: to } },
        _count: true,
      }),
      prisma.grade.findMany({
        where: gradeScope,
        select: { studentId: true, subjectId: true, classId: true, termId: true, score: true, maxScore: true, coefficient: true },
      }),
      prisma.classSubject.findMany({
        where: { class: { schoolId, academicYearId }, ...(classId ? { classId } : {}) },
        select: { classId: true, subjectId: true, coefficient: true, subject: { select: { name: true } } },
      }),
      prisma.term.findMany({ where: { academicYearId }, select: { id: true, name: true, order: true }, orderBy: { order: 'asc' } }),
      prisma.invoice.findMany({
        where: {
          schoolId,
          academicYearId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          ...(classId ? { student: { enrollments: { some: { classId } } } } : {}),
        },
        select: { totalAmount: true, dueDate: true },
      }),
      prisma.payment.findMany({
        where: {
          status: 'SUCCESS',
          invoice: {
            schoolId,
            academicYearId,
            ...(classId ? { student: { enrollments: { some: { classId } } } } : {}),
          },
        },
        select: { amount: true, paidAt: true },
      }),
      prisma.payslip.groupBy({
        by: ['period', 'status'],
        where: { schoolId },
        _sum: { netSalary: true },
        _count: true,
      }),
    ]);

  // ---------- Demographics ----------
  const levels = new Map<string, { F: number; M: number }>();
  let girls = 0;
  let boys = 0;
  for (const e of enrollments) {
    const entry = levels.get(e.class.level) || { F: 0, M: 0 };
    if (e.student.gender === 'F') {
      entry.F += 1;
      girls += 1;
    } else {
      entry.M += 1;
      boys += 1;
    }
    levels.set(e.class.level, entry);
  }
  const enrollmentByLevel = [...levels.entries()]
    .sort((a, b) => levelRank(a[0]) - levelRank(b[0]))
    .map(([level, v]) => ({ level, girls: v.F, boys: v.M, total: v.F + v.M }));

  // ---------- Attendance: absence rate by weekday x level ----------
  const cells = new Map<string, { absent: number; total: number }>();
  for (const row of attendanceByDay) {
    const weekday = row.date.getDay(); // 1..5
    if (weekday < 1 || weekday > 5) continue;
    const level = scope.classLevels.get(row.classId) || '—';
    const key = `${level}|${weekday}`;
    const cell = cells.get(key) || { absent: 0, total: 0 };
    cell.total += row._count;
    if (row.status === 'ABSENT' || row.status === 'ABSENCE_JUSTIFIEE') cell.absent += row._count;
    cells.set(key, cell);
  }
  const heatLevels = [...new Set([...cells.keys()].map((k) => k.split('|')[0]))].sort((a, b) => levelRank(a) - levelRank(b));
  const absenceHeatmap = {
    weekdays: WEEKDAYS,
    rows: heatLevels.map((level) => ({
      level,
      values: WEEKDAYS.map((_, i) => {
        const cell = cells.get(`${level}|${i + 1}`);
        return cell && cell.total > 0 ? round1((cell.absent / cell.total) * 100) : null;
      }),
    })),
  };

  // ---------- Per-pupil attendance (for the at-risk view) ----------
  const pupilAttendance = new Map<string, { present: number; total: number; absences: number }>();
  for (const row of attendanceByStudent) {
    const entry = pupilAttendance.get(row.studentId) || { present: 0, total: 0, absences: 0 };
    entry.total += row._count;
    if (row.status === 'PRESENT' || row.status === 'RETARD') entry.present += row._count;
    if (row.status === 'ABSENT') entry.absences += row._count;
    pupilAttendance.set(row.studentId, entry);
  }

  // ---------- Grades ----------
  const subjectCoeff = new Map(classSubjects.map((cs) => [`${cs.classId}:${cs.subjectId}`, cs.coefficient]));
  const subjectNames = new Map(classSubjects.map((cs) => [cs.subjectId, cs.subject.name]));
  const termIds = new Set(terms.map((t) => t.id));
  const selectedTermId = scope.termId;

  // Per term, per pupil: bulletin-style general average (subject averages weighted by subject coefficient).
  type Acc = { weighted: number; weight: number };
  const perTerm = new Map<string, Map<string, { classId: string; subjects: Map<string, Acc> }>>();
  for (const g of grades) {
    if (!termIds.has(g.termId)) continue;
    const pupils = perTerm.get(g.termId) || new Map();
    const pupil = pupils.get(g.studentId) || { classId: g.classId, subjects: new Map<string, Acc>() };
    const acc = pupil.subjects.get(g.subjectId) || { weighted: 0, weight: 0 };
    acc.weighted += (g.score / g.maxScore) * 20 * g.coefficient;
    acc.weight += g.coefficient;
    pupil.subjects.set(g.subjectId, acc);
    pupils.set(g.studentId, pupil);
    perTerm.set(g.termId, pupils);
  }
  const generalAverage = (pupil: { classId: string; subjects: Map<string, Acc> }) => {
    let sum = 0;
    let coeff = 0;
    for (const [subjectId, acc] of pupil.subjects) {
      if (acc.weight === 0) continue;
      const c = subjectCoeff.get(`${pupil.classId}:${subjectId}`) ?? 1;
      sum += (acc.weighted / acc.weight) * c;
      coeff += c;
    }
    return coeff > 0 ? sum / coeff : null;
  };

  // Distribution of general averages for the selected term (bins of one point).
  const selected = selectedTermId ? perTerm.get(selectedTermId) : undefined;
  const pupilAverages = new Map<string, number>();
  if (selected) {
    for (const [studentId, pupil] of selected) {
      const avg = generalAverage(pupil);
      if (avg !== null) pupilAverages.set(studentId, avg);
    }
  }
  const bins = Array.from({ length: 20 }, (_, i) => ({ from: i, to: i + 1, count: 0 }));
  for (const avg of pupilAverages.values()) bins[Math.min(19, Math.floor(avg))].count += 1;
  const averages = [...pupilAverages.values()].sort((a, b) => a - b);
  const quantile = (q: number) => (averages.length ? round1(averages[Math.floor(q * (averages.length - 1))]) : null);
  const gradeDistribution = {
    bins,
    graded: averages.length,
    median: quantile(0.5),
    q1: quantile(0.25),
    q3: quantile(0.75),
    passRate: averages.length ? round1((averages.filter((a) => a >= 10).length / averages.length) * 100) : null,
    honours: averages.filter((a) => a >= 14).length, // tableau d'honneur
  };

  // Average per subject for the selected term.
  const subjectTotals = new Map<string, { sum: number; n: number; below: number }>();
  if (selected) {
    for (const pupil of selected.values()) {
      for (const [subjectId, acc] of pupil.subjects) {
        if (acc.weight === 0) continue;
        const avg = acc.weighted / acc.weight;
        const t = subjectTotals.get(subjectId) || { sum: 0, n: 0, below: 0 };
        t.sum += avg;
        t.n += 1;
        if (avg < 10) t.below += 1;
        subjectTotals.set(subjectId, t);
      }
    }
  }
  const subjectAverages = [...subjectTotals.entries()]
    .map(([subjectId, t]) => ({
      subject: subjectNames.get(subjectId) || '—',
      average: round1(t.sum / t.n),
      belowTen: round1((t.below / t.n) * 100),
      graded: t.n,
    }))
    .sort((a, b) => b.average - a.average);

  // Progress: mean general average per level, term by term.
  const termProgress = [...new Set([...scope.classLevels.values()])]
    .sort((a, b) => levelRank(a) - levelRank(b))
    .map((level) => {
      const row: Record<string, number | string | null> = { level };
      for (const term of terms) {
        const pupils = perTerm.get(term.id);
        const values: number[] = [];
        if (pupils) {
          for (const pupil of pupils.values()) {
            if (scope.classLevels.get(pupil.classId) !== level) continue;
            const avg = generalAverage(pupil);
            if (avg !== null) values.push(avg);
          }
        }
        row[`t${term.order}`] = values.length ? round1(values.reduce((s, v) => s + v, 0) / values.length) : null;
      }
      return row;
    })
    .filter((row) => terms.some((t) => row[`t${t.order}`] !== null));

  // ---------- At-risk pupils: attendance vs general average ----------
  const pupilsById = new Map(enrollments.map((e) => [e.student.id, e]));
  const atRiskPoints = [...pupilAverages.entries()]
    .map(([studentId, average]) => {
      const att = pupilAttendance.get(studentId);
      const e = pupilsById.get(studentId);
      if (!att || att.total === 0 || !e) return null;
      return {
        studentId,
        name: `${e.student.lastName} ${e.student.firstName}`,
        matricule: e.student.matricule,
        className: e.class.name,
        average: round1(average),
        attendance: round1((att.present / att.total) * 100),
        absences: att.absences,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const AT_RISK = { average: 10, attendance: 85 };
  const atRisk = {
    thresholds: AT_RISK,
    points: atRiskPoints.length > 1500 ? atRiskPoints.filter((_, i) => i % Math.ceil(atRiskPoints.length / 1500) === 0) : atRiskPoints,
    total: atRiskPoints.length,
    count: atRiskPoints.filter((p) => p.average < AT_RISK.average && p.attendance < AT_RISK.attendance).length,
    list: atRiskPoints
      .filter((p) => p.average < AT_RISK.average || p.attendance < AT_RISK.attendance)
      .sort((a, b) => a.average / 20 + a.attendance / 100 - (b.average / 20 + b.attendance / 100))
      .slice(0, 8),
  };

  // ---------- Billing schedule vs collections, by month of the school year ----------
  const months = new Map<string, { due: number; collected: number }>();
  const firstMonth = new Date(scope.yearStart.getFullYear(), scope.yearStart.getMonth(), 1);
  for (let d = new Date(firstMonth); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.set(monthKey(d), { due: 0, collected: 0 });
  }
  for (const inv of invoices) {
    const m = months.get(monthKey(inv.dueDate));
    if (m) m.due += inv.totalAmount;
  }
  for (const p of payments) {
    const m = months.get(monthKey(p.paidAt));
    if (m) m.collected += p.amount;
  }
  let dueCumul = 0;
  let collectedCumul = 0;
  const billingSchedule = [...months.entries()].map(([month, v]) => {
    dueCumul += v.due;
    collectedCumul += v.collected;
    return { month, due: v.due, collected: v.collected, dueCumul, collectedCumul };
  });

  // ---------- Payroll: last 12 months ----------
  const payrollMonths = new Map<string, { paid: number; pending: number; payslips: number }>();
  for (const row of payslips) {
    const entry = payrollMonths.get(row.period) || { paid: 0, pending: 0, payslips: 0 };
    if (row.status === 'PAID') entry.paid += row._sum.netSalary || 0;
    else entry.pending += row._sum.netSalary || 0;
    entry.payslips += row._count;
    payrollMonths.set(row.period, entry);
  }
  const payroll = [...payrollMonths.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([period, v]) => ({ period, ...v, total: v.paid + v.pending }));

  // ---------- Group comparison (organisation-wide roles only) ----------
  const schools = GROUP_ROLES.includes(scope.role) ? await compareSchools(prisma, schoolId, from, to) : [];

  return {
    demographics: { girls, boys, total: girls + boys, enrollmentByLevel },
    absenceHeatmap,
    billingSchedule,
    gradeDistribution,
    subjectAverages,
    termProgress: { terms: terms.map((t) => ({ key: `t${t.order}`, name: t.name })), rows: termProgress },
    atRisk,
    payroll,
    schools,
  };
}

/** One row per school of the same organisation: size, attendance, collections, results. */
async function compareSchools(prisma: PrismaService, schoolId: string, from: Date, to: Date) {
  const current = await prisma.school.findUnique({ where: { id: schoolId }, select: { organisationId: true } });
  if (!current) return [];
  const schools = await prisma.school.findMany({
    where: { organisationId: current.organisationId, isActive: true },
    select: { id: true, name: true, code: true, city: true },
    orderBy: { name: 'asc' },
  });
  const today = new Date();
  return Promise.all(
    schools.map(async (s) => {
      const year = await prisma.academicYear.findFirst({ where: { schoolId: s.id, isCurrent: true }, select: { id: true } });
      const yearScope = year ? { academicYearId: year.id } : { academicYearId: '__none__' };
      const [students, attendance, invoiced, paid, overdue, grades] = await Promise.all([
        prisma.enrollment.count({ where: { withdrawalDate: null, class: { schoolId: s.id, ...yearScope } } }),
        prisma.attendance.groupBy({ by: ['status'], where: { schoolId: s.id, date: { gte: from, lte: to } }, _count: true }),
        prisma.invoice.aggregate({ where: { schoolId: s.id, ...yearScope, status: { notIn: ['CANCELLED', 'DRAFT'] } }, _sum: { totalAmount: true } }),
        prisma.payment.aggregate({ where: { status: 'SUCCESS', invoice: { schoolId: s.id, ...yearScope } }, _sum: { amount: true } }),
        prisma.invoice.count({ where: { schoolId: s.id, ...yearScope, status: { in: ['OVERDUE', 'PENDING', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date(today.getTime() - DAY_MS) } } }),
        prisma.grade.aggregate({ where: { class: { schoolId: s.id, ...yearScope } }, _avg: { score: true } }),
      ]);
      const counts = Object.fromEntries(attendance.map((r) => [r.status, r._count]));
      const total = (counts.PRESENT || 0) + (counts.RETARD || 0) + (counts.ABSENT || 0) + (counts.ABSENCE_JUSTIFIEE || 0);
      const invoicedAmount = invoiced._sum.totalAmount || 0;
      const paidAmount = paid._sum.amount || 0;
      return {
        schoolId: s.id,
        name: s.name,
        code: s.code,
        city: s.city,
        isCurrent: s.id === schoolId,
        students,
        attendanceRate: total ? round1((((counts.PRESENT || 0) + (counts.RETARD || 0)) / total) * 100) : null,
        invoiced: invoicedAmount,
        collected: paidAmount,
        recoveryRate: invoicedAmount ? round1((Math.min(paidAmount, invoicedAmount) / invoicedAmount) * 100) : null,
        overdueInvoices: overdue,
        averageGrade: grades._avg.score !== null ? round1(grades._avg.score) : null,
      };
    }),
  );
}
