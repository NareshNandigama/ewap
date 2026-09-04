import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';

import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: ['amqp://ewap:ewap@localhost:5672'],
        queue: 'workflow-execution',
        queueOptions: {
          durable: true,
        },
        noAck: false, // Ensure messages are acknowledged after processing
      },
    },
  );

  await app.listen();
}

await bootstrap();