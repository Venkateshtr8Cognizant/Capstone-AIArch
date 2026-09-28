import { defineConfig } from 'vitest/config';

/**
 * Coverage thresholds are the ones mandated by the StoreOps specification
 * (Section 3.6) and are enforced, not advisory: `npm run test:coverage`
 * fails the build below them, and the harness gate runs it.
 *
 *   service layer          80% lines
 *   route/controller layer 70% lines
 *   shared utilities       60% lines
 *   overall project        70% lines
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.harness/checks/fixtures/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'json'],
      reportsDirectory: '.harness/output/coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/main.ts', 'src/**/*.types.ts', 'src/contracts/**'],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
        'src/modules/**/*.service.ts': {
          lines: 80,
          statements: 80,
          functions: 75,
          branches: 65,
        },
        'src/modules/**/*.routes.ts': {
          lines: 70,
          statements: 70,
          functions: 65,
          branches: 55,
        },
        'src/platform/**/*.ts': {
          lines: 60,
          statements: 60,
          functions: 55,
          branches: 50,
        },
      },
    },
  },
});
