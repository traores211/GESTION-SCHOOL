import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PlatformService } from './platform.service';

/** Still allowed in read-only mode: signing in and out, security of the account, getting one's data out. */
const ALWAYS_ALLOWED = /^\/api\/(auth|payments|client-errors|public|privacy\/students\/[^/]+\/export)\b/;

/**
 * When a school's trial is over or its subscription is suspended, it keeps reading and exporting
 * its data but can no longer change it. Runs after authentication, on every write request.
 */
@Injectable()
export class SubscriptionInterceptor implements NestInterceptor {
  constructor(private readonly platform: PlatformService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<{ method: string; originalUrl: string; user?: { schoolId?: string | null; role?: string } }>();
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (write && req.user?.schoolId && req.user.role !== 'SUPER_ADMIN' && !ALWAYS_ALLOWED.test(req.originalUrl)) {
      const state = await this.platform.stateOfSchool(req.user.schoolId);
      if (state.readOnly) {
        throw new HttpException(
          { statusCode: 402, code: 'SUBSCRIPTION_REQUIRED', message: state.status === 'SUSPENDED' ? "L'abonnement de l'établissement est suspendu : les données restent consultables, mais ne peuvent plus être modifiées." : "La période d'essai est terminée : les données restent consultables. Contactez l'éditeur pour activer l'abonnement." },
          402,
        );
      }
    }
    return next.handle();
  }
}
