import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { DomainResolverService } from './domain-resolver.service';
import { DomainResolverMiddleware } from './domain-resolver.middleware';
import { HostController } from './host.controller';

/**
 * Custom domains for schools. Exports the resolver service so other modules can look up a tenant
 * from a hostname, and installs the resolver middleware on every route so each request carries
 * the resolved host context.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [DomainsController, HostController],
  providers: [DomainsService, DomainResolverService],
  exports: [DomainResolverService],
})
export class DomainsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DomainResolverMiddleware).forRoutes('*');
  }
}
