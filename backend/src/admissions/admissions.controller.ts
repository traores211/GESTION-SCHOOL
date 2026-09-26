import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AdmissionsService } from './admissions.service';
import { CreateAdmissionDto } from './dto/create-admission.dto';

class UpdateStatusDto {
  @IsString()
  status!: string;
}

@Controller('admissions')
@ApiTags('Admissions')
@ApiBearerAuth()
export class AdmissionsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

  @RequirePermissions('admissions:write')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAdmissionDto) {
    return this.admissionsService.create(user, dto);
  }

  @RequirePermissions('admissions:read')
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.admissionsService.findAll(user, status);
  }

  @RequirePermissions('admissions:read')
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admissionsService.findOne(user, id);
  }

  @RequirePermissions('admissions:write')
  @Patch(':id/status')
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.admissionsService.updateStatus(user, id, dto.status);
  }
}
