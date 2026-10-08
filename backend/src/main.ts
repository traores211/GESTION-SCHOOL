import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { assertEnv } from './infra/env';
import { createLogger } from './infra/logger';
import { initMonitoring } from './infra/monitoring';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppModule } from './app.module';
import { UPLOAD_DIR } from './showcase/showcase.service';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

async function bootstrap() {
  // Production refuses missing secrets and docker-compose defaults.
  assertEnv();
  initMonitoring();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: createLogger(), bufferLogs: true });

  // Global API prefix (matches NEXT_PUBLIC_API_URL and Swagger routes)
  app.setGlobalPrefix('api');
  // Behind nginx / a load balancer: real client IP for rate limits and audit.
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
  // Refresh token cookie (HttpOnly) for /api/auth/refresh and /logout.
  app.use(cookieParser());

  // Security headers. The API serves JSON, PDFs and uploaded images (showcase, pupils, staff).
  // CSP is strict for the API itself: no inline scripts, no eval, images allowed from same origin
  // and from data: URLs (QR codes, charts). The frontend (Next.js, another origin) sets its own
  // CSP; here we care about the API routes and the Swagger page served by Nest.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI needs inline scripts.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Showcase images uploaded from the back-office (validated raster images, random names)
  app.useStaticAssets(UPLOAD_DIR, {
    prefix: '/api/uploads/',
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Catch-all first, specific filters after (Nest tries the most specific matching filter).
  app.useGlobalFilters(new AllExceptionsFilter(), new PrismaExceptionFilter());
  app.enableShutdownHooks();

  // API documentation: on in development, off in production unless SWAGGER_ENABLED=true.
  const swagger = process.env.SWAGGER_ENABLED ? process.env.SWAGGER_ENABLED === 'true' : process.env.NODE_ENV !== 'production';
  if (swagger) {
    const config = new DocumentBuilder()
      .setTitle('School ERP API')
      .setDescription('School ERP Backend API Documentation')
      .setVersion('1.2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`Server running on http://localhost:${port}`);
  if (swagger) logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
