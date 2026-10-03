import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { captureError } from '../infra/monitoring';

/**
 * Last-resort error handler: HTTP errors pass through unchanged; anything unexpected is logged with
 * its stack, sent to Sentry, and answered with a 500 carrying the request id (never the stack).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string; user?: { userId?: string; schoolId?: string | null } }>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) captureError(exception, { requestId: req.id, userId: req.user?.userId, path: req.path, schoolId: req.user?.schoolId });
      const body = exception.getResponse();
      res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }
    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({ msg: error.message, stack: error.stack, requestId: req.id, path: req.path, userId: req.user?.userId });
    captureError(error, { requestId: req.id, userId: req.user?.userId, path: req.path, schoolId: req.user?.schoolId });
    if (res.headersSent) return;
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: `Erreur interne. Si elle se reproduit, communiquez cette référence au support : ${req.id?.slice(0, 8) ?? '—'}`,
      requestId: req.id,
    });
  }
}
