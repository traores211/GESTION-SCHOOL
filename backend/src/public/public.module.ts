import { Module } from '@nestjs/common';
import { AdmissionsModule } from '../admissions/admissions.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [AdmissionsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
