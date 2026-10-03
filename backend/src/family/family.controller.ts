import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OFFICE, TEACHING } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PageQueryDto } from '../common/pagination';
import { FamilyService } from './family.service';

class HomeworkDto {
  @IsString()
  classId!: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsString()
  @MinLength(3, { message: 'Indiquez le travail à faire' })
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  dueDate!: string;
}

class MessageDto {
  @IsString()
  @MinLength(2, { message: 'Le message est vide' })
  @MaxLength(4000)
  body!: string;
}

class OpenConversationDto extends MessageDto {
  @IsString()
  studentId!: string;

  @IsString()
  @MinLength(3, { message: "Indiquez l'objet du message" })
  @MaxLength(120)
  subject!: string;
}

class ConversationQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: string;
}

@Controller()
@ApiTags('Families')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  // ---- homework diary (staff)

  @Post('homework')
  @Roles(...TEACHING)
  createHomework(@CurrentUser() user: AuthUser, @Body() dto: HomeworkDto) {
    return this.family.createHomework(user, dto);
  }

  @Get('homework')
  @Roles(...TEACHING)
  listHomework(@CurrentUser() user: AuthUser, @Query('classId') classId?: string) {
    return this.family.listHomework(user, classId);
  }

  @Delete('homework/:id')
  @Roles(...TEACHING)
  removeHomework(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.family.removeHomework(user, id);
  }

  // ---- conversations (office)

  @Get('conversations')
  @Roles(...OFFICE)
  conversations(@CurrentUser() user: AuthUser, @Query() q: ConversationQueryDto) {
    return this.family.conversations(user, q, q.status);
  }

  @Get('conversations/:id')
  @Roles(...OFFICE)
  conversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.family.conversation(user, id);
  }

  @Post('conversations/:id/messages')
  @Roles(...OFFICE)
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MessageDto) {
    return this.family.staffReply(user, id, dto.body);
  }

  @Patch('conversations/:id/close')
  @Roles(...OFFICE)
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.family.closeConversation(user, id);
  }

  // ---- parent portal

  @Get('parent-portal/children/:studentId/homework')
  @Roles('PARENT')
  homework(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.family.homeworkForChild(user, studentId);
  }

  @Get('parent-portal/conversations')
  @Roles('PARENT')
  parentConversations(@CurrentUser() user: AuthUser) {
    return this.family.parentConversations(user);
  }

  @Post('parent-portal/conversations')
  @Roles('PARENT')
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenConversationDto) {
    return this.family.openConversation(user, dto);
  }

  @Get('parent-portal/conversations/:id')
  @Roles('PARENT')
  parentConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.family.parentConversation(user, id);
  }

  @Post('parent-portal/conversations/:id/messages')
  @HttpCode(200)
  @Roles('PARENT')
  parentReply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MessageDto) {
    return this.family.parentReply(user, id, dto.body);
  }
}
