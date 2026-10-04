import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OFFICE, TEACHING } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PageQueryDto } from '../common/pagination';
import { GateService } from './gate.service';
import { GATE_METHODS, GateKind } from './gate-rules';

class GateEventDto {
  @IsString()
  studentId!: string;

  @IsOptional()
  @IsIn(['ENTREE', 'SORTIE'])
  kind?: GateKind;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accessPoint?: string;

  @IsOptional()
  @IsIn([...GATE_METHODS])
  method?: 'MANUEL' | 'QR' | 'BADGE';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsString()
  pickedUpParentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pickedUpBy?: string;
}

class ScanDto {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accessPoint?: string;
}

class GateQueryDto extends PageQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsIn(['ENTREE', 'SORTIE'])
  kind?: string;
}

@Controller('gate')
@ApiTags('Gate')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GateController {
  constructor(private readonly gate: GateService) {}

  @Get('family/:studentId')
  @Roles('PARENT', 'ELEVE')
  forFamily(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.gate.forFamily(user, studentId);
  }

  @Post('scan')
  @Roles(...TEACHING)
  @HttpCode(HttpStatus.OK)
  scan(@CurrentUser() user: AuthUser, @Body() dto: ScanDto) {
    return this.gate.scan(user, dto.token, dto.accessPoint);
  }

  @Post('events')
  @Roles(...TEACHING)
  record(@CurrentUser() user: AuthUser, @Body() dto: GateEventDto) {
    return this.gate.record(user, dto);
  }

  @Get('events')
  @Roles(...TEACHING)
  events(@CurrentUser() user: AuthUser, @Query() q: GateQueryDto) {
    return this.gate.events(user, q, q);
  }

  @Get('today')
  @Roles(...TEACHING)
  today(@CurrentUser() user: AuthUser) {
    return this.gate.today(user);
  }

  @Get('students/:studentId/pick-up')
  @Roles(...TEACHING)
  pickUp(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.gate.pickUp(user, studentId);
  }

  @Get('students/:studentId/card')
  @Roles(...OFFICE)
  card(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.gate.card(user, studentId);
  }

  /** A lost card: the former code stops working. */
  @Post('students/:studentId/card/renew')
  @Roles(...OFFICE)
  renewCard(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.gate.card(user, studentId, true);
  }
}
