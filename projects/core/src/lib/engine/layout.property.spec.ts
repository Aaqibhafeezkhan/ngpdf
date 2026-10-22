import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Yoga } from 'yoga-layout/load';
import { createNode, type PdfNode } from '../tree/node';
import type { TableColumn } from '../tree/table-column';
import { layoutBox, resolveColumns } from './layout';
import { resolveStyles } from './style';
import { createPdfkitWriter, type PdfWriter } from './writer';

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

describe('text in table cells', () => {
  let yoga: Yoga;
  let writer: PdfWriter;
  beforeAll(async () => {
    const { loadYoga } = await import('yoga-layout/load');
    yoga = await loadYoga();
    writer = await createPdfkitWriter({ compress: false });
  });

  function el(tag: string, style: Record<string, string>, children: PdfNode[], props = {}) {
    const node = createNode('element', tag);
    node.rawStyle = style;
    node.owner = { pdfProps: () => props };
    for (const child of children) {
      child.parent = node;
      node.children.push(child);
    }
    return node;
  }

  const words = fc
    .array(
      fc.constantFrom('Clínica', 'Bem', 'Viver', 'Trigo', 'Vila', 'AV', 'To', 'W.', 'x', 'Ltda'),
      { minLength: 1, maxLength: 12 },
    )
    .map((parts) => parts.join(' '));
  const cellText = fc.record({
    text: words,
    fontSize: fc.integer({ min: 6, max: 14 }),
    padding: fc.integer({ min: 0, max: 8 }),
    bold: fc.boolean(),
  });

  it('gives each text box the height of its lines and keeps every line inside its content box', () => {
    fc.assert(
      fc.property(
        fc.array(cellText, { minLength: 1, maxLength: 4 }),
        fc.array(fc.oneof(fc.integer({ min: 30, max: 120 }), fc.constant<TableColumn>('1fr')), {
          minLength: 4,
          maxLength: 4,
        }),
        fc.double({ min: 300, max: 800, noNaN: true }),
        (cells, columns, width) => {
          const row = el(
            'pdf-row',
            { 'padding-top': '4', 'padding-bottom': '4' },
            cells.map(({ text, fontSize, padding, bold }) => {
              const run = createNode('text', '', text);
              const style = {
                'font-size': String(fontSize),
                'font-weight': bold ? 'bold' : 'normal',
              };
              const textBox = el('pdf-text', style, [run]);
              const inset = String(padding);
              return el('pdf-cell', { 'padding-left': inset, 'padding-right': inset }, [textBox]);
            }),
          );
          const table = el('pdf-table', {}, [row], { columns });
          const root = el('pdf-view', {}, [table]);
          const ctx = { yoga, metrics: writer, images: new Map() };
          const laidRow = layoutBox(root, resolveStyles(root), width, ctx).children[0]!
            .children[0]!;
          for (const cell of laidRow.children) {
            const box = cell.children[0]!;
            const block = box.text;
            if (!block) return false;
            const insets =
              box.padding.top + box.padding.bottom + box.border.top + box.border.bottom;
            if (Math.abs(box.h - (block.height + insets)) > 1e-3) return false;
            const content = box.w - box.padding.left - box.padding.right;
            for (const line of block.lines) {
              if (line.text.length > 1 && line.width > content) return false;
            }
            const cellInsets = cell.padding.top + cell.padding.bottom;
            if (laidRow.h + 1e-3 < box.h + cellInsets + laidRow.padding.top) return false;
          }
          return true;
        },
      ),
    );
  });
});
