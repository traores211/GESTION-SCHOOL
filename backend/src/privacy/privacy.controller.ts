import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MANAGEMENT } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PrivacyService } from './privacy.service';

class PrivacySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  retentionYears?: number;

  @IsOptional()
  @ValidateIf((o: PrivacySettingsDto) => !!o.privacyContact)
  @IsEmail({}, { message: 'Adresse e-mail de contact invalide' })
  @MaxLength(120)
  privacyContact?: string;
}

class AnonymizeDto {
  @IsString()
  @MinLength(3, { message: 'Indiquez le motif (demande de la famille, fin de conservation…)' })
  @MaxLength(250)
  reason!: string;
}

/** Personal data rights: reserved to the management of the school; every call is in the audit journal. */
@Controller('privacy')
@ApiTags('Privacy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MANAGEMENT)
@ApiBearerAuth()
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.privacy.settings(user);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: PrivacySettingsDto) {
    return this.privacy.updateSettings(user, dto);
  }

  @Get('archived')
  archived(@CurrentUser() user: AuthUser, @Query('due') due?: string) {
    return this.privacy.archivedStudents(user, due === 'true');
  }

  @Get('students/:id/export')
  @Header('Cache-Control', 'no-store')
  export(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.privacy.exportStudent(user, id);
  }

  @Post('students/:id/anonymize')
  @HttpCode(200)
  anonymize(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AnonymizeDto) {
    return this.privacy.anonymizeStudent(user, id, dto.reason);
  }
}
