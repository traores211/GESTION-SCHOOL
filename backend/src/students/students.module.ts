import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentExtrasService } from './student-extras.service';

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, StudentExtrasService],
  exports: [StudentsService],
})
export class StudentsModule {}
