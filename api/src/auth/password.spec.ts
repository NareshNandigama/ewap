import { describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import { hashAccountPassword } from './password.js';
describe('Account password hashing', () => {
  it.each(['short', 'a'.repeat(73), 'é'.repeat(37)])(
    'rejects short or bcrypt-truncated passwords %#',
    async (password) => {
      await expect(hashAccountPassword(password)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
  it('accepts the byte boundary and verifies the resulting bcrypt hash', async () => {
    const password = 'é'.repeat(36);
    const hash = await hashAccountPassword(password);
    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(hash).not.toBe(password);
  });
});
