import { describe, expect, it } from 'vitest';
import { checkPackFiles } from './check-pack.mjs';

const good = [
  'LICENSE',
  'README.md',
  'package.json',
  'fesm2022/ngpdf-core.mjs',
  'types/ngpdf-core.d.ts',
];

describe('checkPackFiles', () => {
  it('accepts a package with a LICENSE, a README and no test files', () => {
    expect(checkPackFiles(good)).toEqual([]);
  });

  it('reports test files, test helpers and a missing LICENSE or README', () => {
    expect(
      checkPackFiles([
        'package.json',
        'fesm2022/ngpdf-core.mjs',
        'src/lib/engine/style.spec.ts',
        'lib/engine/paginate.bench.js',
        'fesm2022/x.spec.mjs.map',
        'testing/setup.js',
      ]),
    ).toEqual([
      'test file in the package: src/lib/engine/style.spec.ts',
      'test file in the package: lib/engine/paginate.bench.js',
      'test file in the package: fesm2022/x.spec.mjs.map',
      'test file in the package: testing/setup.js',
      'LICENSE is missing',
      'README.md is missing',
    ]);
  });
});
