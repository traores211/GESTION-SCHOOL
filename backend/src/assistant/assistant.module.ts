import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AssistantController } from './assistant.controller';
import { AssistantToolsController } from './assistant-tools.controller';
import { AssistantService } from './assistant.service';
import { AssistantToolsService } from './assistant-tools.service';
import { ToolTokenGuard } from './tool-token';

/** Chatbot and agent backed by Dify; tools expose the user's school data to the agent. */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AssistantController, AssistantToolsController],
  providers: [AssistantService, AssistantToolsService, ToolTokenGuard],
})
export class AssistantModule {}
