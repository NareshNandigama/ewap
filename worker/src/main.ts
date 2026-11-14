import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { AppModule } from './app.module.js';

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

          deadLetterExchange: 'workflow.dlq.exchange',

          deadLetterRoutingKey: 'workflow.dead',
        },
        prefetchCount: 4,
        isGlobalPrefetchCount: false,
        noAck: false, // Ensure messages are acknowledged after processing
      },
    },
  );

  app.enableShutdownHooks();
  await app.listen();
}

await bootstrap();
