import { Body, Controller, Get, HttpCode, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { FINANCE, MANAGEMENT, OFFICE } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PageQueryDto } from '../common/pagination';
import { MESSAGE_EVENTS, MessagingService } from './messaging.service';

class LogQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['SENT', 'FAILED', 'SKIPPED'])
  status?: string;

  @IsOptional()
  @IsIn([...MESSAGE_EVENTS, 'TEST'])
  event?: string;
}

class SettingsDto {
  /** SMS per month (a long message counts for several). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  quota?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MESSAGE_EVENTS, { each: true })
  events?: string[];
}

class TestDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  to!: string;

  @IsOptional()
  @IsIn(['sms', 'whatsapp'])
  channel?: 'sms' | 'whatsapp';
}

@Controller('messaging')
@ApiTags('Messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OFFICE, 'COMPTABLE')
@ApiBearerAuth()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.messaging.status(user);
  }

  @Get('logs')
  logs(@CurrentUser() user: AuthUser, @Query() q: LogQueryDto) {
    return this.messaging.logs(user, q, q.status, q.event);
  }

  @Patch('settings')
  @Roles(...MANAGEMENT)
  settings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    return this.messaging.updateSettings(user, dto);
  }

  @Post('test')
  @Roles(...MANAGEMENT)
  test(@CurrentUser() user: AuthUser, @Body() dto: TestDto) {
    return this.messaging.test(user, dto.to, dto.channel);
  }

  /** Sends now the reminders of the overdue invoices of the school (at most one per invoice and week). */
  @Post('reminders/overdue')
  @HttpCode(200)
  @Roles(...FINANCE)
  overdue(@CurrentUser() user: AuthUser) {
    return this.messaging.overdueReminders(user.schoolId ?? '-');
  }
}
