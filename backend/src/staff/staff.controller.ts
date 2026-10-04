import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsPositive } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { FINANCE, MANAGEMENT, OFFICE } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffProfileDto } from './dto/staff-profile.dto';

class StaffStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  status!: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

class UpdateSalaryDto {
  @IsNumber()
  @IsPositive()
  baseSalary!: number;
}

@Controller('staff')
@ApiTags('Staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OFFICE, 'COMPTABLE')
@ApiBearerAuth()
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Roles(...MANAGEMENT)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('role') role?: string, @Query('archived') archived?: string) {
    return this.staffService.findAll(user, role, archived === 'true');
  }

  @Roles(...MANAGEMENT)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StaffStatusDto) {
    return this.staffService.setStatus(user, id, dto.status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.findOne(user, id);
  }

  @Roles(...MANAGEMENT)
  @Patch(':id/profile')
  updateProfile(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StaffProfileDto) {
    return this.staffService.updateProfile(user, id, dto);
  }

  @Roles(...FINANCE)
  @Patch(':id/salary')
  updateSalary(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSalaryDto) {
    return this.staffService.updateSalary(user, id, dto.baseSalary);
  }

  @Roles(...MANAGEMENT)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.remove(user, id);
  }
}
