import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL(
  '../evaluations/agent-comparison.json',
  import.meta.url,
);
export const loadCases = async () =>
  JSON.parse(await readFile(fixtureUrl, 'utf8'));

const digest = (text) => createHash('sha256').update(text).digest('hex');

export async function compareCase(service, fixture, strategy) {
  const passages = fixture.passages.map(({ id, key, version, quote }) => ({
    chunkId: id,
    documentId: key,
    sourceKey: key,
    version,
    content: quote,
    documentHash: digest(quote),
    chunkHash: digest(quote),
  }));
  const run = {
    id: fixture.id,
    status: 'FAILED',
    logs: fixture.log
      ? [
          {
            id: 'log-1',
            level: 'ERROR',
            message: fixture.log,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]
      : [],
  };
  const recallAt5 =
    fixture.relevant.filter((id) =>
      passages.slice(0, 5).some((passage) => passage.chunkId === id),
    ).length / fixture.relevant.length;
  const started = performance.now();
  const base = {
    case: fixture.id,
    split: fixture.split,
    strategy,
    snapshotRecallAt5: recallAt5,
  };
  try {
    const report = await service.diagnose(
      'benchmark',
      fixture.question,
      run,
      { mode: 'keyword', passages },
      AbortSignal.timeout(35000),
      strategy,
    );
    const observations = report.grounding.observations;
    const conflicts = report.conflictingGuidance ?? [];
    const outcome = conflicts.length
      ? 'conflict'
      : observations.length
        ? 'supported'
        : 'abstain';
    const citationIds =
      outcome === 'conflict'
        ? conflicts.map(({ passageId }) => passageId)
        : observations.map(({ passage_id }) => passage_id);
    const citationCorrect = citationIds.every(
      (id) => fixture.relevant.includes(id) && !fixture.forbidden?.includes(id),
    );
    const matchedLabels =
      outcome !== 'conflict' ||
      fixture.relevant.every((id) => citationIds.includes(id));
    return {
      ...base,
      outcome,
      passed: outcome === fixture.expected && citationCorrect && matchedLabels,
      citationCorrect: citationIds.length ? citationCorrect : null,
      modelCalls: report.modelCalls,
      usage: report.usage ?? null,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ...base,
      outcome: 'unavailable',
      passed: false,
      providerStatus: Number.isInteger(error.status) ? error.status : null,
      modelCalls: null,
      usage: null,
      latencyMs: Math.round(performance.now() - started),
    };
  }
}
