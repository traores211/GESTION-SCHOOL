import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';

@Controller('staff')
@ApiTags('Staff')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('role') role?: string) {
    return this.staffService.findAll(user, role);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.findOne(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.remove(user, id);
  }
}
