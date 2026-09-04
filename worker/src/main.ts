import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';

import { AppModule } from './app.module.js';
import { Channel } from 'amqplib';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL!],
        queue: process.env.RABBITMQ_QUEUE!,

        queueOptions: {
          durable: true,

          deadLetterExchange:
            'workflow.dlq.exchange',

          deadLetterRoutingKey:
            'workflow.dead',
        },
        noAck: false, // Ensure messages are acknowledged after processing
      },
    },
  );

  await app.listen();
}

await bootstrap();