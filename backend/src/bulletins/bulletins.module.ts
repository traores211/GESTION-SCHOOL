import { Module } from '@nestjs/common';
import { GradesModule } from '../grades/grades.module';
import { BulletinsController } from './bulletins.controller';

@Module({
  imports: [GradesModule],
  controllers: [BulletinsController],
})
export class BulletinsModule {}
