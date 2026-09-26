import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process answers. */
  getHealth(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Readiness: dependencies answer (database). Used by the orchestrator and post-deployment smoke tests. */
  async getReadiness() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok', latencyMs: Date.now() - started, version: process.env.APP_VERSION ?? 'dev' };
    } catch {
      return { status: 'degraded', database: 'unreachable', latencyMs: Date.now() - started, version: process.env.APP_VERSION ?? 'dev' };
    }
  }
}
