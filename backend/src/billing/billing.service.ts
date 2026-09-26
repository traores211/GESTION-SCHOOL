import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/audit.service';
import { SequenceService } from '../common/sequence.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PaymentProvidersRegistry } from './providers/payment-providers.registry';

function formatFCFA(amount: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' FCFA';
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProvidersRegistry,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  /** Invoices with an outstanding balance (optionally only overdue ones), with the amount left. */
  async unpaid(user: AuthUser, overdueOnly = false, take = 200) {
    if (!user.schoolId) return [];
    const invoices = await this.prisma.invoice.findMany({
      where: {
        schoolId: user.schoolId,
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        ...(overdueOnly ? { dueDate: { lt: new Date() } } : {}),
      },
      include: {
        payments: { where: { status: 'SUCCESS' }, select: { amount: true } },
        student: { select: { id: true, firstName: true, lastName: true, matricule: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: Math.min(take, 500),
    });
    return invoices.map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
      return {
        id: inv.id,
        reference: inv.reference,
        label: inv.label,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount,
        remaining: inv.totalAmount - paid,
        overdue: inv.dueDate < new Date(),
        student: inv.student,
      };
    });
  }

  /**
   * Payment reminders to the parents of students with overdue invoices. Sent in-app (and by the
   * configured email/SMS channel once a provider is set). Returns how many parents were notified.
   */
  async sendReminders(user: AuthUser) {
    const overdue = await this.unpaid(user, true);
    let notified = 0;
    for (const inv of overdue) {
      await this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'OVERDUE' } });
      const parents = await this.prisma.parent.findMany({
        where: { students: { some: { id: inv.student.id } }, userId: { not: null } },
        select: { userId: true },
      });
      for (const parent of parents) {
        await this.notifications.notify(
          parent.userId,
          'Rappel de paiement',
          `La facture ${inv.reference} (${inv.student.firstName} ${inv.student.lastName}) présente un reste à payer de ${formatFCFA(inv.remaining)}, échue le ${inv.dueDate.toLocaleDateString('fr-FR')}.`,
        );
        notified++;
      }
    }
    await this.audit.record(user, 'REMIND', 'Invoice', '*', { after: { invoices: overdue.length, notified } });
    return { invoices: overdue.length, notified };
  }

  private async resolveCurrentYear(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    if (!year) throw new BadRequestException("Aucune année scolaire courante n'est configurée");
    return year.id;
  }

  async createInvoice(user: AuthUser, dto: CreateInvoiceDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");

    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId } });
    if (!student || student.schoolId !== user.schoolId) throw new NotFoundException('Élève introuvable');

    const academicYearId = await this.resolveCurrentYear(user.schoolId);
    const totalAmount = dto.items.reduce((sum, item) => sum + item.amount, 0);
    const reference = await this.sequences.invoiceReference(user.schoolId);

    const invoice = await this.prisma.invoice.create({
      data: {
        schoolId: user.schoolId,
        studentId: dto.studentId,
        academicYearId,
        reference,
        label: dto.label,
        totalAmount,
        dueDate: new Date(dto.dueDate),
        items: { create: dto.items },
      },
      include: { items: true, student: true },
    });
    await this.audit.record(user, 'CREATE', 'Invoice', invoice.id, { after: { reference, totalAmount } });
    return invoice;
  }

  async findAll(user: AuthUser, studentId?: string, status?: string) {
    if (!user.schoolId) return [];
    return this.prisma.invoice.findMany({
      where: {
        schoolId: user.schoolId,
        ...(studentId ? { studentId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { items: true, payments: true, student: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, payments: true, student: true },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable');
    if (invoice.schoolId !== user.schoolId) throw new ForbiddenException();
    return invoice;
  }

  async recordPayment(user: AuthUser, invoiceId: string, dto: RecordPaymentDto) {
    const invoice = await this.findOne(user, invoiceId);
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Cette facture est annulée');
    const alreadyPaid = invoice.payments.filter((p) => p.status === 'SUCCESS').reduce((s, p) => s + p.amount, 0);
    const remaining = invoice.totalAmount - alreadyPaid;
    // DB-08: no overpayment (typing error, double click on "Encaisser").
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException(
        remaining <= 0 ? 'Cette facture est déjà soldée' : `Montant supérieur au reste à payer (${formatFCFA(remaining)})`,
      );
    }

    const provider = this.paymentProviders.get(dto.method);
    const result = await provider.charge(dto.amount, invoice.reference);

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        studentId: invoice.studentId,
        amount: dto.amount,
        method: dto.method as any,
        status: result.status,
        reference: dto.reference ?? result.providerReference,
        receivedById: user.userId,
      },
    });

    const paidSoFar = await this.prisma.payment.aggregate({
      where: { invoiceId, status: 'SUCCESS' },
      _sum: { amount: true },
    });
    const totalPaid = paidSoFar._sum.amount ?? 0;

    const newStatus =
      totalPaid >= invoice.totalAmount ? 'PAID' : totalPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;

    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } });
    await this.audit.record(user, 'PAYMENT', 'Invoice', invoiceId, {
      after: { amount: dto.amount, method: dto.method, status: result.status, invoiceStatus: newStatus },
    });

    if (result.status === 'SUCCESS') {
      const parents = await this.prisma.parent.findMany({
        where: { students: { some: { id: invoice.studentId } }, userId: { not: null } },
      });
      for (const parent of parents) {
        await this.notifications.notify(
          parent.userId,
          'Paiement reçu',
          `Paiement de ${formatFCFA(dto.amount)} reçu pour la facture ${invoice.reference} (${invoice.student.firstName} ${invoice.student.lastName}).`,
        );
      }
    }

    return payment;
  }

  async studentBalance(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== user.schoolId) throw new ForbiddenException();

    const invoices = await this.prisma.invoice.findMany({
      where: { studentId },
      include: { payments: { where: { status: 'SUCCESS' } } },
    });

    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = invoices.reduce(
      (sum, inv) => sum + inv.payments.reduce((s, p) => s + p.amount, 0),
      0,
    );

    return { totalInvoiced, totalPaid, balance: totalInvoiced - totalPaid };
  }

  async financeStats(user: AuthUser) {
    if (!user.schoolId) return { totalInvoiced: 0, totalCollected: 0, outstanding: 0, recoveryRate: 0, collectedToday: 0 };

    // Aggregated in SQL (was: every invoice and payment loaded in memory on each dashboard view).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paidWhere = { status: 'SUCCESS' as const, invoice: { schoolId: user.schoolId } };
    const [invoiced, collected, collectedTodayAgg] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { schoolId: user.schoolId, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } }),
      this.prisma.payment.aggregate({ where: paidWhere, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { ...paidWhere, paidAt: { gte: today } }, _sum: { amount: true } }),
    ]);
    const totalInvoiced = invoiced._sum.totalAmount ?? 0;
    const totalCollected = collected._sum.amount ?? 0;
    const collectedToday = collectedTodayAgg._sum.amount ?? 0;

    return {
      totalInvoiced,
      totalCollected,
      outstanding: totalInvoiced - totalCollected,
      recoveryRate: totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 1000) / 10 : 0,
      collectedToday,
    };
  }
}
