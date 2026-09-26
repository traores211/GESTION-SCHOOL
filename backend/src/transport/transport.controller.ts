import { RequireFeature } from '../platform/feature.guard';
import { RequirePermissions } from '../authz/decorators';
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { TransportService } from './transport.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { CreateRouteDto } from './dto/create-route.dto';

@Controller('transport')
@ApiTags('Transport')
@ApiBearerAuth()
@RequireFeature('transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @RequirePermissions('transport:write')
  @Post('vehicles')
  createVehicle(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.transportService.createVehicle(user, dto);
  }

  @RequirePermissions('transport:read')
  @Get('vehicles')
  findVehicles(@CurrentUser() user: AuthUser) {
    return this.transportService.findVehicles(user);
  }

  @RequirePermissions('transport:write')
  @Post('vehicles/:id/ping')
  pingVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportService.pingVehicle(user, id);
  }

  @RequirePermissions('transport:write')
  @Delete('vehicles/:id')
  removeVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportService.removeVehicle(user, id);
  }

  @RequirePermissions('transport:write')
  @Post('routes')
  createRoute(@CurrentUser() user: AuthUser, @Body() dto: CreateRouteDto) {
    return this.transportService.createRoute(user, dto);
  }

  @RequirePermissions('transport:read')
  @Get('routes')
  findRoutes(@CurrentUser() user: AuthUser) {
    return this.transportService.findRoutes(user);
  }

  @RequirePermissions('transport:read')
  @Get('routes/:id')
  findRoute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportService.findRoute(user, id);
  }

  @RequirePermissions('transport:write')
  @Delete('routes/:id')
  removeRoute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportService.removeRoute(user, id);
  }

  @RequirePermissions('transport:write')
  @Post('routes/:id/subscribe/:studentId')
  subscribe(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.transportService.subscribe(user, id, studentId);
  }

  @RequirePermissions('transport:write')
  @Post('routes/:id/unsubscribe/:studentId')
  unsubscribe(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.transportService.unsubscribe(user, id, studentId);
  }
}
