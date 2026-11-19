import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['client/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    coverage: { provider: 'v8', reporter: ['text','json-summary','html'],
      include: ['shared/**/*.ts'], exclude: ['shared/**/*.test.ts', 'shared/type-errors.example.ts'],
      thresholds: { lines: 85, statements: 85 } },
    testTimeout: 15000,
  },
});
