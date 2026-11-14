import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { loadLocalEnvironment } from './config/local-environment.js';

loadLocalEnvironment();

const { AppModule } = await import('./app.module.js');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.getOrThrow<string>('FRONTEND_URL'),
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(
    configService.getOrThrow<number>('PORT'),
    configService.getOrThrow<string>('HOST'),
  );
}

await bootstrap();
