import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['src/renderer/src/test/setup.ts'],
    coverage: {
      provider: 'v8'
    }
  }
});
