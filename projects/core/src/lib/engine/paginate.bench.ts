import { expect, test } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { paginatePage } from './paginate';
import { resolveStyles } from './style';
import { createPdfkitWriter } from './writer';

/**
 * Median of `vitest bench` on this file in `./scripts/dev` (Node 24), recorded 2026-10-22.
 * The weekly CI job fails when the median is more than 20% above it. Target: under 300 ms.
 * It was measured on the maintainer's machine, so the first weekly run on a GitHub runner is a
 * calibration: if that run fails on speed alone, record the median it prints here and commit it.
 */
export const BASELINE_MEDIAN_MS = 212;

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

function text(content: string): PdfNode {
  return adopt(el('pdf-text', {}), [createNode('text', '', content)]);
}

function row(index: number, header = false): PdfNode {
  const cells = ['#', 'Name', 'Email', 'Since'].map((label) =>
    adopt(el('pdf-cell', { padding: '4' }), [text(header ? label : `${label} ${String(index)}`)]),
  );
  const zebra = index % 2 === 0 ? { 'background-color': '#f2f2f2' } : {};
  return adopt(el('pdf-row', zebra, { header }), cells);
}

const page = adopt(el('pdf-page', { padding: '36' }, { size: 'A4' }), [
  adopt(el('pdf-table', {}, { columns: [30, '2fr', '3fr', '1fr'] }), [
    row(0, true),
    ...Array.from({ length: 1000 }, (_, i) => row(i + 1)),
  ]),
  el('pdf-page-number', { 'font-size': '9' }),
]);
const { loadYoga } = await import('yoga-layout/load');
const yoga = await loadYoga();
const writer = await createPdfkitWriter({ compress: false });

test('lays out and paginates a 1,000-row table', async ({ bench }) => {
  const result = await bench('paginate 1,000 rows', () => {
    paginatePage(page, resolveStyles(page), { yoga, metrics: writer, images: new Map() });
  }).run();
  expect(result.latency.p50).toBeLessThan(300);
  // The weekly workflow sets BENCH_BASELINE_TOLERANCE=0.2 to fail on a regression of more than 20%.
  const tolerance = Number(process.env['BENCH_BASELINE_TOLERANCE']);
  if (tolerance > 0)
    expect(result.latency.p50).toBeLessThanOrEqual(BASELINE_MEDIAN_MS * (1 + tolerance));
});
