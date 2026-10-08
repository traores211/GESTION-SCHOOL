import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { FIELD, MANAGEMENT, OFFICE } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { DOCUMENT_CATEGORIES, DocumentsService, MAX_DOCUMENT_BYTES, UploadedDocument } from './documents.service';

class TargetDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  /** User id of the staff member */
  @IsOptional()
  @IsString()
  staffUserId?: string;
}

class ListDto extends TargetDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: string;
}

class UploadDto extends TargetDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn([...DOCUMENT_CATEGORIES])
  category?: string;

  @IsOptional()
  @IsIn(['INTERNE', 'FAMILLE'])
  visibility?: 'INTERNE' | 'FAMILLE';

  @IsOptional()
  @IsDateString()
  documentDate?: string;
}

class UpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn([...DOCUMENT_CATEGORIES])
  category?: string;

  @IsOptional()
  @IsIn(['INTERNE', 'FAMILLE'])
  visibility?: 'INTERNE' | 'FAMILLE';

  @IsOptional()
  @IsIn(['ACTIF', 'ARCHIVE'])
  status?: 'ACTIF' | 'ARCHIVE';

  @IsOptional()
  @IsDateString()
  documentDate?: string;
}

function send(res: Response, file: { buffer: Buffer; mime: string; fileName: string }) {
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.buffer);
}

@Controller('documents')
@ApiTags('Documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // ---- families (declared first: "family" must not be read as a document id)

  @Get('family/:studentId')
  @Roles('PARENT', 'ELEVE')
  forFamily(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.documents.forFamily(user, studentId);
  }

  @Get('family/:studentId/:id/file')
  @Roles('PARENT', 'ELEVE')
  async familyFile(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('id') id: string, @Res() res: Response) {
    send(res, await this.documents.familyFile(user, studentId, id));
  }

  // ---- staff

  @Get()
  @Roles(...FIELD)
  list(@CurrentUser() user: AuthUser, @Query() q: ListDto) {
    return this.documents.list(user, q, q.archived === 'true');
  }

  @Post()
  @Roles(...OFFICE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadDto, @UploadedFile() file: UploadedDocument | undefined) {
    return this.documents.upload(user, dto, file);
  }

  @Post(':id/replace')
  @Roles(...OFFICE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  replace(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file: UploadedDocument | undefined) {
    return this.documents.replace(user, id, file);
  }

  @Patch(':id')
  @Roles(...OFFICE)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDto) {
    return this.documents.update(user, id, dto);
  }

  @Get(':id/file')
  @Roles(...FIELD)
  async file(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    send(res, await this.documents.file(user, id));
  }

  @Delete(':id')
  @Roles(...MANAGEMENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.remove(user, id);
  }
}
