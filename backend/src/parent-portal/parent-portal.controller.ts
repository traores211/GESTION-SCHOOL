import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PayLinkDto } from '../billing/billing.controller';
import { OnlinePaymentService } from '../billing/online/online-payment.service';
import { sendBulletins } from '../bulletins/bulletins.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ParentPortalService } from './parent-portal.service';

class JustificationDto {
  @IsString()
  @MinLength(5, { message: "Expliquez le motif de l'absence en quelques mots" })
  @MaxLength(500)
  reason!: string;
}

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

  @Get('children/:studentId/bulletins')
  bulletins(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.parentPortalService.bulletins(user, studentId);
  }

  @Get('children/:studentId/bulletins/:termId/pdf')
  async bulletinPdf(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('termId') termId: string, @Res() res: Response) {
    const card = await this.parentPortalService.bulletinCard(user, studentId, termId);
    sendBulletins(res, [card], `bulletin-${card.student.matricule}-${card.term.name}.pdf`);
  }

  @Get('children/:studentId/timetable')
  timetable(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.parentPortalService.timetable(user, studentId);
  }

  @Post('children/:studentId/absences/:attendanceId/justify')
  @HttpCode(200)
  justify(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('attendanceId') attendanceId: string, @Body() dto: JustificationDto) {
    return this.parentPortalService.requestJustification(user, studentId, attendanceId, dto.reason);
  }
}
