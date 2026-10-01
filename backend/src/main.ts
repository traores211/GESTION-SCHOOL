import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { UPLOAD_DIR } from './showcase/showcase.service';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Global API prefix (matches NEXT_PUBLIC_API_URL and Swagger routes)
  app.setGlobalPrefix('api');

  // Security headers. The API only serves JSON, PDFs and uploaded images: no CSP needed, but uploaded
  // images are displayed by the frontend (other origin), hence the cross-origin resource policy.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('School ERP API')
    .setDescription('School ERP Backend API Documentation')
    .setVersion('1.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
