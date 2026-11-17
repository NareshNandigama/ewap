import { vi } from 'vitest';
import { RunbookService } from './runbook.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

it('retries raw driver serialization conflicts and reports exhaustion as conflict', async () => {
  const conflict = new Error('TransactionWriteConflict', {
    cause: { kind: 'TransactionWriteConflict' },
  });
  conflict.name = 'DriverAdapterError';
  const tx = {
    user: { findFirst: async () => ({ id: 'u' }) },
    knowledgeDocument: { findFirst: async () => null },
  };
  const transaction = vi
    .fn()
    .mockRejectedValueOnce(conflict)
    .mockImplementation(async (work) => work(tx));
  const service = new RunbookService({
    $transaction: transaction,
  } as unknown as PrismaService);
  const actor = { sub: 'u', organizationId: 'o', role: 'ADMIN' };
  await expect(service.remove('missing', 1, actor)).resolves.toBeUndefined();
  expect(transaction).toHaveBeenCalledTimes(2);
  transaction.mockReset().mockRejectedValue(conflict);
  await expect(service.remove('missing', 1, actor)).rejects.toMatchObject({
    status: 409,
  });
  expect(transaction).toHaveBeenCalledTimes(3);
});
