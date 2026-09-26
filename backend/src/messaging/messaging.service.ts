import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MessageProvider {
  readonly name: string;
  send(msg: { channel: 'EMAIL' | 'SMS'; to: string; subject?: string | null; body: string }): Promise<void>;
}

/**
 * Default provider: records the message as sent without contacting any operator. Used in
 * development and acceptance testing; a real SMTP / SMS aggregator provider plugs in here
 * (MESSAGE_PROVIDER env) without changing callers.
 */
class SimulatedProvider implements MessageProvider {
  readonly name = 'simulated';
  private readonly logger = new Logger('Messaging');
  async send(msg: { channel: string; to: string }) {
    // Recipient is masked in logs (personal data).
    this.logger.log(`[simulated] ${msg.channel} to ${msg.to.replace(/^(.{2}).*(@.*|.{2})$/, '$1***$2')}`);
  }
}

@Injectable()
export class MessagingService {
  private readonly provider: MessageProvider = new SimulatedProvider();

  constructor(private readonly prisma: PrismaService) {}

  /** Queues then delivers synchronously (a worker can take over the QUEUED rows later). */
  async send(schoolId: string | null, channel: 'EMAIL' | 'SMS', to: string, body: string, subject?: string) {
    const msg = await this.prisma.outboundMessage.create({
      data: { schoolId, channel, to, subject, body, provider: this.provider.name },
    });
    try {
      await this.provider.send({ channel, to, subject, body });
      return this.prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'SENT', sentAt: new Date() } });
    } catch (err) {
      return this.prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) },
      });
    }
  }

  list(schoolId: string, take = 100) {
    return this.prisma.outboundMessage.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 500),
      select: { id: true, channel: true, to: true, subject: true, status: true, createdAt: true, sentAt: true },
    });
  }
}
