import { Body, Controller, Get, Param, Put, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MANAGEMENT, TEACHING } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { CouncilDecision } from '../grades/grade-math';
import { BulletinsService } from './bulletins.service';
import { Card, drawBulletin } from './bulletin-pdf';

class SaveCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  councilAppreciation?: string;

  @IsOptional()
  @ValidateIf((o: SaveCardDto) => o.decision !== null)
  @IsIn(['ADMIS', 'REDOUBLE', 'EXCLU'])
  decision?: CouncilDecision | null;

  /** { subjectId: appreciation } */
  @IsOptional()
  @IsObject()
  appreciations?: Record<string, string>;
}

export function sendBulletins(res: Response, cards: Card[], fileName: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\w.-]+/g, '-')}"`);
  const doc = new PDFDocument({ size: 'A4', margin: 36, autoFirstPage: false });
  doc.pipe(res);
  for (const card of cards) {
    doc.addPage();
    drawBulletin(doc, card);
  }
  doc.end();
}

@Controller('bulletins')
@ApiTags('Bulletins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...TEACHING)
@ApiBearerAuth()
export class BulletinsController {
  constructor(private readonly bulletins: BulletinsService) {}

  /** Class council sheet: every pupil with average, rank, distinction, absences, appreciation, decision. */
  @Get('class/:classId/:termId')
  classSheet(@CurrentUser() user: AuthUser, @Param('classId') classId: string, @Param('termId') termId: string) {
    return this.bulletins.classSheetView(user, classId, termId);
  }

  /** Every report card of the class in one PDF, ready to print. */
  @Get('class/:classId/:termId/pdf')
  async classPdf(@CurrentUser() user: AuthUser, @Param('classId') classId: string, @Param('termId') termId: string, @Res() res: Response) {
    const cards = await this.bulletins.classBulletins(user, classId, termId);
    sendBulletins(res, cards, `bulletins-${cards[0]?.class.name ?? 'classe'}-${cards[0]?.term.name ?? ''}.pdf`);
  }

  @Get('class/:classId/:termId/csv')
  @Roles(...MANAGEMENT, 'SECRETARY')
  async classCsv(@CurrentUser() user: AuthUser, @Param('classId') classId: string, @Param('termId') termId: string, @Res() res: Response) {
    const file = await this.bulletins.classCsv(user, classId, termId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.content);
  }

  @Get(':studentId/:termId/suggestion')
  suggestion(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('termId') termId: string) {
    return this.bulletins.suggestion(user, studentId, termId);
  }

  @Get(':studentId/:termId')
  bulletin(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('termId') termId: string) {
    return this.bulletins.bulletin(user, studentId, termId);
  }

  /** Council appreciation, subject appreciations and (management only) the end-of-year decision. */
  @Put(':studentId/:termId')
  @Roles(...MANAGEMENT, 'ENSEIGNANT')
  save(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('termId') termId: string, @Body() dto: SaveCardDto) {
    return this.bulletins.saveCard(user, studentId, termId, dto);
  }

  @Get(':studentId/:termId/pdf')
  async downloadPdf(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('termId') termId: string, @Res() res: Response) {
    const card = await this.bulletins.bulletin(user, studentId, termId);
    sendBulletins(res, [card], `bulletin-${card.student.matricule}-${card.term.name}.pdf`);
  }
}
