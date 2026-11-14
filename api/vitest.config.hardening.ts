import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/hardening.database.ts'],
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});
