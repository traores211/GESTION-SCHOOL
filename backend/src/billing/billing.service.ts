import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PaymentProvidersRegistry } from './providers/payment-providers.registry';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProvidersRegistry,
  ) {}

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
    const count = await this.prisma.invoice.count({ where: { schoolId: user.schoolId } });
    const reference = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.invoice.create({
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

    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId: user.schoolId },
      include: { payments: { where: { status: 'SUCCESS' } } },
    });

    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalCollected = invoices.reduce(
      (sum, inv) => sum + inv.payments.reduce((s, p) => s + p.amount, 0),
      0,
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const collectedToday = invoices.reduce(
      (sum, inv) =>
        sum + inv.payments.filter((p) => p.paidAt >= today).reduce((s, p) => s + p.amount, 0),
      0,
    );

    return {
      totalInvoiced,
      totalCollected,
      outstanding: totalInvoiced - totalCollected,
      recoveryRate: totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 1000) / 10 : 0,
      collectedToday,
    };
  }
}
