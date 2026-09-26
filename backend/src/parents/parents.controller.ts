import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ParentsService } from './parents.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';

@Controller('parents')
@ApiTags('Parents')
@ApiBearerAuth()
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @RequirePermissions('parents:write')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateParentDto) {
    return this.parentsService.create(user, dto);
  }

  @RequirePermissions('parents:read')
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.parentsService.findAll(user, search);
  }

  @RequirePermissions('parents:read')
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parentsService.findOne(user, id);
  }

  @RequirePermissions('parents:write')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateParentDto) {
    return this.parentsService.update(user, id, dto);
  }

  @RequirePermissions('parents:write')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parentsService.remove(user, id);
  }
}
