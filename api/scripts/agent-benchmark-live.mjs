import { ConfigService } from '@nestjs/config';
import { GeminiGroundedDiagnosticsService } from '../dist/ai/gemini-grounded-diagnostics.service.js';
import { compareCase, loadCases } from './agent-benchmark.mjs';

const [mode] = process.argv.slice(2);
if (!['--smoke', '--development', '--heldout'].includes(mode))
  throw new Error('Choose --smoke, --development, or --heldout');
const service = new GeminiGroundedDiagnosticsService(new ConfigService());
if (!service.isEnabled())
  throw new Error('Set GEMINI_API_KEY in the local environment');

const fixtures = (await loadCases()).filter((fixture) =>
  mode === '--smoke'
    ? fixture.id === 'timeout'
    : fixture.split === mode.slice(2),
);
const cases = [];
for (const fixture of fixtures) {
  for (const strategy of ['single', 'multi']) {
    const result = await compareCase(service, fixture, strategy);
    cases.push(result);
    if (result.outcome === 'unavailable') break;
  }
  if (cases.at(-1)?.outcome === 'unavailable') break;
}
console.log(
  JSON.stringify(
    {
      mode,
      completed: cases.length === fixtures.length * 2,
      cases,
    },
    null,
    2,
  ),
);
if (cases.length !== fixtures.length * 2 || cases.some(({ passed }) => !passed))
  process.exitCode = 1;
