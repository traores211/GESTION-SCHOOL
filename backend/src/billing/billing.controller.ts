import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Controller('billing')
@ApiTags('Billing')
@ApiBearerAuth()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @RequirePermissions('billing:write')
  @Post('invoices')
  createInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(user, dto);
  }

  @RequirePermissions('billing:read')
  @Get('invoices')
  findAll(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.billingService.findAll(user, studentId, status);
  }

  @RequirePermissions('billing:read')
  @Get('invoices/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billingService.findOne(user, id);
  }

  @RequirePermissions('billing:write')
  @Post('invoices/:id/payments')
  recordPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.billingService.recordPayment(user, id, dto);
  }

  @RequirePermissions('billing:read')
  @Get('students/:studentId/balance')
  studentBalance(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.billingService.studentBalance(user, studentId);
  }

  @RequirePermissions('billing:read')
  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.billingService.financeStats(user);
  }
}
