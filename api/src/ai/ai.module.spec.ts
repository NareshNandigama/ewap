import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai.module.js';
import { GroundedDiagnosticsService } from './grounded-diagnostics.service.js';
import { ClaudeProvider } from './providers/claude.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { PrismaService } from '../prisma/prisma.service.js';

it.each([
  { config: { GEMINI_API_KEY: 'synthetic-key' }, provider: GeminiProvider },
  {
    config: {
      AI_PROVIDER: 'claude',
      ANTHROPIC_API_KEY: 'synthetic-key',
      CLAUDE_MODEL: 'claude-test',
    },
    provider: ClaudeProvider,
  },
])('resolves AI services with $provider.name', async ({ config, provider }) => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            JWT_SECRET: 'module-wiring-test-only',
            ENABLE_MESSAGING: false,
            ...config,
          }),
        ],
      }),
      AiModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  try {
    expect(module.get(GroundedDiagnosticsService)).toBeDefined();
    expect(module.get('LLM_PROVIDER')).toBeInstanceOf(provider);
  } finally {
    await module.close();
  }
});
