import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { SequenceService } from './sequence.service';

@Global()
@Module({
  providers: [AuditService, SequenceService],
  exports: [AuditService, SequenceService],
})
export class CommonModule {}
