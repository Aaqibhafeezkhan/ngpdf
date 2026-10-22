import { describe, expect, it } from 'vitest';

describe('workspace smoke test', () => {
  it('runs specs', () => {
    expect(1 + 1).toBe(2);
  });

  it('resolves the yoga-layout loader', async () => {
    const yoga = await import('yoga-layout/load');
    expect(typeof yoga.loadYoga).toBe('function');
  });
});
