import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OFFICE } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ParentsService } from './parents.service';
import { CreateParentDto, GuardianLinkDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../common/pagination';

class ParentQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

@Controller('parents')
@ApiTags('Parents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OFFICE)
@ApiBearerAuth()
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateParentDto) {
    return this.parentsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() q: ParentQueryDto) {
    return this.parentsService.findAll(user, q.search, q);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parentsService.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateParentDto) {
    return this.parentsService.update(user, id, dto);
  }

  @Put(':id/students/:studentId')
  setLink(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string, @Body() dto: GuardianLinkDto) {
    return this.parentsService.setLink(user, id, studentId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parentsService.remove(user, id);
  }
}
