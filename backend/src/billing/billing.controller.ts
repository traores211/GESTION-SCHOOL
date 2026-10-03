import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { FINANCE } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { OnlinePaymentService } from './online/online-payment.service';

export class PayLinkDto {
  /** Whole francs CFA; the remaining amount when omitted. */
  @IsOptional()
  @IsInt({ message: 'Montant en francs CFA entiers' })
  @IsPositive()
  amount?: number;
}

class InvoiceQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'])
  status?: string;
}

class ReasonDto {
  @IsString()
  @MinLength(3, { message: 'Indiquez le motif' })
  @MaxLength(500)
  reason!: string;
}

@Controller('billing')
@ApiTags('Billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCE, 'SECRETARY')
@ApiBearerAuth()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly onlinePayments: OnlinePaymentService,
  ) {}

  @Post('invoices')
  createInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(user, dto);
  }

  @Get('invoices')
  findAll(@CurrentUser() user: AuthUser, @Query() q: InvoiceQueryDto) {
    return this.billingService.findAll(user, q.studentId, q.status, q);
  }

  @Post('invoices/:id/cancel')
  @Roles(...FINANCE)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.billingService.cancelInvoice(user, id, dto.reason);
  }

  @Post('payments/:id/refund')
  @Roles(...FINANCE)
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.billingService.refundPayment(user, id, dto.reason);
  }

  @Get('invoices/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billingService.findOne(user, id);
  }

  @Post('invoices/:id/payments')
  recordPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.billingService.recordPayment(user, id, dto);
  }

  /** Payment link (Mobile Money, card) to send to the family; the amount defaults to what is left to pay. */
  @Post('invoices/:id/pay-link')
  payLink(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PayLinkDto) {
    return this.onlinePayments.linkForStaff(user, id, dto.amount);
  }

  /** Receipts journal or invoices issued over a period, as CSV for the accountant. */
  @Get('export/:kind')
  @Roles(...FINANCE)
  async export(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    if (kind !== 'payments' && kind !== 'invoices') throw new BadRequestException("Export inconnu : payments ou invoices");
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const isDay = (value: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
    if (!isDay(from) || !isDay(to) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Indiquez la période : from et to au format AAAA-MM-JJ');
    }
    if (end < start) throw new BadRequestException('La date de fin précède la date de début');
    if (end.getTime() - start.getTime() > 400 * 86400000) throw new BadRequestException('Période trop longue : 13 mois au maximum');
    const file = await this.billingService.accountingExport(user, kind, start, end);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.content);
  }

  @Get('students/:studentId/balance')
  studentBalance(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.billingService.studentBalance(user, studentId);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.billingService.financeStats(user);
  }
}
