import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveColumns } from './layout';
import type { TableColumn } from '../tree/table-column';

describe('resolveColumns properties', () => {
  it('sums to the table width when fr columns share what fixed ones leave', () => {
    const fixed = fc.integer({ min: 0, max: 100 });
    const fr = fc
      .integer({ min: 1, max: 9 })
      .map((n): TableColumn => `${String(n)}fr` as `${number}fr`);
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fixed, fr), { maxLength: 8 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 0, max: 5 }),
        (columns, frShare, slack) => {
          const withFr: TableColumn[] = [...columns, `${String(frShare)}fr` as `${number}fr`];
          const fixedTotal = withFr.reduce<number>(
            (sum, c) => sum + (typeof c === 'number' ? c : 0),
            0,
          );
          const width = fixedTotal + slack;
          const widths = resolveColumns(withFr, width);
          expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(width, 2);
        },
      ),
    );
  });
});
