import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + database reachability (the container healthcheck and the home page use it). */
  async getHealth(): Promise<{ status: string; database: string; timestamp: string }> {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return { status: database === 'up' ? 'ok' : 'degraded', database, timestamp: new Date().toISOString() };
  }
}
