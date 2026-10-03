import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Get('students/:studentId/balance')
  studentBalance(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.billingService.studentBalance(user, studentId);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.billingService.financeStats(user);
  }
}
