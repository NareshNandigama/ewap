import { NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import { GroundedDiagnosticsService } from './grounded-diagnostics.service.js';

function fixture() {
  const runs = { findOne: vi.fn().mockResolvedValue({ id: 'run' }) };
  const retrieval = { search: vi.fn().mockResolvedValue({ passages: [] }) };
  const python = {
    isEnabled: () => true,
    diagnose: vi.fn().mockRejectedValue(new Error('provider unavailable')),
  };
  return {
    runs,
    retrieval,
    python,
    service: new GroundedDiagnosticsService(
      runs as never,
      retrieval as never,
      python as never,
    ),
  };
}
const user = { sub: 'u', organizationId: 'o', role: 'MEMBER' };
it('authorizes the workflow before retrieval/provider work', async () => {
  const f = fixture();
  f.runs.findOne.mockRejectedValue(new NotFoundException());
  await expect(
    f.service.diagnose('Why failed?', 'foreign', user, 'keyword'),
  ).rejects.toMatchObject({ status: 404 });
  expect(f.retrieval.search).not.toHaveBeenCalled();
  expect(f.python.diagnose).not.toHaveBeenCalled();
});
it('fails unavailable without downgrading grounded requests', async () => {
  const f = fixture();
  await expect(
    f.service.diagnose('Why failed?', 'run', user, 'keyword'),
  ).rejects.toMatchObject({ status: 503 });
  expect(f.python.diagnose).toHaveBeenCalledOnce();
  expect(f.retrieval.search).toHaveBeenCalledWith(
    { query: 'Why failed?', mode: 'keyword', limit: 5 },
    user,
    expect.any(AbortSignal),
  );
});
it('rejects provider work when Python grounding is disabled', async () => {
  const f = fixture();
  f.python.isEnabled = () => false;
  await expect(
    f.service.diagnose('Why failed?', 'run', user, 'keyword'),
  ).rejects.toMatchObject({ status: 503 });
  expect(f.retrieval.search).not.toHaveBeenCalled();
});

it('bounds retrieval/provider work with a total abort deadline', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    f.retrieval.search.mockImplementation(
      (_input, _user, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('deadline')),
            { once: true },
          );
        }),
    );
    const assertion = expect(
      f.service.diagnose('Why failed?', 'run', user, 'keyword'),
    ).rejects.toThrow('deadline');
    await vi.advanceTimersByTimeAsync(35000);
    await assertion;
    expect(f.python.diagnose).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
