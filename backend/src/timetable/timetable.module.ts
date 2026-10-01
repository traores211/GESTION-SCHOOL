import { Module } from '@nestjs/common';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';
import { TimetableImportService } from './import/import.service';
import { DOCUMENT_AI, DisabledDocumentAi } from './import/ai/document-ai';
import { ClaudeDocumentAi } from './import/ai/claude-document-ai';

@Module({
  controllers: [TimetableController],
  providers: [
    TimetableService,
    TimetableImportService,
    {
      provide: DOCUMENT_AI,
      useFactory: () => (process.env.ANTHROPIC_API_KEY ? new ClaudeDocumentAi() : new DisabledDocumentAi()),
    },
  ],
})
export class TimetableModule {}
