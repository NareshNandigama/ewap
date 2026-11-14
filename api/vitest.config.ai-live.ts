import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/python-diagnostics.live.ts'],
    testTimeout: 10000,
    hookTimeout: 15000,
  },
});
