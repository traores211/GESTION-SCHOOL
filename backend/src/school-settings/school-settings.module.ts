import { Module } from '@nestjs/common';
import { SchoolSettingsController } from './school-settings.controller';
import { SchoolSettingsService } from './school-settings.service';

@Module({
  controllers: [SchoolSettingsController],
  providers: [SchoolSettingsService],
  exports: [SchoolSettingsService],
})
export class SchoolSettingsModule {}
