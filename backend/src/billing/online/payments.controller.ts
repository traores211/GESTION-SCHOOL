import { All, Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { LoginRateLimiter } from '../../auth/login-rate-limiter';
import { OnlinePaymentService } from './online-payment.service';

class SimulateDto {
  @IsIn(['SUCCESS', 'FAILED'])
  outcome!: 'SUCCESS' | 'FAILED';

  @IsOptional()
  @IsString()
  method?: string;
}

/**
 * Public side of the payment links: the payer has no account, the gateway calls back without a
 * session. A payment is only ever marked as received after the gateway confirms it server to server.
 */
@Controller('payments')
@ApiTags('Online payments')
export class PaymentsController {
  constructor(
    private readonly payments: OnlinePaymentService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  private async throttle(req: Request) {
    if (!(await this.limiter.hit(`payments:${req.ip}`, 120, 600))) {
      throw new HttpException('Trop de requêtes. Réessayez dans quelques minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  @Get('config')
  config() {
    return this.payments.config();
  }

  /** CinetPay checks that the notification address answers before using it. */
  @Get('cinetpay/notify')
  notifyProbe() {
    return { ok: true };
  }

  @Post('cinetpay/notify')
  @HttpCode(200)
  @ApiOperation({ summary: 'CinetPay webhook (signed with the x-token header)' })
  notify(@Body() body: Record<string, unknown>, @Headers('x-token') token?: string) {
    return this.payments.cinetpayNotification(body ?? {}, token);
  }

  /** Where the gateway sends the payer back (GET or POST): the state is refreshed, then the web page is shown. */
  @All(':transactionId/return')
  async back(@Param('transactionId') transactionId: string, @Res() res: Response) {
    await this.payments.confirm(transactionId).catch(() => undefined);
    res.redirect(303, this.payments.pageUrl(transactionId));
  }

  @Get(':transactionId')
  async status(@Param('transactionId') transactionId: string, @Req() req: Request) {
    await this.throttle(req);
    return this.payments.publicStatus(transactionId);
  }

  /** The payment page polls this while the payer is on their phone. */
  @Post(':transactionId/refresh')
  @HttpCode(200)
  async refresh(@Param('transactionId') transactionId: string, @Req() req: Request) {
    await this.throttle(req);
    await this.payments.confirm(transactionId);
    return this.payments.publicStatus(transactionId);
  }

  @Post(':transactionId/simulate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Development only: plays the outcome of a simulated payment' })
  async simulate(@Param('transactionId') transactionId: string, @Body() dto: SimulateDto, @Req() req: Request) {
    await this.throttle(req);
    return this.payments.simulate(transactionId, dto.outcome, dto.method);
  }
}
