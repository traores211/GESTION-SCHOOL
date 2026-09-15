import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PayrollService } from './payroll.service';
import { GeneratePayslipsDto } from './dto/generate-payslips.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';

function formatFCFA(amount: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' FCFA';
}

@Controller('payroll')
@ApiTags('Payroll')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GeneratePayslipsDto) {
    return this.payrollService.generate(user, dto.period);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('period') period?: string) {
    return this.payrollService.findAll(user, period);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser, @Query('period') period: string) {
    return this.payrollService.stats(user, period);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePayslipDto) {
    return this.payrollService.update(user, id, dto);
  }

  @Patch(':id/validate')
  validate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payrollService.validate(user, id);
  }

  @Patch(':id/pay')
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payrollService.pay(user, id);
  }

  @Get(':id/pdf')
  async downloadPdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const payslip = await this.payrollService.findOne(user, id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bulletin-paie-${payslip.period}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fillColor('#009A44').fontSize(20).text(payslip.school.name, { align: 'center' });
    doc.fillColor('#000').fontSize(14).text('BULLETIN DE PAIE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Employé : ${payslip.staffMember.user.firstName} ${payslip.staffMember.user.lastName}`);
    doc.text(`Poste : ${payslip.staffMember.position}`);
    doc.text(`Période : ${payslip.period}`);
    doc.moveDown();

    const startX = doc.x;
    let y = doc.y;
    doc.fillColor('#F77F00').rect(startX, y, 400, 20).fill();
    doc.fillColor('#fff').fontSize(10);
    doc.text('Élément', startX + 5, y + 5, { width: 250 });
    doc.text('Montant', startX + 260, y + 5, { width: 140 });
    y += 20;

    const rows = [
      ['Salaire de base', formatFCFA(payslip.baseSalary)],
      ['Primes', formatFCFA(payslip.bonuses)],
      ['Retenues', `- ${formatFCFA(payslip.deductions)}`],
    ];
    doc.fillColor('#000');
    rows.forEach(([label, value], index) => {
      const rowColor = index % 2 === 0 ? '#F5F5F5' : '#FFFFFF';
      doc.fillColor(rowColor).rect(startX, y, 400, 18).fill();
      doc.fillColor('#000').fontSize(9);
      doc.text(label, startX + 5, y + 4, { width: 250 });
      doc.text(value, startX + 260, y + 4, { width: 140 });
      y += 18;
    });

    doc.moveDown(2);
    doc.fontSize(13).fillColor('#009A44');
    doc.text(`Salaire net à payer : ${formatFCFA(payslip.netSalary)}`);
    doc.fillColor('#666').fontSize(9);
    doc.text(`Statut : ${payslip.status}${payslip.paidAt ? ` — payé le ${new Date(payslip.paidAt).toLocaleDateString('fr-FR')}` : ''}`);

    doc.moveDown(3);
    doc.fillColor('#666').fontSize(9).text('Document généré automatiquement par School ERP.', { align: 'center' });

    doc.end();
  }
}
