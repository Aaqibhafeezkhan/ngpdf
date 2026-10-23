import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

// Stryker instruments the engine, which slows every call. The timing specs ("... in under N ms")
// would fail for that reason alone, so mutation runs skip them. The normal test run keeps them.
export default mergeConfig(
  base,
  defineConfig({
    test: { testNamePattern: '^(?!.*\\bunder \\d+ ms)' },
  }),
);
