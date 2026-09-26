import { Authenticated } from '../authz/decorators';
import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

@Controller('users')
@ApiTags('Users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Authenticated()
  @Get('me')
  @ApiBearerAuth()
  me(@Req() req: any) {
    return this.usersService.findById(req.user.userId);
  }
}
