import { Global, Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

/**
 * Fine-grained permissions on top of the roles. Exported globally so any controller may use the
 * `@RequirePermissions(...)` decorator and the `PermissionsGuard` without extra imports.
 */
@Global()
@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
