import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { GradesService } from '../grades/grades.service';

@Controller('bulletins')
@ApiTags('Bulletins')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BulletinsController {
  constructor(private readonly gradesService: GradesService) {}

  @Get(':studentId/:termId/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Param('termId') termId: string,
    @Res() res: Response,
  ) {
    const data = await this.gradesService.computeBulletin(user, studentId, termId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bulletin-${data.student.matricule}-${data.term}.pdf"`,
    );

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // Header
    doc.fillColor('#009A44').fontSize(20).text(data.school, { align: 'center' });
    doc.fillColor('#000').fontSize(14).text('BULLETIN DE NOTES', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Élève : ${data.student.firstName} ${data.student.lastName}`);
    doc.text(`Matricule : ${data.student.matricule}`);
    doc.text(`Classe : ${data.class}`);
    doc.text(`Période : ${data.term}`);
    doc.moveDown();

    // Table header
    const startX = doc.x;
    let y = doc.y;
    doc.fillColor('#F77F00').rect(startX, y, 500, 20).fill();
    doc.fillColor('#fff').fontSize(10);
    doc.text('Matière', startX + 5, y + 5, { width: 200 });
    doc.text('Coef.', startX + 210, y + 5, { width: 60 });
    doc.text('Moyenne / 20', startX + 280, y + 5, { width: 120 });
    doc.text('Enseignant', startX + 400, y + 5, { width: 100 });
    y += 20;

    doc.fillColor('#000');
    data.subjects.forEach((subject, index) => {
      const rowColor = index % 2 === 0 ? '#F5F5F5' : '#FFFFFF';
      doc.fillColor(rowColor).rect(startX, y, 500, 18).fill();
      doc.fillColor('#000').fontSize(9);
      doc.text(subject.subject, startX + 5, y + 4, { width: 200 });
      doc.text(String(subject.coefficient), startX + 210, y + 4, { width: 60 });
      doc.text(subject.average !== null ? subject.average.toFixed(2) : 'N/A', startX + 280, y + 4, { width: 120 });
      doc.text(subject.teacher || '-', startX + 400, y + 4, { width: 100 });
      y += 18;
    });

    doc.moveDown(2);
    doc.fontSize(12).fillColor('#009A44');
    doc.text(`Moyenne générale : ${data.overallAverage !== null ? data.overallAverage.toFixed(2) : 'N/A'} / 20`);
    doc.fillColor('#F77F00');
    doc.text(`Rang : ${data.rank ?? 'N/A'} / ${data.classSize}`);

    doc.moveDown(3);
    doc.fillColor('#666').fontSize(9).text('Document généré automatiquement par School ERP.', { align: 'center' });

    doc.end();
  }
}
