import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { can, permissionsForRole } from '../authz/permissions';
import { BillingService } from '../billing/billing.service';
import { AttendanceService } from '../attendance/attendance.service';
import { DATA_SOURCES, validateViewSpec, ViewSpec } from './views';

/** Resolves named data sources (for dashboards and AI tools). Permission re-checked on every read. */
@Injectable()
export class DataSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly attendance: AttendanceService,
  ) {}

  private sid(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  /** Students whose average over the (current or given) term is below the threshold. */
  async belowAverage(user: AuthUser, threshold = 10, classId?: string, termId?: string) {
    const schoolId = this.sid(user);
    const term =
      termId
        ? await this.prisma.term.findFirst({ where: { id: termId, academicYear: { schoolId } } })
        : await this.prisma.term.findFirst({
            where: { academicYear: { schoolId, isCurrent: true }, startDate: { lte: new Date() } },
            orderBy: { order: 'desc' },
          });
    if (!term) return { term: null, students: [] };
    const grades = await this.prisma.grade.findMany({
      where: { termId: term.id, class: { schoolId }, ...(classId ? { classId } : {}) },
      select: { studentId: true, score: true, maxScore: true, coefficient: true, student: { select: { firstName: true, lastName: true, matricule: true } }, class: { select: { name: true } } },
    });
    const acc = new Map<string, { sum: number; coef: number; name: string; matricule: string; className: string }>();
    for (const g of grades) {
      const a = acc.get(g.studentId) ?? { sum: 0, coef: 0, name: `${g.student.lastName} ${g.student.firstName}`, matricule: g.student.matricule, className: g.class.name };
      a.sum += (g.score / g.maxScore) * 20 * g.coefficient;
      a.coef += g.coefficient;
      acc.set(g.studentId, a);
    }
    const students = [...acc.entries()]
      .map(([id, a]) => ({ id, name: a.name, matricule: a.matricule, class: a.className, average: Math.round((a.sum / a.coef) * 100) / 100 }))
      .filter((s) => s.average < threshold)
      .sort((a, b) => a.average - b.average);
    return { term: term.name, threshold, students };
  }

  async payrollSummary(user: AuthUser) {
    const schoolId = this.sid(user);
    const period = new Date().toISOString().slice(0, 7);
    const agg = await this.prisma.payslip.aggregate({ where: { schoolId, period }, _sum: { netSalary: true }, _count: true });
    return { period, count: agg._count, totalNet: agg._sum.netSalary ?? 0 };
  }

  async resolve(user: AuthUser, source: string): Promise<unknown> {
    const def = DATA_SOURCES[source];
    if (!def) throw new NotFoundException('Source inconnue');
    if (!can(user, def.permission)) throw new ForbiddenException();
    const schoolId = this.sid(user);
    switch (source) {
      case 'students.count':
        return { value: await this.prisma.student.count({ where: { schoolId } }) };
      case 'fees.stats':
        return this.billing.financeStats(user);
      case 'fees.unpaid': {
        const rows = await this.billing.unpaid(user, false, 100);
        return { value: rows.reduce((s, r) => s + r.remaining, 0), count: rows.length, rows };
      }
      case 'fees.overdue': {
        const rows = await this.billing.unpaid(user, true, 100);
        return { value: rows.reduce((s, r) => s + r.remaining, 0), count: rows.length, rows };
      }
      case 'attendance.today':
        return this.attendance.todayStats(user);
      case 'grades.below_average': {
        const r = await this.belowAverage(user);
        return { value: r.students.length, rows: r.students, term: r.term };
      }
      case 'admissions.pending': {
        const rows = await this.prisma.admission.findMany({
          where: { schoolId, status: { notIn: ['CONFIRME', 'REJETE'] } },
          select: { id: true, firstName: true, lastName: true, status: true, submittedAt: true },
          orderBy: { submittedAt: 'desc' },
          take: 100,
        });
        return { value: rows.length, rows };
      }
      case 'payroll.summary': {
        const p = await this.payrollSummary(user);
        return { value: p.totalNet, ...p };
      }
      case 'students.by_class': {
        const classes = await this.prisma.class.findMany({
          where: { schoolId, academicYear: { isCurrent: true } },
          select: { name: true, _count: { select: { enrollments: { where: { withdrawalDate: null } } } } },
          orderBy: { name: 'asc' },
        });
        return { rows: classes.map((c) => ({ label: c.name, value: c._count.enrollments })) };
      }
    }
    throw new NotFoundException();
  }

  // ---- Saved views ----

  validate(user: AuthUser, spec: unknown) {
    return validateViewSpec(spec, permissionsForRole(user.role));
  }

  async save(user: AuthUser, spec: ViewSpec) {
    const errors = this.validate(user, spec);
    if (errors.length) throw new BadRequestException({ message: 'Vue invalide', errors });
    return this.prisma.savedView.create({
      data: { schoolId: this.sid(user), userId: user.userId, name: spec.title, spec: spec as unknown as Prisma.InputJsonValue },
    });
  }

  list(user: AuthUser) {
    return this.prisma.savedView.findMany({ where: { schoolId: this.sid(user), userId: user.userId }, orderBy: { updatedAt: 'desc' } });
  }

  async remove(user: AuthUser, id: string) {
    const v = await this.prisma.savedView.findFirst({ where: { id, schoolId: this.sid(user), userId: user.userId } });
    if (!v) throw new NotFoundException('Vue introuvable');
    await this.prisma.savedView.delete({ where: { id } });
    return { success: true };
  }

  /** Data of every component of a saved view — each source re-authorised for the current user. */
  async data(user: AuthUser, id: string) {
    const v = await this.prisma.savedView.findFirst({ where: { id, schoolId: this.sid(user), userId: user.userId } });
    if (!v) throw new NotFoundException('Vue introuvable');
    const spec = v.spec as unknown as ViewSpec;
    const components = await Promise.all(
      spec.components.map(async (c) => {
        try {
          return { ...c, data: await this.resolve(user, c.source) };
        } catch {
          return { ...c, error: 'Données non disponibles pour votre profil' };
        }
      }),
    );
    return { id: v.id, title: spec.title, components };
  }
}
