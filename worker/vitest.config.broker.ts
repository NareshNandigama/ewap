import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['test/broker.hardening.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
