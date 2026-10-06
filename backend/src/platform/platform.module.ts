import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { SubscriptionInterceptor } from './subscription.interceptor';
import { LifecycleService } from './lifecycle.service';
import { QuotaService } from './quota.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PlatformController, GroupController],
  providers: [PlatformService, GroupService, LifecycleService, QuotaService, { provide: APP_INTERCEPTOR, useClass: SubscriptionInterceptor }],
  exports: [PlatformService, GroupService, LifecycleService, QuotaService],
})
export class PlatformModule {}
