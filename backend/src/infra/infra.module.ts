import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { MailService } from './mail.service';
import { SequenceService } from './sequence.service';
import { StorageService } from './storage.service';
import { TeacherScopeService } from '../common/teacher-scope.service';

/** Shared infrastructure available everywhere: Redis (or memory fallback), e-mail, sequences, file storage. */
@Global()
@Module({
  providers: [RedisService, MailService, SequenceService, StorageService, TeacherScopeService],
  exports: [RedisService, MailService, SequenceService, StorageService, TeacherScopeService],
})
export class InfraModule {}
