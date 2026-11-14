// Joi conditional schemas use the documented `then` option.
/* oxlint-disable unicorn/no-thenable */
import Joi from 'joi';

const productionRequired = Joi.string().when('NODE_ENV', {
  is: 'production',
  then: Joi.required(),
  otherwise: Joi.optional(),
});

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production')
    .default('development'),
  HOST: Joi.string().hostname().default('0.0.0.0'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  APP_NAME: Joi.string().default('EWAP API'),
  APP_VERSION: Joi.string().default('1.0.0'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  DB_SSL_MODE: Joi.string().valid('verify-full', 'disable').optional(),
  DB_CA_CERT: Joi.string().optional(),
  DB_HOST: productionRequired,
  DB_PORT: Joi.number().integer().min(1).max(65535).default(5432),
  DB_NAME: productionRequired,
  DB_USER: productionRequired,
  DB_PASSWORD: productionRequired,
  JWT_SECRET: Joi.string().required(),
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  REDIS_URL: Joi.string().optional(),
  AI_DIAGNOSTICS_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional(),
  AI_SERVICE_API_KEY: Joi.string()
    .pattern(/^[\x21-\x7e]{32,512}$/)
    .optional(),
  WORKER_STATUS_API_KEY: Joi.string()
    .pattern(/^[\x21-\x7e]{32,512}$/)
    .optional(),
  AI_DIAGNOSTICS_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(30000)
    .default(3000),
  ENABLE_MESSAGING: Joi.boolean().default(true),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .when('ENABLE_MESSAGING', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  RABBITMQ_QUEUE: Joi.string().when('ENABLE_MESSAGING', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  GEMINI_API_KEY: Joi.string().required(),
});
