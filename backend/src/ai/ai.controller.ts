import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { RequirePermissions } from '../authz/decorators';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { RequireFeature } from '../platform/feature.guard';
import { AiService } from './ai.service';
import { DataSourcesService } from './data-sources.service';

class TurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(4000) content!: string;
}

class ChatDto {
  @IsString() @MinLength(1) @MaxLength(2000) message!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TurnDto) history?: TurnDto[];
}

class ViewDto {
  @IsObject() spec!: Record<string, unknown>;
}

const aiLimit = { default: { limit: () => Number(process.env.AI_RATE_LIMIT) || 20, ttl: 60_000 } };

@Controller('ai')
@ApiTags('AI assistant')
@ApiBearerAuth()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly data: DataSourcesService,
  ) {}

  @RequirePermissions('ai:chat')
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.ai.status(user);
  }

  @RequirePermissions('ai:chat')
  @RequireFeature('ai.chat')
  @Throttle(aiLimit)
  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() dto: ChatDto) {
    return this.ai.chat(user, dto.message, dto.history);
  }

  @RequirePermissions('ai:chat')
  @Get('actions')
  pending(@CurrentUser() user: AuthUser) {
    return this.ai.pending(user);
  }

  @RequirePermissions('ai:chat')
  @Post('actions/:id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.confirm(user, id);
  }

  @RequirePermissions('ai:chat')
  @Post('actions/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.cancel(user, id);
  }

  // ---- Dynamic dashboards (schema-driven, no code) ----

  @RequirePermissions('views:write')
  @RequireFeature('ai.views')
  @Post('views/validate')
  validate(@CurrentUser() user: AuthUser, @Body() dto: ViewDto) {
    const errors = this.data.validate(user, dto.spec);
    return { valid: errors.length === 0, errors };
  }

  @RequirePermissions('views:write')
  @RequireFeature('ai.views')
  @Post('views')
  save(@CurrentUser() user: AuthUser, @Body() dto: ViewDto) {
    return this.data.save(user, dto.spec as never);
  }

  @RequirePermissions('views:write')
  @RequireFeature('ai.views')
  @Get('views')
  list(@CurrentUser() user: AuthUser) {
    return this.data.list(user);
  }

  @RequirePermissions('views:write')
  @RequireFeature('ai.views')
  @Get('views/:id/data')
  viewData(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.data.data(user, id);
  }

  @RequirePermissions('views:write')
  @RequireFeature('ai.views')
  @Delete('views/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.data.remove(user, id);
  }
}
