import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ParentsService } from './parents.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';

@Controller('parents')
@ApiTags('Parents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateParentDto) {
    return this.parentsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.parentsService.findAll(user, search);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parentsService.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateParentDto) {
    return this.parentsService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parentsService.remove(user, id);
  }
}
