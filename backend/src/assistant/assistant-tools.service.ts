import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canSeeFinance, ToolClaims } from './tool-token';

const DAY_MS = 86_400_000;
const round1 = (v: number) => Math.round(v * 10) / 10;
const rate = (present: number, total: number) => (total ? round1((present / total) * 100) : null);
const DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/**
 * Read-only tools for the Dify agent. Every method is scoped to the school in the token; finance figures
 * require a finance or office role. Answers are small, French, JSON objects the model can quote.
 */
@Injectable()
export class AssistantToolsService {
  constructor(private readonly prisma: PrismaService) {}

  private async currentYear(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    if (!year) throw new NotFoundException("Aucune année scolaire en cours pour l'établissement");
    return year;
  }

  /** Key figures of the school. */
  async overview(c: ToolClaims) {
    const year = await this.currentYear(c.schoolId);
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [school, students, classes, attendance, pendingAdmissions] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: c.schoolId }, select: { name: true, city: true } }),
      this.prisma.enrollment.count({ where: { withdrawalDate: null, class: { schoolId: c.schoolId, academicYearId: year.id } } }),
      this.prisma.class.count({ where: { schoolId: c.schoolId, academicYearId: year.id } }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { schoolId: c.schoolId, date: { gte: since } }, _count: true }),
      this.prisma.admission.count({ where: { schoolId: c.schoolId, academicYearId: year.id, status: { notIn: ['CONFIRME', 'REJETE'] } } }),
    ]);
    const counts = Object.fromEntries(attendance.map((a) => [a.status, a._count]));
    const total = Object.values(counts).reduce((s: number, v) => s + (v as number), 0) as number;
    const result: Record<string, unknown> = {
      etablissement: school?.name,
      ville: school?.city,
      annee_scolaire: year.name,
      eleves_inscrits: students,
      classes,
      taux_presence_30_jours: rate((counts.PRESENT || 0) + (counts.RETARD || 0), total),
      absences_30_jours: (counts.ABSENT || 0) + (counts.ABSENCE_JUSTIFIEE || 0),
      admissions_en_cours: pendingAdmissions,
    };
    if (canSeeFinance(c.role)) {
      const finance = await this.financeTotals(c.schoolId, year.id);
      Object.assign(result, finance);
    }
    return result;
  }

  private async financeTotals(schoolId: string, academicYearId: string) {
    const today = new Date();
    const [invoiced, paid, overdue] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { schoolId, academicYearId, status: { notIn: ['CANCELLED', 'DRAFT'] } }, _sum: { totalAmount: true } }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS', invoice: { schoolId, academicYearId } }, _sum: { amount: true } }),
      this.prisma.invoice.findMany({
        where: { schoolId, academicYearId, status: { notIn: ['CANCELLED', 'DRAFT', 'PAID'] }, dueDate: { lt: today } },
        select: { totalAmount: true, payments: { where: { status: 'SUCCESS' }, select: { amount: true } } },
      }),
    ]);
    const outstanding = overdue.map((i) => i.totalAmount - i.payments.reduce((s, p) => s + p.amount, 0)).filter((v) => v > 0);
    const totalInvoiced = invoiced._sum.totalAmount || 0;
    const totalPaid = paid._sum.amount || 0;
    return {
      total_facture_fcfa: totalInvoiced,
      total_encaisse_fcfa: totalPaid,
      taux_recouvrement: totalInvoiced ? round1((Math.min(totalPaid, totalInvoiced) / totalInvoiced) * 100) : null,
      factures_echues_impayees: outstanding.length,
      montant_echu_impaye_fcfa: outstanding.reduce((s, v) => s + v, 0),
    };
  }

  /** Pupils whose name or matricule matches. */
  async searchStudents(c: ToolClaims, q: string) {
    const term = (q || '').trim();
    if (term.length < 2) return { eleves: [], remarque: 'Donnez au moins deux caractères.' };
    const words = term.split(/\s+/).filter(Boolean);
    const students = await this.prisma.student.findMany({
      where: {
        schoolId: c.schoolId,
        AND: words.map((w) => ({
          OR: [
            { firstName: { contains: w, mode: 'insensitive' as const } },
            { lastName: { contains: w, mode: 'insensitive' as const } },
            { matricule: { contains: w, mode: 'insensitive' as const } },
          ],
        })),
      },
      take: 10,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { matricule: true, firstName: true, lastName: true, status: true, enrollments: { where: { withdrawalDate: null }, select: { class: { select: { name: true } } }, orderBy: { enrollmentDate: 'desc' }, take: 1 } },
    });
    return {
      eleves: students.map((s) => ({ matricule: s.matricule, nom: `${s.lastName} ${s.firstName}`, classe: s.enrollments[0]?.class.name ?? null, statut: s.status })),
    };
  }

  /** One pupil: class, attendance this year, latest term average, and balance for finance roles. */
  async studentSummary(c: ToolClaims, matricule: string) {
    const student = await this.prisma.student.findFirst({
      where: { schoolId: c.schoolId, matricule: (matricule || '').trim() },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        matricule: true,
        gender: true,
        status: true,
        enrollments: { where: { withdrawalDate: null }, select: { class: { select: { name: true, academicYearId: true } } }, orderBy: { enrollmentDate: 'desc' }, take: 1 },
      },
    });
    if (!student) throw new NotFoundException(`Aucun élève avec le matricule ${matricule} dans cet établissement`);
    const year = await this.currentYear(c.schoolId);
    const [attendance, grades] = await Promise.all([
      this.prisma.attendance.groupBy({ by: ['status'], where: { studentId: student.id, date: { gte: year.startDate } }, _count: true }),
      this.prisma.grade.findMany({
        where: { studentId: student.id, term: { academicYearId: year.id } },
        select: { score: true, maxScore: true, coefficient: true, term: { select: { name: true, order: true } }, subject: { select: { name: true } } },
      }),
    ]);
    const counts = Object.fromEntries(attendance.map((a) => [a.status, a._count]));
    const total = Object.values(counts).reduce((s: number, v) => s + (v as number), 0) as number;
    const lastOrder = Math.max(0, ...grades.map((g) => g.term.order));
    const last = grades.filter((g) => g.term.order === lastOrder);
    const bySubject = new Map<string, { w: number; c: number }>();
    for (const g of last) {
      const acc = bySubject.get(g.subject.name) || { w: 0, c: 0 };
      acc.w += (g.score / g.maxScore) * 20 * g.coefficient;
      acc.c += g.coefficient;
      bySubject.set(g.subject.name, acc);
    }
    const subjectAverages = [...bySubject.entries()].map(([name, a]) => ({ matiere: name, moyenne: round1(a.w / a.c) })).sort((a, b) => a.moyenne - b.moyenne);
    const result: Record<string, unknown> = {
      nom: `${student.lastName} ${student.firstName}`,
      matricule: student.matricule,
      classe: student.enrollments[0]?.class.name ?? null,
      statut: student.status,
      presence_depuis_la_rentree: { taux: rate((counts.PRESENT || 0) + (counts.RETARD || 0), total), absences: counts.ABSENT || 0, absences_justifiees: counts.ABSENCE_JUSTIFIEE || 0, retards: counts.RETARD || 0 },
      dernier_trimestre: last[0]?.term.name ?? null,
      moyenne_simple_dernier_trimestre: subjectAverages.length ? round1(subjectAverages.reduce((s, x) => s + x.moyenne, 0) / subjectAverages.length) : null,
      moyennes_par_matiere: subjectAverages,
    };
    if (canSeeFinance(c.role)) {
      const invoices = await this.prisma.invoice.findMany({
        where: { studentId: student.id, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        select: { reference: true, label: true, totalAmount: true, dueDate: true, payments: { where: { status: 'SUCCESS' }, select: { amount: true } } },
        orderBy: { dueDate: 'asc' },
      });
      const rows = invoices.map((i) => {
        const paid = i.payments.reduce((s, p) => s + p.amount, 0);
        return { reference: i.reference, libelle: i.label, montant_fcfa: i.totalAmount, paye_fcfa: paid, reste_fcfa: Math.max(0, i.totalAmount - paid), echeance: i.dueDate.toISOString().slice(0, 10) };
      });
      result.scolarite = { factures: rows, reste_du_total_fcfa: rows.reduce((s, r) => s + r.reste_fcfa, 0) };
    }
    return result;
  }

  /** Largest overdue invoices (finance and office roles). */
  async overdue(c: ToolClaims, limit = 10) {
    if (!canSeeFinance(c.role)) throw new ForbiddenException("Votre profil n'a pas accès aux données financières");
    const year = await this.currentYear(c.schoolId);
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId: c.schoolId, academicYearId: year.id, status: { notIn: ['CANCELLED', 'DRAFT', 'PAID'] }, dueDate: { lt: new Date() } },
      select: {
        reference: true,
        totalAmount: true,
        dueDate: true,
        payments: { where: { status: 'SUCCESS' }, select: { amount: true } },
        student: { select: { matricule: true, firstName: true, lastName: true, parents: { select: { phone: true }, take: 1 } } },
      },
    });
    const rows = invoices
      .map((i) => ({
        reference: i.reference,
        eleve: `${i.student.lastName} ${i.student.firstName}`,
        matricule: i.student.matricule,
        reste_fcfa: i.totalAmount - i.payments.reduce((s, p) => s + p.amount, 0),
        echeance: i.dueDate.toISOString().slice(0, 10),
        jours_de_retard: Math.floor((Date.now() - i.dueDate.getTime()) / DAY_MS),
        telephone_parent: i.student.parents[0]?.phone ?? null,
      }))
      .filter((r) => r.reste_fcfa > 0)
      .sort((a, b) => b.reste_fcfa - a.reste_fcfa);
    return { nombre_total: rows.length, montant_total_fcfa: rows.reduce((s, r) => s + r.reste_fcfa, 0), plus_gros: rows.slice(0, Math.min(Math.max(limit, 1), 25)) };
  }

  /** Attendance over the last N days, per class, with the most absent pupils. */
  async attendance(c: ToolClaims, className?: string, days = 30) {
    const year = await this.currentYear(c.schoolId);
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * DAY_MS);
    const classes = await this.prisma.class.findMany({
      where: { schoolId: c.schoolId, academicYearId: year.id, ...(className ? { name: { contains: className.trim(), mode: 'insensitive' as const } } : {}) },
      select: { id: true, name: true },
    });
    if (className && !classes.length) throw new NotFoundException(`Aucune classe ne correspond à « ${className} »`);
    const ids = classes.map((k) => k.id);
    const [byClass, byStudent] = await Promise.all([
      this.prisma.attendance.groupBy({ by: ['classId', 'status'], where: { classId: { in: ids }, date: { gte: since } }, _count: true }),
      this.prisma.attendance.groupBy({ by: ['studentId'], where: { classId: { in: ids }, date: { gte: since }, status: 'ABSENT' }, _count: true, orderBy: { _count: { studentId: 'desc' } }, take: 5 }),
    ]);
    const names = new Map(classes.map((k) => [k.id, k.name]));
    const agg = new Map<string, { present: number; total: number; absents: number }>();
    for (const r of byClass) {
      const a = agg.get(r.classId) || { present: 0, total: 0, absents: 0 };
      a.total += r._count;
      if (r.status === 'PRESENT' || r.status === 'RETARD') a.present += r._count;
      if (r.status === 'ABSENT') a.absents += r._count;
      agg.set(r.classId, a);
    }
    const pupils = await this.prisma.student.findMany({ where: { id: { in: byStudent.map((s) => s.studentId) } }, select: { id: true, firstName: true, lastName: true, matricule: true } });
    const pupilName = new Map(pupils.map((p) => [p.id, p]));
    return {
      periode_jours: days,
      classes: [...agg.entries()]
        .map(([id, a]) => ({ classe: names.get(id), taux_presence: rate(a.present, a.total), absences_non_justifiees: a.absents }))
        .sort((x, y) => (x.taux_presence ?? 0) - (y.taux_presence ?? 0)),
      eleves_les_plus_absents: byStudent.map((s) => {
        const p = pupilName.get(s.studentId);
        return { nom: p ? `${p.lastName} ${p.firstName}` : '—', matricule: p?.matricule, absences: s._count };
      }),
    };
  }

  /** Lessons of a class (or the whole school) for a given weekday. */
  async timetable(c: ToolClaims, className?: string, day?: number) {
    const year = await this.currentYear(c.schoolId);
    const weekday = day && day >= 1 && day <= 7 ? day : ((new Date().getDay() + 6) % 7) + 1;
    const sessions = await this.prisma.timetableSession.findMany({
      where: {
        schoolId: c.schoolId,
        academicYearId: year.id,
        dayOfWeek: weekday,
        ...(className ? { class: { name: { contains: className.trim(), mode: 'insensitive' as const } } } : {}),
      },
      orderBy: [{ startTime: 'asc' }],
      take: 60,
      select: { startTime: true, endTime: true, label: true, class: { select: { name: true } }, subject: { select: { name: true } }, room: { select: { name: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } } },
    });
    return {
      jour: DAYS[weekday],
      seances: sessions.map((s) => ({
        horaire: `${s.startTime}-${s.endTime}`,
        classe: s.class.name,
        matiere: s.subject?.name ?? s.label ?? null,
        salle: s.room?.name ?? null,
        enseignant: s.teacher ? `${s.teacher.user.firstName} ${s.teacher.user.lastName}` : null,
      })),
    };
  }
}
