import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { MailService } from './mail.service';
import { SequenceService } from './sequence.service';
import { StorageService } from './storage.service';

/** Shared infrastructure available everywhere: Redis (or memory fallback), e-mail, sequences, file storage. */
@Global()
@Module({
  providers: [RedisService, MailService, SequenceService, StorageService],
  exports: [RedisService, MailService, SequenceService, StorageService],
})
export class InfraModule {}
