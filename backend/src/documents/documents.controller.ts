import { Body, Controller, Get, Header, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { RequirePermissions } from '../authz/decorators';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { RequireFeature } from '../platform/feature.guard';
import { DocumentsService } from './documents.service';

const CONTEXTS = ['STUDENT', 'STAFF', 'SCHOOL'];

class CreateTemplateDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MaxLength(60) type!: string;
  @IsIn(CONTEXTS) context!: string;
  @IsString() @MaxLength(100_000) content!: string;
}

class ContentDto {
  @IsString() @MaxLength(100_000) content!: string;
}

class AnalyzeDto extends ContentDto {
  @IsIn(CONTEXTS) context!: string;
}

class MappingDto {
  @IsString() @MaxLength(60) placeholder!: string;
  @IsString() @MaxLength(60) variable!: string;
}

class ApplyMappingsDto extends AnalyzeDto {
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => MappingDto) mappings!: MappingDto[];
}

class GenerateDto {
  @IsString() templateId!: string;
  @IsOptional() @IsString() subjectId?: string;
}

class PreviewDto extends GenerateDto {
  @IsOptional() @IsString() @MaxLength(100_000) content?: string;
}

@Controller('documents')
@ApiTags('Documents')
@ApiBearerAuth()
@RequireFeature('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @RequirePermissions('documents:read')
  @Get('variables')
  variables(@Query('context') context = 'STUDENT') {
    return this.service.variables(context);
  }

  @RequirePermissions('documents:read')
  @Get('templates')
  templates(@CurrentUser() user: AuthUser) {
    return this.service.templates(user);
  }

  @RequirePermissions('documents:read')
  @Get('templates/:id')
  template(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.template(user, id);
  }

  @RequirePermissions('documents:write')
  @Post('templates')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.service.createTemplate(user, dto);
  }

  @RequirePermissions('documents:write')
  @Put('templates/:id')
  saveVersion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ContentDto) {
    return this.service.saveVersion(user, id, dto.content);
  }

  @RequirePermissions('documents:write')
  @Post('analyze')
  analyze(@Body() dto: AnalyzeDto) {
    return this.service.analyze(dto.content, dto.context);
  }

  @RequirePermissions('documents:write')
  @Post('apply-mappings')
  applyMappings(@Body() dto: ApplyMappingsDto) {
    return this.service.applyMappings(dto.content, dto.mappings, dto.context);
  }

  @RequirePermissions('documents:read')
  @Post('preview')
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewDto) {
    return this.service.preview(user, dto.templateId, dto.subjectId, dto.content);
  }

  @RequirePermissions('documents:write')
  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateDto) {
    return this.service.generate(user, dto.templateId, dto.subjectId);
  }

  @RequirePermissions('documents:read')
  @Get()
  history(@CurrentUser() user: AuthUser, @Query('subjectId') subjectId?: string) {
    return this.service.history(user, subjectId);
  }

  /** Printable A4 HTML. Strict CSP: the document can never run a script, even if a template tried. */
  @RequirePermissions('documents:read')
  @Get(':id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; font-src https: data:")
  html(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.html(user, id);
  }
}
