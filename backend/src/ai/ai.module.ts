import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { ClassesModule } from '../classes/classes.module';
import { BillingModule } from '../billing/billing.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { TimetableModule } from '../timetable/timetable.module';
import { DocumentsModule } from '../documents/documents.module';
import { SchoolSettingsModule } from '../school-settings/school-settings.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DataSourcesService } from './data-sources.service';
import { AnthropicLlmClient, isAiConfigured, LLM_CLIENT } from './llm-client';

@Module({
  imports: [StudentsModule, ClassesModule, BillingModule, AttendanceModule, TimetableModule, DocumentsModule, SchoolSettingsModule],
  controllers: [AiController],
  providers: [
    AiService,
    DataSourcesService,
    // No client at all when AI is not configured: the endpoints answer 503 with a clear message.
    { provide: LLM_CLIENT, useFactory: () => (isAiConfigured() ? new AnthropicLlmClient() : undefined) },
  ],
})
export class AiModule {}
