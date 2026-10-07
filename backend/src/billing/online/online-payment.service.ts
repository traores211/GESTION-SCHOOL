import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/current-user.decorator';
import { RedisService } from '../../infra/redis.service';
import { BillingService } from '../billing.service';
import { paymentProblem, remaining } from '../billing-math';
import { CinetPayGateway, OnlineGateway, SimulatedGateway, cinetpayTokenValid } from './gateway';

/** A pending link for the same invoice and amount is reused for this long instead of creating another one. */
const LINK_REUSE_MINUTES = 30;
const MIN_ONLINE_AMOUNT = 100;

const SIMULATED_METHODS = ['MOBILE_MONEY_ORANGE', 'MOBILE_MONEY_MTN', 'MOBILE_MONEY_MOOV', 'WAVE'] as const;

/**
 * Payment links: a pending payment is created with a checkout page at the gateway; the payment only
 * becomes "received" once the gateway itself confirms it (webhook, then a server-to-server check).
 */
@Injectable()
export class OnlinePaymentService {
  private readonly logger = new Logger('OnlinePayment');
  private readonly gateway: OnlineGateway | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    store: RedisService,
  ) {
    const { CINETPAY_API_KEY: apiKey, CINETPAY_SITE_ID: siteId, CINETPAY_SECRET_KEY: secretKey } = process.env;
    if (apiKey && siteId && secretKey) {
      this.gateway = new CinetPayGateway({ apiKey, siteId, secretKey, baseUrl: process.env.CINETPAY_BASE_URL });
    } else if (process.env.NODE_ENV !== 'production') {
      this.gateway = new SimulatedGateway(store, this.frontendUrl);
    } else {
      this.gateway = null;
    }
  }

  private get frontendUrl() {
    return (process.env.FRONTEND_URL || 'http://localhost:1300').replace(/\/$/, '');
  }

  private get apiUrl() {
    return (process.env.API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
  }

  /** What the web app needs to show or hide the online payment buttons. */
  config() {
    return { enabled: !!this.gateway, provider: this.gateway?.name ?? null, simulated: this.gateway?.name === 'simulation' };
  }

  pageUrl(transactionId: string) {
    return `${this.frontendUrl}/pay/${encodeURIComponent(transactionId)}`;
  }

  /** Staff: payment link for an invoice of their school. */
  async linkForStaff(user: AuthUser, invoiceId: string, amount?: number) {
    const invoice = await this.billing.findOne(user, invoiceId);
    return this.createLink(invoice, amount, user.userId, {});
  }

  /** Parent: payment of an invoice of one of their children. */
  async linkForParent(user: AuthUser, invoiceId: string, amount?: number) {
    const parent = await this.prisma.parent.findUnique({ where: { userId: user.userId }, include: { students: { select: { id: true } } } });
    if (!parent) throw new NotFoundException('Aucun profil parent associé à ce compte');
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true, student: true } });
    if (!invoice || !parent.students.some((s) => s.id === invoice.studentId)) throw new ForbiddenException();
    return this.createLink(invoice, amount, user.userId, { name: `${parent.firstName} ${parent.lastName}`, phone: parent.phone, email: parent.email });
  }

  private async createLink(
    invoice: { id: string; reference: string; label: string; studentId: string; totalAmount: number | { toNumber(): number }; status: string; payments: { id: string; amount: number | { toNumber(): number }; status: string; paidAt: Date }[] },
    requested: number | undefined,
    initiatedById: string,
    customer: { name?: string; phone?: string; email?: string },
  ) {
    if (!this.gateway) throw new BadRequestException("Le paiement en ligne n'est pas configuré pour cet établissement");
    const amount = requested ?? remaining(invoice.totalAmount, invoice.payments);
    const problem = paymentProblem(invoice, invoice.payments, amount);
    if (problem) throw new BadRequestException(problem);
    if (amount < MIN_ONLINE_AMOUNT || amount % 5 !== 0) {
      throw new BadRequestException(`Le paiement en ligne accepte les montants multiples de 5 FCFA, à partir de ${MIN_ONLINE_AMOUNT} FCFA`);
    }

    const recent = await this.prisma.payment.findFirst({
      where: {
        invoiceId: invoice.id,
        status: 'PENDING',
        provider: this.gateway.name,
        amount,
        checkoutUrl: { not: null },
        createdAt: { gte: new Date(Date.now() - LINK_REUSE_MINUTES * 60000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return this.linkOf(recent);

    const transactionId = `PAY${Date.now().toString(36).toUpperCase()}${randomBytes(6).toString('hex').toUpperCase()}`;
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        transactionId,
        amount,
        // Placeholder until the gateway tells which wallet paid.
        method: 'MOBILE_MONEY_ORANGE',
        status: 'PENDING',
        provider: this.gateway.name,
        receivedById: initiatedById,
        reference: invoice.reference,
      },
    });
    try {
      const { checkoutUrl } = await this.gateway.createCheckout({
        transactionId,
        amount,
        description: `${invoice.reference} ${invoice.label}`,
        customer,
        notifyUrl: `${this.apiUrl}/payments/cinetpay/notify`,
        returnUrl: `${this.apiUrl}/payments/${transactionId}/return`,
      });
      return this.linkOf(await this.prisma.payment.update({ where: { id: payment.id }, data: { checkoutUrl } }));
    } catch (err) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      this.logger.error(`Création du paiement ${transactionId} impossible : ${(err as Error).message}`);
      throw new BadGatewayException("Le service de paiement est indisponible pour l'instant. Réessayez dans quelques minutes.");
    }
  }

  private linkOf(payment: { transactionId: string; amount: number | { toNumber(): number }; checkoutUrl: string | null; provider: string | null }) {
    return {
      transactionId: payment.transactionId,
      amount: Number(payment.amount),
      provider: payment.provider,
      /** Gateway checkout page (where the money is actually paid). */
      checkoutUrl: payment.checkoutUrl,
      /** Page of the web app to share: it shows the state and sends to the checkout page. */
      shareUrl: this.pageUrl(payment.transactionId),
    };
  }

  private async online(transactionId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { transactionId },
      include: { invoice: { include: { school: { select: { name: true } }, student: { select: { firstName: true, lastName: true } } } } },
    });
    if (!payment || !payment.provider) throw new NotFoundException('Paiement introuvable');
    return payment;
  }

  /** Public view of a payment link: nothing more than what the payer needs to recognise the bill. */
  async publicStatus(transactionId: string) {
    const p = await this.online(transactionId);
    return {
      transactionId: p.transactionId,
      status: p.status,
      amount: Number(p.amount),
      invoiceReference: p.invoice.reference,
      label: p.invoice.label,
      schoolName: p.invoice.school.name,
      studentName: `${p.invoice.student.firstName} ${p.invoice.student.lastName.charAt(0)}.`,
      paidAt: p.status === 'SUCCESS' ? p.paidAt : null,
      simulated: p.provider === 'simulation',
      checkoutUrl: p.status === 'PENDING' && p.provider !== 'simulation' ? p.checkoutUrl : null,
    };
  }

  /**
   * Asks the gateway for the real state of a pending payment and records it. Safe to call several
   * times (webhook retries, payer refreshing the page): only the first confirmation has an effect.
   */
  async confirm(transactionId: string) {
    const payment = await this.online(transactionId);
    if (payment.status !== 'PENDING') return payment.status;
    if (!this.gateway || this.gateway.name !== payment.provider) return payment.status;

    const verdict = await this.gateway.verify(transactionId);
    if (verdict.status === 'PENDING') return 'PENDING';

    if (verdict.status === 'SUCCESS' && verdict.amount !== undefined && Math.round(verdict.amount) !== Math.round(Number(payment.amount))) {
      this.logger.error(`Paiement ${transactionId} : montant confirmé ${verdict.amount} différent du montant attendu ${payment.amount}`);
      await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      return 'FAILED';
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status: verdict.status,
          ...(verdict.status === 'SUCCESS' ? { paidAt: new Date() } : {}),
          ...(verdict.method ? { method: verdict.method as never } : {}),
          ...(verdict.phone ? { payerPhone: verdict.phone } : {}),
        },
      });
      if (count && verdict.status === 'SUCCESS') await this.billing.syncStatus(tx, payment.invoiceId);
      return count > 0;
    });
    if (updated && verdict.status === 'SUCCESS') {
      await this.billing.notifyPaymentReceived(payment.invoiceId, Number(payment.amount), payment.id).catch((err: Error) => this.logger.warn(`Notification du paiement ${transactionId} : ${err.message}`));
    }
    return verdict.status;
  }

  /** CinetPay notification: the signature is checked, then the state is read back from CinetPay. */
  async cinetpayNotification(body: Record<string, unknown>, token: string | undefined) {
    if (this.gateway?.name !== 'cinetpay') throw new NotFoundException();
    if (!cinetpayTokenValid(body, token, process.env.CINETPAY_SECRET_KEY!) || String(body.cpm_site_id) !== process.env.CINETPAY_SITE_ID) {
      this.logger.warn(`Notification CinetPay refusée (signature invalide) pour ${String(body.cpm_trans_id)}`);
      throw new ForbiddenException('Signature invalide');
    }
    const transactionId = String(body.cpm_trans_id ?? '');
    const known = await this.prisma.payment.findUnique({ where: { transactionId }, select: { id: true } });
    if (!known) return { received: true };
    await this.confirm(transactionId);
    return { received: true };
  }

  /** Development and tests only: plays the gateway's answer for a simulated payment. */
  async simulate(transactionId: string, outcome: 'SUCCESS' | 'FAILED', method?: string) {
    if (!(this.gateway instanceof SimulatedGateway)) throw new NotFoundException();
    const payment = await this.online(transactionId);
    if (payment.provider !== 'simulation') throw new NotFoundException();
    const wallet = SIMULATED_METHODS.find((m) => m === method) ?? 'MOBILE_MONEY_ORANGE';
    const current = await this.gateway.verify(transactionId);
    if (current.status === 'PENDING') await this.gateway.decide(transactionId, outcome, wallet, '+2250700000000');
    await this.confirm(transactionId);
    return this.publicStatus(transactionId);
  }
}
