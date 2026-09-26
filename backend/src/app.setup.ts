import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * Allowed browser origins: FRONTEND_URL, CORS_ORIGINS (comma separated) and any sub-domain of
 * PLATFORM_DOMAIN (one sub-domain per school, e.g. ecole-demo.plateforme.com).
 */
export function isAllowedOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return true; // same-origin, curl, server-to-server
  const explicit = [env.FRONTEND_URL || 'http://localhost:3000', ...(env.CORS_ORIGINS || '').split(',')]
    .map((o) => o.trim())
    .filter(Boolean);
  if (explicit.includes(origin)) return true;
  const domain = env.PLATFORM_DOMAIN?.trim();
  if (!domain) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    const secure = protocol === 'https:' || env.NODE_ENV !== 'production';
    return secure && (hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/** Shared by main.ts and the integration tests, so tests exercise the real HTTP configuration. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
    exposedHeaders: ['X-Total-Count'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // API documentation is an attack map: never exposed in production unless explicitly enabled.
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('GESTION SCHOOL API')
      .setDescription('API de la plateforme GESTION SCHOOL')
      .setVersion('1.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  } else {
    new Logger('Bootstrap').log('Swagger disabled (production)');
  }
}
