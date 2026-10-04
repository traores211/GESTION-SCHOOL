import { Module } from '@nestjs/common';
import { SmartEntryController } from './smart-entry.controller';
import { SmartEntryService } from './smart-entry.service';

@Module({
  controllers: [SmartEntryController],
  providers: [SmartEntryService],
  exports: [SmartEntryService],
})
export class SmartEntryModule {}
