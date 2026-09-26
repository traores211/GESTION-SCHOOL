import { Public } from './authz/decorators';
import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('Health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  getHealth() {
    return this.appService.getHealth();
  }

  @Public()
  @SkipThrottle()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness: database reachable' })
  async getReadiness(@Res({ passthrough: true }) res: Response) {
    const r = await this.appService.getReadiness();
    if (r.status !== 'ok') res.status(503);
    return r;
  }
}
