import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PayLinkDto } from '../billing/billing.controller';
import { OnlinePaymentService } from '../billing/online/online-payment.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ParentPortalService } from './parent-portal.service';

@Controller('parent-portal')
@ApiTags('Parent Portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARENT')
@ApiBearerAuth()
export class ParentPortalController {
  constructor(
    private readonly parentPortalService: ParentPortalService,
    private readonly onlinePayments: OnlinePaymentService,
  ) {}

  /** Online payment (Mobile Money, card) of an invoice of one of the parent's children. */
  @Post('invoices/:invoiceId/pay')
  pay(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string, @Body() dto: PayLinkDto) {
    return this.onlinePayments.linkForParent(user, invoiceId, dto.amount);
  }

  @Get('children')
  children(@CurrentUser() user: AuthUser) {
    return this.parentPortalService.children(user);
  }

  @Get('children/:studentId')
  childDetail(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.parentPortalService.childDetail(user, studentId);
  }
}
