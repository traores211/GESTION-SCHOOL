import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { GroupService, MEMBER_ROLES } from './group.service';

class SchoolDto {
  @IsString()
  @MinLength(3, { message: "Indiquez le nom de l'établissement" })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email?: string;
}

class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class MemberDto {
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email!: string;

  @IsIn([...MEMBER_ROLES])
  role!: (typeof MEMBER_ROLES)[number];
}

/** The schools of a group, managed by the group administrator from his own space. */
@Controller('group/schools')
@ApiTags('Group')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN_ORGANISATION')
@ApiBearerAuth()
export class GroupController {
  constructor(private readonly group: GroupService) {}

  @Get()
  schools(@CurrentUser() user: AuthUser) {
    return this.group.schools(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: SchoolDto) {
    return this.group.createSchool(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.group.updateSchool(user, id, dto);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.group.members(user, id);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MemberDto) {
    return this.group.addMember(user, id, dto);
  }

  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.group.removeMember(user, id, userId);
  }
}
