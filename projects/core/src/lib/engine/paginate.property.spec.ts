import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Yoga } from 'yoga-layout/load';
import { createNode, type PdfNode } from '../tree/node';
import { paginatePage } from './paginate';
import { resolveStyles } from './style';
import { createPdfkitWriter, type PdfWriter } from './writer';

let yoga: Yoga;
let writer: PdfWriter;
beforeAll(async () => {
  const { loadYoga } = await import('yoga-layout/load');
  yoga = await loadYoga();
  writer = await createPdfkitWriter({ compress: false });
});

const CONTENT_BOTTOM = 841.89 - 36 - 9;

function el(tag: string, style: Record<string, string>, props: Record<string, unknown> = {}) {
  const node = createNode('element', tag);
  node.rawStyle = style;
  node.owner = { pdfProps: () => props };
  return node;
}

function adopt(parent: PdfNode, children: PdfNode[]): PdfNode {
  for (const child of children) {
    child.parent = parent;
    parent.children.push(child);
  }
  return parent;
}

function row(height: number, header = false): PdfNode {
  return adopt(el('pdf-row', { height: String(height) }, { header }), [el('pdf-cell', {})]);
}

describe('paginatePage properties', () => {
  it('places every row once and in order, above the content bottom, under its header', () => {
    fc.assert(
      fc.property(
        // size 'max': the default size would keep the arrays a few rows long.
        fc.array(fc.integer({ min: 5, max: 900 }), { maxLength: 300, size: 'max' }),
        fc.option(fc.integer({ min: 5, max: 100 }), { nil: undefined }),
        fc.boolean(),
        (heights, headerHeight, wrapped) => {
          const header = headerHeight === undefined ? undefined : row(headerHeight, true);
          const rows = heights.map((h) => row(h));
          const table = adopt(el('pdf-table', {}, { columns: ['1fr'] }), [
            ...(header ? [header] : []),
            ...rows,
          ]);
          const content = wrapped ? adopt(el('pdf-view', {}), [table]) : table;
          const page = adopt(el('pdf-page', { padding: '36' }, { size: 'A4' }), [
            content,
            el('pdf-page-number', { height: '9' }),
          ]);
          const warnings: string[] = [];
          const pages = paginatePage(
            page,
            resolveStyles(page),
            { yoga, metrics: writer, images: new Map() },
            (message) => warnings.push(message),
          );

          expect(pages.length).toBeGreaterThanOrEqual(1);
          const isRow = new Set(rows);
          const placedNodes = pages.flatMap((p) => p.placed.map((placed) => placed.box.node));
          expect(placedNodes.filter((node) => isRow.has(node))).toEqual(rows);
          // Besides rows, only the header is placed, or the table itself when it is empty.
          const others = placedNodes.filter((node) => !isRow.has(node));
          if (!header) expect(others).toEqual(rows.length === 0 ? [table] : []);

          let clipped = 0;
          for (const laid of pages) {
            for (const placed of laid.placed) {
              if (placed.clipBottom === undefined) {
                expect(placed.y + placed.box.h).toBeLessThanOrEqual(CONTENT_BOTTOM + 1e-6);
              } else {
                clipped++;
                expect(placed.clipBottom).toBeCloseTo(CONTENT_BOTTOM, 6);
              }
            }
            const hasRow = laid.placed.some((placed) => isRow.has(placed.box.node));
            if (header && hasRow) expect(laid.placed[0]!.box.node).toBe(header);
          }
          expect(warnings).toHaveLength(clipped);
          if (header && rows.length === 0) {
            expect(pages).toHaveLength(1);
            expect(pages[0]!.placed.map((placed) => placed.box.node)).toEqual([header]);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
