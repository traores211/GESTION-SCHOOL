import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Warm the connection pool: connections are otherwise opened lazily by the first requests,
    // which measured 3–4 s latency spikes right after a deployment (recette PF-01).
    const size = Number(process.env.DB_POOL_WARMUP) || 8;
    const t0 = Date.now();
    await Promise.all(Array.from({ length: size }, () => this.$queryRaw`SELECT 1`)).catch(() => undefined);
    new Logger('Prisma').log(`Connection pool warmed (${size} connections, ${Date.now() - t0} ms)`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
