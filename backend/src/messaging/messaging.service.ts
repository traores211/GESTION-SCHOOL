import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { PageQueryDto, pageArgs, pageResult } from '../common/pagination';
import { Channel, SmsProvider, normalizePhone, providerFromEnv, smsSegments, toGsm } from '../infra/sms';
import { remaining } from '../billing/billing-math';

/** DISCIPLINE (exclusions, convocations) is off until a school switches it on in the messaging page. */
/** GATE (arrival and departure of the child) costs two messages per pupil and per day: off unless the school switches it on. */
export const MESSAGE_EVENTS = ['ABSENCE', 'OVERDUE', 'ADMISSION', 'PAYMENT', 'DISCIPLINE', 'GATE'] as const;
export type MessageEvent = (typeof MESSAGE_EVENTS)[number] | 'TEST';

export interface OutgoingMessage {
  schoolId: string;
  to: string | null | undefined;
  event: MessageEvent;
  text: string;
  studentId?: string;
  /** The same key is never sent twice. */
  dedupeKey?: string;
  channel?: Channel;
}

const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n)).replace(/\s/g, ' ')} FCFA`;

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** ISO-like week key ("2026-W40") used to send at most one reminder per invoice and week. */
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * SMS / WhatsApp messages to families. Every message goes through `send`: event switch of the
 * school, phone check, duplicate guard, monthly quota, then the provider; the outcome is journaled.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger('Messaging');
  private provider: SmsProvider = providerFromEnv();

  constructor(private readonly prisma: PrismaService) {}

  /** Tests swap the provider. */
  useProvider(provider: SmsProvider) {
    this.provider = provider;
  }

  private async usedThisMonth(schoolId: string) {
    const sum = await this.prisma.messageLog.aggregate({ where: { schoolId, status: 'SENT', createdAt: { gte: startOfMonth() } }, _sum: { segments: true } });
    return sum._sum.segments ?? 0;
  }

  async send(message: OutgoingMessage) {
    const school = await this.prisma.school.findUnique({ where: { id: message.schoolId }, select: { smsMonthlyQuota: true, smsEvents: true } });
    if (!school) return null;
    if (message.event !== 'TEST' && !school.smsEvents.split(',').includes(message.event)) return null;

    const channel: Channel = message.channel && this.provider.channels.includes(message.channel) ? message.channel : 'sms';
    const text = toGsm(message.text).slice(0, 459);
    const segments = smsSegments(text);
    const to = normalizePhone(message.to);
    const base = { schoolId: message.schoolId, channel, event: message.event, body: text, provider: this.provider.name, segments, studentId: message.studentId ?? null };

    if (message.dedupeKey && (await this.prisma.messageLog.findUnique({ where: { dedupeKey: message.dedupeKey }, select: { id: true } }))) return null;

    const log = async (data: { to: string; status: string; error?: string | null }) => {
      try {
        return await this.prisma.messageLog.create({ data: { ...base, ...data, dedupeKey: message.dedupeKey ?? null } });
      } catch (err) {
        // Two requests raced on the same key: the other one sent the message.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
        throw err;
      }
    };

    if (!to) return log({ to: (message.to ?? '').slice(0, 30) || '—', status: 'SKIPPED', error: 'Numéro de téléphone invalide ou absent' });
    if ((await this.usedThisMonth(message.schoolId)) + segments > school.smsMonthlyQuota) {
      return log({ to, status: 'SKIPPED', error: `Quota mensuel atteint (${school.smsMonthlyQuota} SMS)` });
    }

    // The journal line is written first: its unique key is what prevents a double send.
    const entry = await log({ to, status: 'SENT' });
    if (!entry) return null;
    const result = await this.provider.send(to, text, channel);
    if (!result.ok) {
      this.logger.warn(`${message.event} vers ${to} : ${result.error}`);
      return this.prisma.messageLog.update({ where: { id: entry.id }, data: { status: 'FAILED', error: (result.error ?? 'Échec').slice(0, 300) } });
    }
    return entry;
  }

  /** Same message to every guardian of a pupil who accepts SMS. */
  async sendToGuardians(studentId: string, event: MessageEvent, text: (student: { firstName: string; lastName: string }, schoolName: string) => string, dedupeKey?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { school: { select: { name: true } }, parents: { where: { archivedAt: null, smsOptOut: false } } },
    });
    if (!student) return 0;
    let sent = 0;
    for (const parent of student.parents) {
      const entry = await this.send({
        schoolId: student.schoolId,
        to: parent.phone,
        event,
        text: text(student, student.school.name),
        studentId,
        dedupeKey: dedupeKey ? `${dedupeKey}:${parent.id}` : undefined,
      });
      if (entry?.status === 'SENT') sent++;
    }
    return sent;
  }

  // ---------------------------------------------------------------- events

  absence(studentId: string, date: Date) {
    const day = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    return this.sendToGuardians(studentId, 'ABSENCE', (s, school) => `${school}: ${s.firstName} ${s.lastName} a ete note(e) absent(e) le ${label}. Merci de contacter l'etablissement pour justifier cette absence.`, `absence:${studentId}:${day}`);
  }

  paymentReceived(studentId: string, amount: number, reference: string, paymentId: string) {
    return this.sendToGuardians(studentId, 'PAYMENT', (s, school) => `${school}: paiement de ${fcfa(amount)} recu pour ${s.firstName} ${s.lastName} (facture ${reference}). Merci.`, `payment:${paymentId}`);
  }

  admissionConvocation(admission: { id: string; schoolId: string; firstName: string; lastName: string; guardianPhone: string | null; phone: string | null }, kind: 'test' | 'entretien', when: Date, schoolName: string) {
    const label = when.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' });
    return this.send({
      schoolId: admission.schoolId,
      to: admission.guardianPhone || admission.phone,
      event: 'ADMISSION',
      text: `${schoolName}: ${admission.firstName} ${admission.lastName} est convoque(e) ${kind === 'test' ? "au test d'admission" : 'a un entretien'} le ${label}. Merci de vous presenter 15 minutes avant.`,
      dedupeKey: `admission:${admission.id}:${kind}:${when.toISOString()}`,
    });
  }

  /**
   * Reminders for overdue invoices: one message per invoice, guardian and week. Run every morning by
   * the scheduler and on demand from the messaging page.
   */
  async overdueReminders(schoolId?: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { ...(schoolId ? { schoolId } : {}), status: 'OVERDUE', student: { archivedAt: null } },
      include: { payments: true },
    });
    const week = weekKey();
    let sent = 0;
    for (const invoice of invoices) {
      const left = remaining(invoice.totalAmount, invoice.payments);
      if (left <= 0) continue;
      const due = invoice.dueDate.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
      sent += await this.sendToGuardians(
        invoice.studentId,
        'OVERDUE',
        (s, school) => `${school}: rappel, ${fcfa(left)} restent a payer pour ${s.firstName} ${s.lastName} (facture ${invoice.reference}, echeance du ${due}). Merci de regulariser.`,
        `overdue:${invoice.id}:${week}`,
      );
    }
    return { invoices: invoices.length, sent };
  }

  // ---------------------------------------------------------------- administration

  private school(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  async status(user: AuthUser) {
    const schoolId = this.school(user);
    const [school, used, failed] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { smsMonthlyQuota: true, smsEvents: true } }),
      this.usedThisMonth(schoolId),
      this.prisma.messageLog.count({ where: { schoolId, status: 'FAILED', createdAt: { gte: startOfMonth() } } }),
    ]);
    return {
      provider: this.provider.name,
      /** With the "log" provider nothing is really sent: messages only appear in the journal. */
      live: this.provider.name !== 'log',
      channels: this.provider.channels,
      quota: school.smsMonthlyQuota,
      used,
      failed,
      events: school.smsEvents.split(',').filter(Boolean),
    };
  }

  async updateSettings(user: AuthUser, settings: { quota?: number; events?: string[] }) {
    const schoolId = this.school(user);
    await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        ...(settings.quota !== undefined ? { smsMonthlyQuota: settings.quota } : {}),
        ...(settings.events ? { smsEvents: MESSAGE_EVENTS.filter((e) => settings.events!.includes(e)).join(',') } : {}),
      },
    });
    return this.status(user);
  }

  async logs(user: AuthUser, page: PageQueryDto, status?: string, event?: string) {
    const where: Prisma.MessageLogWhereInput = {
      schoolId: this.school(user),
      ...(status ? { status } : {}),
      ...(event ? { event } : {}),
      ...(page.q ? { OR: [{ to: { contains: page.q } }, { body: { contains: page.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.messageLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs({ ...page, page: page.page ?? 1 }) }),
      this.prisma.messageLog.count({ where }),
    ]);
    return pageResult({ ...page, page: page.page ?? 1 }, rows, total);
  }

  async test(user: AuthUser, to: string, channel?: Channel) {
    const schoolId = this.school(user);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } });
    const entry = await this.send({ schoolId, to, event: 'TEST', text: `${school.name}: ceci est un message de test de School ERP.`, channel });
    if (!entry) throw new BadRequestException("Le message n'a pas pu être préparé");
    return entry;
  }
}
