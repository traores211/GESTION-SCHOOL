import { Body, Controller, Get, HttpCode, HttpStatus, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { FIELD, MANAGEMENT } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { MAX_SHEET_BYTES, SmartEntryService } from './smart-entry.service';

class TranscriptDto {
  @IsString()
  classId!: string;

  @IsString()
  @MinLength(2, { message: 'Aucune parole reçue' })
  @MaxLength(6000)
  transcript!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(100)
  maxScore?: number;
}

class SheetDto {
  @IsString()
  classId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(100)
  maxScore?: number;
}

/** Proposals only: these routes never record a roll call or a mark. */
@Controller('smart-entry')
@ApiTags('Smart entry')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SmartEntryController {
  constructor(private readonly smart: SmartEntryService) {}

  @Get('capabilities')
  @Roles(...FIELD)
  capabilities() {
    return { voice: true, image: this.smart.imageReading };
  }

  @Post('roll-call/parse')
  @Roles(...FIELD)
  @HttpCode(HttpStatus.OK)
  rollCall(@CurrentUser() user: AuthUser, @Body() dto: TranscriptDto) {
    return this.smart.rollCall(user, dto.classId, dto.transcript);
  }

  @Post('marks/parse')
  @Roles(...MANAGEMENT, 'ENSEIGNANT')
  @HttpCode(HttpStatus.OK)
  spokenMarks(@CurrentUser() user: AuthUser, @Body() dto: TranscriptDto) {
    return this.smart.spokenMarks(user, dto.classId, dto.transcript, dto.maxScore);
  }

  @Post('marks/image')
  @Roles(...MANAGEMENT, 'ENSEIGNANT')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SHEET_BYTES, files: 1 } }))
  sheetMarks(@CurrentUser() user: AuthUser, @Body() dto: SheetDto, @UploadedFile() file: { buffer: Buffer; size: number } | undefined) {
    return this.smart.sheetMarks(user, dto.classId, file, dto.maxScore);
  }
}
