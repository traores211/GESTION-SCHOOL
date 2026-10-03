import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { MailService } from './mail.service';

/** Shared infrastructure available everywhere: Redis (or memory fallback) and e-mail. */
@Global()
@Module({
  providers: [RedisService, MailService],
  exports: [RedisService, MailService],
})
export class InfraModule {}
