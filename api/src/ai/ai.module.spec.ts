import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai.module.js';
import { GroundedDiagnosticsService } from './grounded-diagnostics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

it('resolves the production AI module with its runbook grounding dependencies', async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            JWT_SECRET: 'module-wiring-test-only',
            ENABLE_MESSAGING: false,
          }),
        ],
      }),
      AiModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider('LLM_PROVIDER')
    .useValue({})
    .compile();
  expect(module.get(GroundedDiagnosticsService)).toBeDefined();
  await module.close();
});
