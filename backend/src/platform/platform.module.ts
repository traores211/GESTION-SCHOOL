import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { SubscriptionInterceptor } from './subscription.interceptor';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService, { provide: APP_INTERCEPTOR, useClass: SubscriptionInterceptor }],
  exports: [PlatformService],
})
export class PlatformModule {}
