import { Module } from '@nestjs/common';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';
import { TimetableImportService } from './import/import.service';
import { DOCUMENT_AI, DisabledDocumentAi } from './import/ai/document-ai';
import { ClaudeDocumentAi } from './import/ai/claude-document-ai';
import { PlanningController } from './planning/planning.controller';
import { PlanningDataService } from './planning/planning-data.service';
import { PlanningService } from './planning/planning.service';
import { PlanningImportService } from './planning/planning-import.service';
import { TimetableExportService } from './planning/timetable-export.service';

@Module({
  controllers: [TimetableController, PlanningController],
  providers: [
    TimetableService,
    TimetableImportService,
    PlanningDataService,
    PlanningService,
    PlanningImportService,
    TimetableExportService,
    {
      provide: DOCUMENT_AI,
      useFactory: () => (process.env.ANTHROPIC_API_KEY ? new ClaudeDocumentAi() : new DisabledDocumentAi()),
    },
  ],
})
export class TimetableModule {}
