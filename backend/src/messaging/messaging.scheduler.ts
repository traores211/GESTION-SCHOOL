import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { MessagingService } from './messaging.service';

const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Daily jobs: every morning, unpaid invoices past their due date become "overdue" and families get
 * a reminder (one per invoice and week). A Redis lock makes several API instances run it only once.
 * Set SCHEDULER_ENABLED=false to switch it off (the reminders stay available on demand).
 */
@Injectable()
export class MessagingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Scheduler');
  private timer: NodeJS.Timeout | null = null;
  private readonly dailyJobs: { name: string; run: (now: Date) => Promise<void> }[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: RedisService,
    private readonly messaging: MessagingService,
  ) {}

  onModuleInit() {
    if (process.env.SCHEDULER_ENABLED === 'false' || process.env.JEST_WORKER_ID) return;
    this.timer = setInterval(() => void this.tick(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  /** Other modules add their own daily work here (weekly summary e-mail…); a failing job never stops the others. */
  registerDaily(name: string, run: (now: Date) => Promise<void>) {
    this.dailyJobs.push({ name, run });
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs the daily job once per day, between SCHEDULER_HOUR (default 8) and 18:00, server time. */
  async tick(now = new Date()) {
    const hour = now.getHours();
    if (hour < Number(process.env.SCHEDULER_HOUR || 8) || hour >= 18) return false;
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if ((await this.store.incr(`scheduler:daily:${day}`, 86400)) !== 1) return false;
    try {
      const result = await this.runDaily(now);
      this.logger.log(`Tâche quotidienne : ${result.overdue} facture(s) passée(s) en retard, ${result.sent} rappel(s) envoyé(s)`);
    } catch (err) {
      this.logger.error(`Tâche quotidienne en échec : ${(err as Error).message}`);
    }
    return true;
  }

  async runDaily(now = new Date()) {
    const { count } = await this.prisma.invoice.updateMany({
      where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });
    const { sent } = await this.messaging.overdueReminders();
    for (const job of this.dailyJobs) {
      await job.run(now).catch((err: Error) => this.logger.error(`Tâche « ${job.name} » en échec : ${err.message}`));
    }
    return { overdue: count, sent };
  }
}
