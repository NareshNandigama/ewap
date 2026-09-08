import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { MessagingService } from './messaging.service.js';

@Module({
  imports: [
    ConfigModule,

    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_SERVICE',

        imports: [ConfigModule],

        inject: [ConfigService],

        useFactory: (configService: ConfigService) => {
          const enabled =
            configService.get<boolean>('ENABLE_MESSAGING');

          if (!enabled) {
            return {
              transport: Transport.TCP,
              options: {
                host: 'localhost',
                port: 0,
              },
            };
          }

          return {
            transport: Transport.RMQ,

            options: {
              urls: [
                configService.get<string>('RABBITMQ_URL')!,
              ],

              queue:
                configService.get<string>('RABBITMQ_QUEUE')!,

              queueOptions: {
                durable: true,
                deadLetterExchange:
                  'workflow.dlq.exchange',
                deadLetterRoutingKey:
                  'workflow.dead',
              },
            },
          };
        },
      },
    ]),
  ],

  providers: [MessagingService],

  exports: [MessagingService],
})
export class MessagingModule {}