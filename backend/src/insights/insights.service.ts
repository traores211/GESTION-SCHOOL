import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { MANAGEMENT } from '../common/roles';
import { MailService } from '../infra/mail.service';
import { MessagingScheduler } from '../messaging/messaging.scheduler';
import { DigestInput, DigestLine, WeekFigures, buildDigest, collectionForecast, weekStart } from './insight-rules';

const OPEN_ADMISSION_STATUSES = ['CANDIDATURE', 'DOSSIER_INCOMPLET', 'DOSSIER_COMPLET', 'ETUDE', 'TEST', 'ENTRETIEN'] as const;

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

@Injectable()
export class InsightsService implements OnModuleInit {
  private readonly logger = new Logger('Insights');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly scheduler: MessagingScheduler,
  ) {}

  onModuleInit() {
    // Every Monday morning the head of each school receives the summary of the past week.
    this.scheduler.registerDaily('weekly-digest', async (now) => {
      if (now.getDay() !== 1) return;
      const sent = await this.sendWeeklyDigests(now);
      this.logger.log(`Synthèse hebdomadaire envoyée à ${sent} destinataire(s)`);
    });
  }

  private school(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  private async weekFigures(schoolId: string, from: Date, to: Date): Promise<WeekFigures> {
    const [attendance, payments, marksEntered, newApplications, smsSent] = await Promise.all([
      this.prisma.attendance.groupBy({ by: ['status'], where: { schoolId, date: { gte: from, lt: to } }, _count: true }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS', paidAt: { gte: from, lt: to }, invoice: { schoolId } }, _sum: { amount: true } }),
      this.prisma.grade.count({ where: { createdAt: { gte: from, lt: to }, class: { schoolId } } }),
      this.prisma.admission.count({ where: { schoolId, submittedAt: { gte: from, lt: to } } }),
      this.prisma.messageLog.count({ where: { schoolId, status: 'SENT', createdAt: { gte: from, lt: to } } }),
    ]);
    const count = (status: string) => attendance.find((a) => a.status === status)?._count ?? 0;
    return {
      attendance: { marked: attendance.reduce((s, a) => s + a._count, 0), present: count('PRESENT') + count('RETARD'), unjustified: count('ABSENT') },
      collected: payments._sum.amount ?? 0,
      marksEntered,
      newApplications,
      smsSent,
    };
  }

  /** The figures and sentences of a week (the one containing `now` by default, from Monday). */
  async weeklyFor(schoolId: string, now = new Date(), previousWeek = false) {
    const monday = weekStart(now);
    const from = previousWeek ? new Date(monday.getTime() - 7 * 86400000) : monday;
    const to = previousWeek ? monday : new Date(now.getTime() + 1);
    const before = new Date(from.getTime() - 7 * 86400000);

    const [thisWeek, lastWeek, invoices, absentees, stalledApplications, pendingJustifications, year] = await Promise.all([
      this.weekFigures(schoolId, from, to),
      this.weekFigures(schoolId, before, from),
      this.prisma.invoice.findMany({ where: { schoolId, status: { notIn: ['CANCELLED', 'DRAFT', 'PAID'] } }, select: { totalAmount: true, dueDate: true, payments: { where: { status: 'SUCCESS' }, select: { amount: true } } } }),
      this.prisma.attendance.groupBy({ by: ['studentId'], where: { schoolId, status: 'ABSENT', date: { gte: from, lt: to } }, _count: true, having: { studentId: { _count: { gte: 3 } } } }),
      this.prisma.admission.count({ where: { schoolId, status: { in: [...OPEN_ADMISSION_STATUSES] }, updatedAt: { lt: new Date(to.getTime() - 7 * 86400000) } } }),
      this.prisma.attendance.count({ where: { schoolId, status: 'ABSENT', justificationRequest: { not: null } } }),
      this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, include: { terms: true } }),
    ]);

    const open = invoices.map((i) => ({ dueDate: i.dueDate, left: Math.max(0, i.totalAmount - i.payments.reduce((s, p) => s + p.amount, 0)) })).filter((i) => i.left > 0);
    const late = open.filter((i) => i.dueDate < to);
    const fresh = late.filter((i) => i.dueDate >= from);

    const students = absentees.length
      ? await this.prisma.student.findMany({ where: { id: { in: absentees.map((a) => a.studentId) } }, select: { id: true, firstName: true, lastName: true, enrollments: { where: { withdrawalDate: null }, select: { class: { select: { name: true } } }, orderBy: { enrollmentDate: 'desc' }, take: 1 } } })
      : [];
    const repeatedAbsentees = absentees
      .map((a) => {
        const s = students.find((x) => x.id === a.studentId);
        return { name: s ? `${s.firstName} ${s.lastName}` : 'Élève', className: s?.enrollments[0]?.class.name ?? '—', absences: a._count };
      })
      .sort((a, b) => b.absences - a.absences);

    // Classes with pupils but no mark yet in the running term (only once the term is two weeks old).
    let classesWithoutMarks: string[] = [];
    const term = year?.terms.find((t) => t.startDate <= to && t.endDate >= from);
    if (year && term && to.getTime() - term.startDate.getTime() > 14 * 86400000) {
      const classes = await this.prisma.class.findMany({
        where: { schoolId, academicYearId: year.id, enrollments: { some: { withdrawalDate: null } }, grades: { none: { termId: term.id } } },
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      classesWithoutMarks = classes.map((c) => c.name);
    }

    const input: DigestInput = {
      thisWeek,
      lastWeek,
      outstanding: open.reduce((s, i) => s + i.left, 0),
      overdue: { count: late.length, amount: late.reduce((s, i) => s + i.left, 0) },
      newlyOverdue: { count: fresh.length, amount: fresh.reduce((s, i) => s + i.left, 0) },
      repeatedAbsentees,
      stalledApplications,
      classesWithoutMarks,
      pendingJustifications,
    };
    return { from, to: new Date(to.getTime() - 1), figures: input, lines: buildDigest(input) };
  }

  weekly(user: AuthUser, previousWeek = false) {
    return this.weeklyFor(this.school(user), new Date(), previousWeek);
  }

  /** Expected collection of the unpaid invoices, from the school's payment history. */
  async forecast(user: AuthUser) {
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId: this.school(user) },
      select: { totalAmount: true, dueDate: true, status: true, payments: { where: { status: 'SUCCESS' }, select: { amount: true, paidAt: true } } },
    });
    return collectionForecast(
      invoices.map((i) => ({
        totalAmount: i.totalAmount,
        dueDate: i.dueDate,
        status: i.status,
        paid: i.payments.reduce((s, p) => s + p.amount, 0),
        lastPaidAt: i.payments.length ? new Date(Math.max(...i.payments.map((p) => p.paidAt.getTime()))) : null,
      })),
    );
  }

  private render(schoolName: string, digest: { from: Date; to: Date; lines: DigestLine[] }) {
    const period = `${digest.from.toLocaleDateString('fr-FR')} au ${digest.to.toLocaleDateString('fr-FR')}`;
    const topics: Record<DigestLine['topic'], string> = { attendance: 'Présence', finance: 'Scolarité', grades: 'Notes', admissions: 'Admissions' };
    const groups = (Object.keys(topics) as DigestLine['topic'][]).map((topic) => ({ title: topics[topic], lines: digest.lines.filter((l) => l.topic === topic) })).filter((g) => g.lines.length);
    const text = [`${schoolName} — semaine du ${period}`, '', ...groups.flatMap((g) => [g.title.toUpperCase(), ...g.lines.map((l) => `${l.tone === 'warning' ? '(!)' : ' - '} ${l.text}`), ''])].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1916;max-width:600px"><h2 style="margin:0 0 4px">${escapeHtml(schoolName)}</h2><p style="margin:0 0 16px;color:#5c5850">Semaine du ${period}</p>${groups
      .map((g) => `<h3 style="margin:16px 0 6px;font-size:15px">${g.title}</h3><ul style="margin:0;padding-left:20px">${g.lines.map((l) => `<li style="margin-bottom:4px${l.tone === 'warning' ? ';color:#8a2d1b' : ''}">${escapeHtml(l.text)}</li>`).join('')}</ul>`)
      .join('')}<p style="margin-top:20px;color:#5c5850;font-size:13px">Synthèse calculée automatiquement à partir des données de l'établissement dans School ERP.</p></div>`;
    return { subject: `Synthèse de la semaine — ${schoolName}`, text, html };
  }

  /** Sends last week's summary to the management of every active school (Monday job). */
  async sendWeeklyDigests(now = new Date()) {
    const schools = await this.prisma.school.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    let sent = 0;
    for (const school of schools) {
      const recipients = await this.prisma.user.findMany({ where: { schoolId: school.id, status: 'ACTIVE', role: { in: [...MANAGEMENT] as never } }, select: { email: true } });
      if (!recipients.length) continue;
      const message = this.render(school.name, await this.weeklyFor(school.id, now, true));
      for (const r of recipients) if (await this.mail.send({ to: r.email, ...message })) sent++;
    }
    return sent;
  }

  /** Sends this week's summary so far to the signed-in manager (to check what the e-mail looks like). */
  async sendToMe(user: AuthUser) {
    const schoolId = this.school(user);
    const [me, school] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { email: true } }),
      this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
    ]);
    const delivered = await this.mail.send({ to: me.email, ...this.render(school.name, await this.weeklyFor(schoolId)) });
    return { delivered, to: me.email };
  }
}
