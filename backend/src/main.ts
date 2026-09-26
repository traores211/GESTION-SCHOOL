import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on port ${port}`);
}

bootstrap();
