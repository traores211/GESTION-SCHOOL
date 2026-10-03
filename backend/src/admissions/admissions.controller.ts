import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OFFICE } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AdmissionsService, MAX_PIECE_BYTES } from './admissions.service';
import { AddPieceDto, AssignClassDto, CreateAdmissionDto, InterviewDto, NoteDto, PieceUpdateDto, TestDto, TransitionDto, UpdateAdmissionDto } from './dto/create-admission.dto';

class UpdateStatusDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

@Controller('admissions')
@ApiTags('Admissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OFFICE)
@ApiBearerAuth()
export class AdmissionsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAdmissionDto) {
    return this.admissionsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.admissionsService.findAll(user, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full dossier: identity, pieces, test, interview, class, timeline and available moves' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admissionsService.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAdmissionDto) {
    return this.admissionsService.update(user, id, dto);
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Move the application to another step (checked against the workflow rules)' })
  transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransitionDto) {
    return this.admissionsService.transition(user, id, dto.to, dto.reason, dto.note);
  }

  /** Former endpoint, kept for compatibility. */
  @Patch(':id/status')
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.admissionsService.updateStatus(user, id, dto.status, dto.reason);
  }

  @Post(':id/notes')
  addNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.admissionsService.addNote(user, id, dto);
  }

  @Post(':id/pieces')
  addPiece(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddPieceDto) {
    return this.admissionsService.addPiece(user, id, dto);
  }

  @Patch(':id/pieces/:pieceId')
  updatePiece(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('pieceId') pieceId: string, @Body() dto: PieceUpdateDto) {
    return this.admissionsService.updatePiece(user, id, pieceId, dto);
  }

  @Post(':id/pieces/:pieceId/file')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PIECE_BYTES, files: 1 } }))
  uploadPiece(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('pieceId') pieceId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
  ) {
    return this.admissionsService.uploadPiece(user, id, pieceId, file);
  }

  @Get(':id/pieces/:pieceId/file')
  async pieceFile(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('pieceId') pieceId: string, @Res() res: Response) {
    const file = await this.admissionsService.pieceFile(user, id, pieceId);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  }

  @Post(':id/test')
  recordTest(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TestDto) {
    return this.admissionsService.recordTest(user, id, dto);
  }

  @Post(':id/interview')
  recordInterview(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: InterviewDto) {
    return this.admissionsService.recordInterview(user, id, dto);
  }

  @Get(':id/classes')
  classOptions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admissionsService.classOptions(user, id);
  }

  @Post(':id/class')
  assignClass(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignClassDto) {
    return this.admissionsService.assignClass(user, id, dto);
  }
}
