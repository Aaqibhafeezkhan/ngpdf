import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

// Stryker instruments the engine, which slows every call. The timing specs ("... in under N ms")
// would fail for that reason alone, so mutation runs skip them. The normal test run keeps them.
// Cost: the mutants that only those specs catch (the guards that keep parsing and line breaking
// linear) survive, so the mutation score is lower than the full suite would give. That is
// accepted: a timing spec cannot run reliably on instrumented code.
export default mergeConfig(
  base,
  defineConfig({
    test: { testNamePattern: '^(?!.*\\bunder \\d+ ms)' },
  }),
);
