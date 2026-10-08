import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MANAGEMENT, OFFICE } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PromotionService } from './promotion.service';
import { OUTCOMES, Outcome, YEAR_STATUSES } from './promotion-rules';

class YearStatusDto {
  @IsIn([...YEAR_STATUSES])
  status!: string;
}

class DecisionDto {
  @IsString()
  studentId!: string;

  @IsIn([...OUTCOMES])
  outcome!: Outcome;

  @IsOptional()
  @IsString()
  toClassId?: string;
}

class ReenrolDto {
  @IsString()
  classId!: string;
}

class RunDto {
  @IsString()
  classId!: string;

  @IsString()
  toYearId!: string;

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => DecisionDto)
  decisions!: DecisionDto[];

  /** Without it the request only says what would happen */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

@Controller()
@ApiTags('Promotion')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  @Patch('academic-years/:id/status')
  @Roles(...MANAGEMENT)
  setYearStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: YearStatusDto) {
    return this.promotion.setYearStatus(user, id, dto.status);
  }

  @Get('promotion/preview')
  @Roles(...MANAGEMENT)
  preview(@CurrentUser() user: AuthUser, @Query('classId') classId: string, @Query('toYearId') toYearId: string) {
    return this.promotion.preview(user, classId, toYearId);
  }

  /** Plan (no change) unless `confirm` is true. */
  @Post('promotion/run')
  @Roles(...MANAGEMENT)
  @HttpCode(HttpStatus.OK)
  run(@CurrentUser() user: AuthUser, @Body() dto: RunDto) {
    return this.promotion.run(user, dto.classId, dto.toYearId, dto.decisions, dto.confirm === true);
  }

  /** Re-enrols one known pupil in a class of an open year; his existing record is reused. */
  @Post('promotion/students/:studentId/reenrol')
  @Roles(...OFFICE)
  reenrol(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: ReenrolDto) {
    return this.promotion.reenrol(user, studentId, dto.classId);
  }

  @Get('promotion/history')
  @Roles(...MANAGEMENT)
  history(@CurrentUser() user: AuthUser) {
    return this.promotion.history(user);
  }

  @Get('promotion/students/:studentId')
  @Roles(...OFFICE)
  studentHistory(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.promotion.studentHistory(user, studentId);
  }
}
