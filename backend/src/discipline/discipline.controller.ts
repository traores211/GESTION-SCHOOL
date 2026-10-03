import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MANAGEMENT, TEACHING } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PageQueryDto } from '../common/pagination';
import { DISCIPLINE_KINDS, DisciplineKind, DisciplineService } from './discipline.service';

class CreateDisciplineDto {
  @IsString()
  studentId!: string;

  @IsDateString()
  date!: string;

  @IsIn(DISCIPLINE_KINDS)
  kind!: DisciplineKind;

  @IsString()
  @MinLength(3, { message: 'Indiquez le motif' })
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  sanction?: string;

  @IsOptional()
  @IsBoolean()
  visibleToParents?: boolean;
}

class UpdateDisciplineDto extends PartialType(OmitType(CreateDisciplineDto, ['studentId'] as const)) {}

class DisciplineQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsIn(DISCIPLINE_KINDS)
  kind?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

@Controller('discipline')
@ApiTags('Discipline')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...TEACHING)
@ApiBearerAuth()
export class DisciplineController {
  constructor(private readonly discipline: DisciplineService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDisciplineDto) {
    return this.discipline.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() q: DisciplineQueryDto) {
    return this.discipline.findAll(user, q, q);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.discipline.stats(user);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDisciplineDto) {
    return this.discipline.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(...MANAGEMENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.discipline.remove(user, id);
  }
}
