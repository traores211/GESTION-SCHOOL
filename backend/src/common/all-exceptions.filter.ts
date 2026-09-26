import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Last line of defence: internal errors (Prisma, bugs) never reach the client with their
 * message or stack; known Prisma codes are mapped to meaningful HTTP statuses.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erreur interne. Réessayez ou contactez le support.';
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Cet élément existe déjà.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Élément introuvable.';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        message = "Opération impossible : l'élément est utilisé ailleurs.";
      }
    }

    // Log the technical cause server side only (no request body: it may hold personal data).
    const detail = exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception);
    this.logger.error(`${req?.method} ${req?.url} -> ${status} ${detail}`);
    res.status(status).json({ statusCode: status, message });
  }
}
