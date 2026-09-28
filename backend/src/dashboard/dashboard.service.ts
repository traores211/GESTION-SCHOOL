import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { AttendanceService } from '../attendance/attendance.service';
import { BillingService } from '../billing/billing.service';
import { DashboardPeriod, DashboardQueryDto } from './dto/dashboard-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<DashboardPeriod, 'year'>, number> = { '7d': 7, '30d': 30, '90d': 90 };
const MONTHS_IN_TREND = 6;

/** Alert thresholds shown on the dashboard. */
const THRESHOLDS = {
  attendanceRateWarning: 90,
  classFillWarning: 90,
  classFillDanger: 100,
  recoveryRateWarning: 50,
  classAverageWarning: 10,
};

const ADMISSION_WORKFLOW = [
  'CANDIDATURE',
  'DOSSIER_INCOMPLET',
  'DOSSIER_COMPLET',
  'ETUDE',
  'TEST',
  'ENTRETIEN',
  'ADMIS',
  'INSCRIPTION',
  'CONFIRME',
  'REJETE',
] as const;

type EffectiveInvoiceStatus = 'PAID' | 'PARTIALLY_PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED' | 'DRAFT';

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** French decimal notation for alert messages (81,1). */
function fr(value: number) {
  return String(value).replace('.', ',');
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Percentage change between two values; null when there is no base to compare with. */
function variation(current: number, previous: number | null) {
  if (previous === null || previous === 0) return null;
  return round1(((current - previous) / previous) * 100);
}

function attendanceRate(counts: Record<string, number>) {
  const present = counts.PRESENT || 0;
  const late = counts.RETARD || 0;
  const total = present + late + (counts.ABSENT || 0) + (counts.ABSENCE_JUSTIFIEE || 0);
  return { total, rate: total > 0 ? round1(((present + late) / total) * 100) : null };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly billingService: BillingService,
  ) {}

  async overview(user: AuthUser) {
    if (!user.schoolId) {
      return {
        studentsCount: 0,
        teachersCount: 0,
        classesCount: 0,
        pendingAdmissions: 0,
        attendance: { present: 0, absent: 0, late: 0, rate: 0 },
        finance: { totalInvoiced: 0, totalCollected: 0, outstanding: 0, recoveryRate: 0, collectedToday: 0 },
      };
    }

    const [studentsCount, teachersCount, classesCount, pendingAdmissions, attendance, finance] = await Promise.all([
      this.prisma.student.count({ where: { schoolId: user.schoolId } }),
      this.prisma.user.count({ where: { schoolId: user.schoolId, role: 'ENSEIGNANT' } }),
      this.prisma.class.count({ where: { schoolId: user.schoolId } }),
      this.prisma.admission.count({
        where: { schoolId: user.schoolId, status: { notIn: ['CONFIRME', 'REJETE'] } },
      }),
      this.attendanceService.todayStats(user),
      this.billingService.financeStats(user),
    ]);

    return { studentsCount, teachersCount, classesCount, pendingAdmissions, attendance, finance };
  }

  /** Values available for the dashboard filter bar. */
  async filters(user: AuthUser) {
    if (!user.schoolId) return { academicYears: [], classes: [], terms: [] };
    const [academicYears, classes, terms] = await Promise.all([
      this.prisma.academicYear.findMany({
        where: { schoolId: user.schoolId },
        select: { id: true, name: true, isCurrent: true },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.class.findMany({
        where: { schoolId: user.schoolId },
        select: { id: true, name: true, level: true, academicYearId: true },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.term.findMany({
        where: { academicYear: { schoolId: user.schoolId } },
        select: { id: true, name: true, order: true, academicYearId: true },
        orderBy: { order: 'asc' },
      }),
    ]);
    return { academicYears, classes, terms };
  }

  async analytics(user: AuthUser, query: DashboardQueryDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const schoolId = user.schoolId;

    const year = query.academicYearId
      ? await this.prisma.academicYear.findFirst({ where: { id: query.academicYearId, schoolId } })
      : await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    if (!year) throw new BadRequestException('Année scolaire introuvable');

    if (query.classId) {
      const klass = await this.prisma.class.findFirst({
        where: { id: query.classId, schoolId, academicYearId: year.id },
      });
      if (!klass) throw new BadRequestException("Classe introuvable pour l'année sélectionnée");
    }

    // ---------- Period N and N-1 ----------
    const period: DashboardPeriod = query.period || '30d';
    const now = new Date();
    // Past years are clipped to their end date; the current year runs until today even if its
    // configured end date has passed (activity keeps being recorded against it).
    const to = !year.isCurrent && year.endDate < now ? year.endDate : now;
    const from =
      period === 'year' ? startOfDay(year.startDate) : startOfDay(new Date(to.getTime() - (PERIOD_DAYS[period] - 1) * DAY_MS));
    const length = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - length);
    const previousTo = from;

    const classFilter = query.classId ? { classId: query.classId } : { class: { academicYearId: year.id } };
    const studentScope: Prisma.StudentWhereInput | undefined = query.classId
      ? { enrollments: { some: { classId: query.classId } } }
      : undefined;
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      schoolId,
      academicYearId: year.id,
      ...(studentScope ? { student: studentScope } : {}),
    };
    const successfulPayment = (range: { gte: Date; lt?: Date; lte?: Date }): Prisma.PaymentWhereInput => ({
      status: 'SUCCESS',
      paidAt: range,
      invoice: invoiceWhere,
    });

    const trendStart = new Date(to.getFullYear(), to.getMonth() - (MONTHS_IN_TREND - 1), 1);

    const [
      attendanceByDayStatus,
      attendanceByClassStatus,
      previousAttendance,
      collected,
      previousCollected,
      paymentsByMethod,
      monthlyPayments,
      invoices,
      admissions,
      classes,
    ] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['date', 'status'],
        where: { schoolId, ...classFilter, date: { gte: from, lte: to } },
        _count: true,
        orderBy: { date: 'asc' },
      }),
      this.prisma.attendance.groupBy({
        by: ['classId', 'status'],
        where: { schoolId, ...classFilter, date: { gte: from, lte: to } },
        _count: true,
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { schoolId, ...classFilter, date: { gte: previousFrom, lt: previousTo } },
        _count: true,
      }),
      this.prisma.payment.aggregate({ where: successfulPayment({ gte: from, lte: to }), _sum: { amount: true } }),
      this.prisma.payment.aggregate({
        where: successfulPayment({ gte: previousFrom, lt: previousTo }),
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: successfulPayment({ gte: from, lte: to }),
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.findMany({
        where: successfulPayment({ gte: trendStart, lte: to }),
        select: { amount: true, paidAt: true },
      }),
      this.prisma.invoice.findMany({
        where: invoiceWhere,
        select: {
          id: true,
          reference: true,
          totalAmount: true,
          dueDate: true,
          status: true,
          student: { select: { id: true, firstName: true, lastName: true, matricule: true } },
          payments: { where: { status: 'SUCCESS' }, select: { amount: true } },
        },
      }),
      this.prisma.admission.groupBy({
        by: ['status'],
        where: { schoolId, academicYearId: year.id },
        _count: true,
      }),
      this.prisma.class.findMany({
        where: { schoolId, academicYearId: year.id, ...(query.classId ? { id: query.classId } : {}) },
        select: {
          id: true,
          name: true,
          level: true,
          capacity: true,
          _count: { select: { enrollments: { where: { withdrawalDate: null } } } },
        },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const classNames = new Map(classes.map((c) => [c.id, c.name]));

    // ---------- Attendance ----------
    const byDay = new Map<string, Record<string, number>>();
    for (const row of attendanceByDayStatus) {
      const key = row.date.toISOString().slice(0, 10);
      const counts = byDay.get(key) || {};
      counts[row.status] = row._count;
      byDay.set(key, counts);
    }
    const attendanceTrend = [...byDay.entries()].map(([date, counts]) => ({
      date,
      present: counts.PRESENT || 0,
      late: counts.RETARD || 0,
      absent: counts.ABSENT || 0,
      justified: counts.ABSENCE_JUSTIFIEE || 0,
      ...attendanceRate(counts),
    }));

    const periodCounts: Record<string, number> = {};
    const byClass = new Map<string, Record<string, number>>();
    for (const row of attendanceByClassStatus) {
      periodCounts[row.status] = (periodCounts[row.status] || 0) + row._count;
      const counts = byClass.get(row.classId) || {};
      counts[row.status] = row._count;
      byClass.set(row.classId, counts);
    }
    const attendanceByClass = [...byClass.entries()]
      .map(([classId, counts]) => ({
        classId,
        name: classNames.get(classId) || '—',
        absences: (counts.ABSENT || 0) + (counts.ABSENCE_JUSTIFIEE || 0),
        late: counts.RETARD || 0,
        ...attendanceRate(counts),
      }))
      .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

    const currentAttendance = attendanceRate(periodCounts);
    const previousAttendanceRate = attendanceRate(
      Object.fromEntries(previousAttendance.map((row) => [row.status, row._count])),
    );

    // ---------- Finance ----------
    const today = startOfDay(now);
    const invoiceRows = invoices.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
      const outstanding = Math.max(inv.totalAmount - paid, 0);
      let effectiveStatus: EffectiveInvoiceStatus;
      if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') effectiveStatus = inv.status;
      else if (outstanding <= 0) effectiveStatus = 'PAID';
      else if (inv.dueDate < today) effectiveStatus = 'OVERDUE';
      else if (paid > 0) effectiveStatus = 'PARTIALLY_PAID';
      else effectiveStatus = 'PENDING';
      return { ...inv, paid, outstanding, effectiveStatus };
    });
    const billable = invoiceRows.filter((inv) => inv.effectiveStatus !== 'CANCELLED' && inv.effectiveStatus !== 'DRAFT');
    const totalInvoiced = billable.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = billable.reduce((sum, inv) => sum + Math.min(inv.paid, inv.totalAmount), 0);
    const recoveryRate = totalInvoiced > 0 ? round1((totalPaid / totalInvoiced) * 100) : null;

    const statusTotals = new Map<EffectiveInvoiceStatus, { count: number; amount: number }>();
    for (const inv of invoiceRows) {
      const entry = statusTotals.get(inv.effectiveStatus) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += inv.effectiveStatus === 'PAID' ? inv.totalAmount : inv.outstanding;
      statusTotals.set(inv.effectiveStatus, entry);
    }
    const invoicesByStatus = [...statusTotals.entries()].map(([status, v]) => ({ status, ...v }));

    const overdueRows = invoiceRows
      .filter((inv) => inv.effectiveStatus === 'OVERDUE')
      .sort((a, b) => b.outstanding - a.outstanding);
    const overdueInvoices = overdueRows.slice(0, 5).map((inv) => ({
      id: inv.id,
      reference: inv.reference,
      student: inv.student,
      dueDate: inv.dueDate,
      daysLate: Math.floor((today.getTime() - startOfDay(inv.dueDate).getTime()) / DAY_MS),
      outstanding: inv.outstanding,
    }));
    const overdueAmount = overdueRows.reduce((sum, inv) => sum + inv.outstanding, 0);

    const months = new Map<string, number>();
    for (let i = 0; i < MONTHS_IN_TREND; i += 1) {
      months.set(monthKey(new Date(trendStart.getFullYear(), trendStart.getMonth() + i, 1)), 0);
    }
    for (const p of monthlyPayments) {
      const key = monthKey(p.paidAt);
      if (months.has(key)) months.set(key, (months.get(key) || 0) + p.amount);
    }
    const collectionsByMonth = [...months.entries()].map(([month, amount], i, all) => ({
      month,
      amount,
      variation: i > 0 ? variation(amount, all[i - 1][1]) : null,
    }));

    const collectedAmount = collected._sum.amount || 0;
    const previousCollectedAmount = previousCollected._sum.amount || 0;

    // ---------- Admissions ----------
    const admissionCounts = Object.fromEntries(admissions.map((row) => [row.status, row._count]));
    const admissionsFunnel = ADMISSION_WORKFLOW.map((status) => ({ status, count: admissionCounts[status] || 0 }));
    const pendingAdmissions = admissionsFunnel
      .filter((a) => a.status !== 'CONFIRME' && a.status !== 'REJETE')
      .reduce((sum, a) => sum + a.count, 0);

    // ---------- Class fill ----------
    const classFill = classes.map((c) => ({
      classId: c.id,
      name: c.name,
      level: c.level,
      enrolled: c._count.enrollments,
      capacity: c.capacity,
      rate: c.capacity > 0 ? round1((c._count.enrollments / c.capacity) * 100) : null,
    }));
    const enrolledStudents = classFill.reduce((sum, c) => sum + c.enrolled, 0);

    // ---------- Grades ----------
    const grades = await this.gradesByClass(schoolId, year.id, query.termId, query.classId, classNames);

    // ---------- Alerts ----------
    const alerts: { level: 'danger' | 'warning'; message: string }[] = [];
    if (overdueRows.length > 0) {
      alerts.push({
        level: 'danger',
        message: `${overdueRows.length} facture(s) échue(s) non soldée(s)`,
      });
    }
    if (currentAttendance.rate !== null && currentAttendance.rate < THRESHOLDS.attendanceRateWarning) {
      alerts.push({
        level: 'warning',
        message: `Taux de présence de ${fr(currentAttendance.rate)} % sur la période (seuil ${THRESHOLDS.attendanceRateWarning} %)`,
      });
    }
    if (recoveryRate !== null && recoveryRate < THRESHOLDS.recoveryRateWarning) {
      alerts.push({
        level: 'warning',
        message: `Taux de recouvrement de ${fr(recoveryRate)} % (seuil ${THRESHOLDS.recoveryRateWarning} %)`,
      });
    }
    for (const c of classFill) {
      if (c.rate === null) continue;
      if (c.rate >= THRESHOLDS.classFillDanger) {
        alerts.push({ level: 'danger', message: `${c.name} est complète (${c.enrolled}/${c.capacity})` });
      } else if (c.rate >= THRESHOLDS.classFillWarning) {
        alerts.push({ level: 'warning', message: `${c.name} est presque complète (${c.enrolled}/${c.capacity})` });
      }
    }
    for (const g of grades.byClass) {
      if (g.average !== null && g.average < THRESHOLDS.classAverageWarning) {
        alerts.push({ level: 'warning', message: `Moyenne de ${g.name} sous 10/20 (${fr(g.average)})` });
      }
    }

    return {
      filters: {
        period,
        academicYear: { id: year.id, name: year.name },
        classId: query.classId || null,
        term: grades.term,
        from,
        to,
        previousFrom,
        previousTo,
      },
      thresholds: THRESHOLDS,
      kpis: {
        enrolledStudents,
        attendanceRate: {
          value: currentAttendance.rate,
          previous: previousAttendanceRate.rate,
          delta:
            currentAttendance.rate !== null && previousAttendanceRate.rate !== null
              ? round1(currentAttendance.rate - previousAttendanceRate.rate)
              : null,
        },
        collected: {
          value: collectedAmount,
          previous: previousCollectedAmount,
          variation: variation(collectedAmount, previousCollectedAmount),
        },
        recoveryRate,
        totalInvoiced,
        totalPaid,
        outstanding: totalInvoiced - totalPaid,
        overdue: { count: overdueRows.length, amount: overdueAmount },
        pendingAdmissions,
      },
      attendanceTrend,
      attendanceByClass,
      collectionsByMonth,
      paymentsByMethod: paymentsByMethod
        .map((row) => ({ method: row.method, amount: row._sum.amount || 0, count: row._count }))
        .sort((a, b) => b.amount - a.amount),
      invoicesByStatus,
      overdueInvoices,
      admissionsFunnel,
      classFill,
      gradesByClass: grades.byClass,
      alerts,
    };
  }

  /**
   * Class averages for a term, computed like the bulletins: per-subject weighted average
   * (grade coefficients), then overall average weighted by subject coefficients.
   */
  private async gradesByClass(
    schoolId: string,
    academicYearId: string,
    termId: string | undefined,
    classId: string | undefined,
    classNames: Map<string, string>,
  ) {
    const term = termId
      ? await this.prisma.term.findFirst({ where: { id: termId, academicYearId } })
      : await this.prisma.term.findFirst({
          where: { academicYearId, grades: { some: { class: { schoolId } } } },
          orderBy: { order: 'desc' },
        });
    if (!term) return { term: null, byClass: [] };

    const [grades, classSubjects] = await Promise.all([
      this.prisma.grade.findMany({
        where: { termId: term.id, class: { schoolId, academicYearId }, ...(classId ? { classId } : {}) },
        select: { studentId: true, subjectId: true, classId: true, score: true, maxScore: true, coefficient: true },
      }),
      this.prisma.classSubject.findMany({
        where: { class: { schoolId, academicYearId }, ...(classId ? { classId } : {}) },
        select: { classId: true, subjectId: true, coefficient: true },
      }),
    ]);
    const subjectCoeff = new Map(classSubjects.map((cs) => [`${cs.classId}:${cs.subjectId}`, cs.coefficient]));

    // class -> student -> subject -> { weighted, weight }
    const tree = new Map<string, Map<string, Map<string, { weighted: number; weight: number }>>>();
    for (const g of grades) {
      const students = tree.get(g.classId) || new Map();
      const subjects = students.get(g.studentId) || new Map();
      const acc = subjects.get(g.subjectId) || { weighted: 0, weight: 0 };
      acc.weighted += (g.score / g.maxScore) * 20 * g.coefficient;
      acc.weight += g.coefficient;
      subjects.set(g.subjectId, acc);
      students.set(g.studentId, subjects);
      tree.set(g.classId, students);
    }

    const byClass = [...tree.entries()]
      .map(([cid, students]) => {
        const averages = [...students.values()].map((subjects) => {
          let sum = 0;
          let coeff = 0;
          for (const [subjectId, acc] of subjects) {
            if (acc.weight === 0) continue;
            const c = subjectCoeff.get(`${cid}:${subjectId}`) ?? 1;
            sum += (acc.weighted / acc.weight) * c;
            coeff += c;
          }
          return coeff > 0 ? sum / coeff : null;
        });
        const valid = averages.filter((a): a is number => a !== null);
        return {
          classId: cid,
          name: classNames.get(cid) || '—',
          studentsGraded: valid.length,
          average: valid.length > 0 ? round1(valid.reduce((s, a) => s + a, 0) / valid.length) : null,
          successRate: valid.length > 0 ? round1((valid.filter((a) => a >= 10).length / valid.length) * 100) : null,
          best: valid.length > 0 ? round1(Math.max(...valid)) : null,
          lowest: valid.length > 0 ? round1(Math.min(...valid)) : null,
        };
      })
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

    return { term: { id: term.id, name: term.name }, byClass };
  }
}
