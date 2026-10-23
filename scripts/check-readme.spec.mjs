import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkReadme, SYNCED_SECTIONS } from './check-readme.mjs';

const doc = (sections) =>
  `# Title\n\nIntro.\n\n${sections.map(([h, body]) => `## ${h}\n\n${body}\n`).join('\n')}`;

describe('checkReadme', () => {
  it('accepts the repository READMEs', () => {
    const root = readFileSync('README.md', 'utf8');
    const core = readFileSync('projects/core/README.md', 'utf8');
    expect(checkReadme(root, core)).toEqual([]);
  });

  it('syncs Install, the example and the v0.1 limits', () => {
    expect(SYNCED_SECTIONS).toEqual(['Install', 'Example', 'v0.1 limits']);
  });

  it('reports a missing section and a section whose text differs', () => {
    const root = doc([
      ['Install', 'npm i'],
      ['Example: one', 'code'],
      ['v0.1 limits', '- a'],
    ]);
    const core = doc([
      ['Install', 'npm i'],
      ['v0.1 limits', '- b'],
    ]);
    expect(checkReadme(root, core)).toEqual([
      'projects/core/README.md has no "## Example: one" section',
      'projects/core/README.md "## v0.1 limits" differs from README.md',
    ]);
  });

  it('reports a synced section missing from the root README', () => {
    expect(checkReadme(doc([['Install', 'x']]), doc([['Install', 'x']]))).toEqual([
      'README.md has no section starting "## Example"',
      'README.md has no section starting "## v0.1 limits"',
    ]);
  });
});
