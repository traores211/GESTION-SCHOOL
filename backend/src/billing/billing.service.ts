import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { PageQueryDto, pageArgs, pageResult } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { SequenceService } from '../infra/sequence.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PaymentProvidersRegistry } from './providers/payment-providers.registry';
import { cancelProblem, financeStats, invoiceStatus, paidAmount, paymentProblem, remaining } from './billing-math';

function formatFCFA(amount: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' FCFA';
}

const INVOICE_INCLUDE = { items: true, payments: { orderBy: { paidAt: 'asc' } }, student: true } satisfies Prisma.InvoiceInclude;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProvidersRegistry,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
  ) {}

  private requireSchool(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  private async resolveCurrentYear(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    if (!year) throw new BadRequestException("Aucune année scolaire courante n'est configurée");
    return year.id;
  }

  /** Invoice with its amounts already computed (paid, left to pay). */
  private present<T extends { totalAmount: number; payments: { amount: number; status: string; paidAt: Date }[] }>(invoice: T) {
    return { ...invoice, paidAmount: paidAmount(invoice.payments), remainingAmount: remaining(invoice.totalAmount, invoice.payments) };
  }

  async createInvoice(user: AuthUser, dto: CreateInvoiceDto) {
    const schoolId = this.requireSchool(user);
    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId } });
    if (!student || student.schoolId !== schoolId) throw new NotFoundException('Élève introuvable');
    if (student.archivedAt) throw new BadRequestException("Cet élève est archivé : restaurez-le avant de le facturer");

    const academicYearId = await this.resolveCurrentYear(schoolId);
    const totalAmount = dto.items.reduce((sum, item) => sum + item.amount, 0);
    const invoice = await this.prisma.$transaction(async (tx) => {
      // Platform-wide unique reference from an atomic counter (no collision between schools or users).
      const reference = await this.sequences.invoiceReference(tx);
      return tx.invoice.create({
        data: {
          schoolId,
          studentId: dto.studentId,
          academicYearId,
          reference,
          label: dto.label.trim(),
          totalAmount,
          dueDate: new Date(dto.dueDate),
          items: { create: dto.items.map((i) => ({ label: i.label.trim(), amount: i.amount })) },
        },
        include: INVOICE_INCLUDE,
      });
    });
    return this.present(invoice);
  }

  async findAll(user: AuthUser, studentId?: string, status?: string, page?: PageQueryDto) {
    if (!user.schoolId) return [];
    const where: Prisma.InvoiceWhereInput = {
      schoolId: user.schoolId,
      ...(studentId ? { studentId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(page?.q
        ? {
            OR: [
              { reference: { contains: page.q, mode: 'insensitive' } },
              { label: { contains: page.q, mode: 'insensitive' } },
              { student: { OR: [{ firstName: { contains: page.q, mode: 'insensitive' } }, { lastName: { contains: page.q, mode: 'insensitive' } }, { matricule: { contains: page.q, mode: 'insensitive' } }] } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({ where, include: INVOICE_INCLUDE, orderBy: { createdAt: 'desc' }, ...pageArgs(page) }),
      page?.page ? this.prisma.invoice.count({ where }) : Promise.resolve(0),
    ]);
    return pageResult(page, rows.map((r) => this.present(r)), total);
  }

  async findOne(user: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException('Facture introuvable');
    if (invoice.schoolId !== user.schoolId) throw new ForbiddenException();
    return this.present(invoice);
  }

  async recordPayment(user: AuthUser, invoiceId: string, dto: RecordPaymentDto) {
    const invoice = await this.findOne(user, invoiceId);
    const problem = paymentProblem(invoice, invoice.payments, dto.amount);
    if (problem) throw new BadRequestException(problem);

    const provider = this.paymentProviders.get(dto.method);
    const result = await provider.charge(dto.amount, invoice.reference);

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          invoiceId,
          studentId: invoice.studentId,
          amount: dto.amount,
          method: dto.method as never,
          status: result.status,
          reference: dto.reference ?? result.providerReference,
          receivedById: user.userId,
        },
      });
      await this.syncStatus(tx, invoiceId);
      return created;
    });

    if (result.status === 'SUCCESS') {
      const parents = await this.prisma.parent.findMany({ where: { students: { some: { id: invoice.studentId } }, userId: { not: null } } });
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

  /** Recomputes and stores the status of an invoice from its payments and due date. */
  async syncStatus(db: Prisma.TransactionClient | PrismaService, invoiceId: string) {
    const fresh = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
    const status = invoiceStatus(fresh, fresh.payments);
    if (status !== fresh.status) await db.invoice.update({ where: { id: invoiceId }, data: { status } });
    return status;
  }

  /** Cancels an unpaid invoice (kept for the accounts, never deleted). */
  async cancelInvoice(user: AuthUser, id: string, reason: string) {
    const invoice = await this.findOne(user, id);
    const problem = cancelProblem(invoice, invoice.payments);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason.trim() } });
    return this.findOne(user, id);
  }

  /** Refunds a payment: the line stays (status REFUNDED) and the invoice status is recomputed. */
  async refundPayment(user: AuthUser, paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
    if (!payment || payment.invoice.schoolId !== user.schoolId) throw new NotFoundException('Paiement introuvable');
    if (payment.status !== 'SUCCESS') throw new BadRequestException('Seul un paiement encaissé peut être remboursé');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: reason.trim(), refundedById: user.userId } });
      if (payment.invoice.status !== 'CANCELLED') {
        await tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: 'PENDING' } });
        await this.syncStatus(tx, payment.invoiceId);
      }
    });
    return this.findOne(user, payment.invoiceId);
  }

  /** Marks unpaid invoices past their due date as overdue (run daily by the scheduler, or on demand). */
  async refreshOverdue(schoolId?: string) {
    const result = await this.prisma.invoice.updateMany({
      where: { ...(schoolId ? { schoolId } : {}), status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() } },
      data: { status: 'OVERDUE' },
    });
    return result.count;
  }

  async studentBalance(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== user.schoolId) throw new ForbiddenException();
    const invoices = await this.prisma.invoice.findMany({ where: { studentId, status: { not: 'CANCELLED' } }, include: { payments: true } });
    const stats = financeStats(invoices);
    return { totalInvoiced: stats.totalInvoiced, totalPaid: stats.totalCollected, balance: stats.outstanding };
  }

  async financeStats(user: AuthUser) {
    if (!user.schoolId) return { totalInvoiced: 0, totalCollected: 0, outstanding: 0, recoveryRate: 0, collectedToday: 0 };
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId: user.schoolId },
      select: { totalAmount: true, status: true, payments: { select: { amount: true, status: true, paidAt: true } } },
    });
    return financeStats(invoices);
  }
}
