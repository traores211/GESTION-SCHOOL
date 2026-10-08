import { Global, Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingScheduler } from './messaging.scheduler';
import { MessagingService } from './messaging.service';

/** SMS / WhatsApp to families; global so attendance, billing and admissions can send their events. */
@Global()
@Module({
  controllers: [MessagingController],
  providers: [MessagingService, MessagingScheduler],
  exports: [MessagingService, MessagingScheduler],
})
export class MessagingModule {}
