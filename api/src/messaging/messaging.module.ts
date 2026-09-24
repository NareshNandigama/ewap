import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';

import { MessagingService } from './messaging.service.js';

@Module({
  imports: [ConfigModule],

  providers: [
    {
      provide: 'RABBITMQ_SERVICE',
      inject: [ConfigService],
      useFactory: (configService: ConfigService): ClientProxy | undefined => {
        const enabled =
          configService.get<boolean>('ENABLE_MESSAGING') ?? true;

        if (!enabled) {
          return undefined;
        }

        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.getOrThrow<string>('RABBITMQ_URL'),
            ],
            queue:
              configService.getOrThrow<string>('RABBITMQ_QUEUE'),
            queueOptions: {
              durable: true,
              deadLetterExchange: 'workflow.dlq.exchange',
              deadLetterRoutingKey: 'workflow.dead',
            },
          },
        });
      },
    },

    MessagingService,
  ],

  exports: [MessagingService],
})
export class MessagingModule {}