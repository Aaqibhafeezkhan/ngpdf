// Mutation testing of the layout and PDF engine. Runs weekly in CI (`.github/workflows/weekly.yml`).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.stryker.config.ts' },
  mutate: [
    'projects/core/src/lib/engine/**/*.ts',
    '!projects/core/src/lib/engine/**/*.spec.ts',
    '!projects/core/src/lib/engine/**/*.bench.ts',
    '!projects/core/src/lib/engine/**/*.d.ts',
  ],
  coverageAnalysis: 'perTest',
  thresholds: { high: 90, low: 85, break: 80 },
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  concurrency: 2,
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
