import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';

class UpdateSalaryDto {
  @IsNumber()
  @IsPositive()
  baseSalary!: number;
}

@Controller('staff')
@ApiTags('Staff')
@ApiBearerAuth()
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @RequirePermissions('staff:write')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(user, dto);
  }

  @RequirePermissions('staff:read')
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('role') role?: string) {
    return this.staffService.findAll(user, role);
  }

  @RequirePermissions('staff:read')
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.findOne(user, id);
  }

  @RequirePermissions('payroll:write')
  @Patch(':id/salary')
  updateSalary(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSalaryDto) {
    return this.staffService.updateSalary(user, id, dto.baseSalary);
  }

  @RequirePermissions('staff:write')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.remove(user, id);
  }
}
