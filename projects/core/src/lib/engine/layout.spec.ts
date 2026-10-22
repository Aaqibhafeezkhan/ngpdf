import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Yoga } from 'yoga-layout/load';
import { createNode, type PdfNode } from '../tree/node';
import type { TableColumn } from '../tree/table-column';
import { layoutBox, resolveColumns, type Box, type LayoutContext } from './layout';
import { resolveStyles } from './style';
import * as textModule from './text';
import { createPdfkitWriter, type PdfWriter } from './writer';

let yoga: Yoga;
let writer: PdfWriter;
beforeAll(async () => {
  const { loadYoga } = await import('yoga-layout/load');
  yoga = await loadYoga();
  writer = await createPdfkitWriter({ compress: false });
});

function el(
  tag: string,
  style: Record<string, string> = {},
  children: PdfNode[] = [],
  props: Record<string, unknown> = {},
): PdfNode {
  const node = createNode('element', tag);
  node.rawStyle = style;
  node.owner = { pdfProps: () => props };
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

function textNode(content: string): PdfNode {
  return createNode('text', '', content);
}

function lay(root: PdfNode, width: number, warn?: (message: string) => void): Box {
  const ctx: LayoutContext = {
    yoga,
    metrics: writer,
    images: new Map(),
    ...(warn ? { warn } : {}),
  };
  return layoutBox(root, resolveStyles(root), width, ctx);
}

function cells(spans: number[], style: Record<string, string> = { height: '10' }): PdfNode[] {
  return spans.map((span) => el('pdf-cell', style, [], { span }));
}

function table(columns: TableColumn[], rows: PdfNode[][]): PdfNode {
  return el(
    'pdf-table',
    {},
    rows.map((row) => el('pdf-row', {}, row)),
    { columns },
  );
}

describe('resolveColumns', () => {
  it('splits what fixed columns leave by fr shares', () => {
    const widths = resolveColumns([30, '2fr', '3fr', '1fr'], 523.28);
    [30, 164.43, 246.64, 82.21].forEach((want, i) => {
      expect(widths[i]).toBeCloseTo(want, 2);
    });
  });

  it('takes percentages of the table width before the fr shares', () => {
    expect(resolveColumns(['25%', '1fr'], 400)).toEqual([100, 300]);
  });

  it('resolves fixed, then percent, then fr', () => {
    expect(resolveColumns(['1fr', '50%', 100], 400)).toEqual([100, 200, 100]);
  });

  it('gives fr columns nothing when the fixed ones overflow', () => {
    expect(resolveColumns([300, '1fr'], 200)).toEqual([300, 0]);
  });

  it('leaves the width unused when there is no fr column', () => {
    expect(resolveColumns([50, '10%'], 400)).toEqual([50, 40]);
  });
});

describe('layoutBox', () => {
  it('stacks children in a padded view with a gap', () => {
    const root = el('pdf-view', { padding: '10', gap: '4' }, [
      el('pdf-view', { height: '20' }),
      el('pdf-view', { height: '20' }),
    ]);
    const box = lay(root, 200);
    expect(box.children.map((child) => child.y)).toEqual([10, 34]);
    expect(box.children.map((child) => child.x)).toEqual([10, 10]);
    expect(box.children[0]?.w).toBe(180);
    expect(box.h).toBe(64);
  });

  it('measures text: height equals the block and lines fit the box', () => {
    const root = el('pdf-view', { width: '120' }, [
      el('pdf-text', {}, [textNode('Gabriela Teixeira de Albuquerque Cavalcanti')]),
    ]);
    const box = lay(root, 120);
    const leaf = box.children[0];
    expect(leaf?.text).toBeDefined();
    expect(leaf?.text?.lines.length).toBeGreaterThan(1);
    expect(leaf?.h).toBeCloseTo(leaf?.text?.height ?? -1, 6);
    for (const line of leaf?.text?.lines ?? [])
      expect(line.width).toBeLessThanOrEqual(leaf?.w ?? 0);
  });

  it('never makes a text box narrower than its text', () => {
    const root = el('pdf-view', { 'flex-direction': 'row' }, [
      el('pdf-text', {}, [textNode('Hello wide world of text')]),
    ]);
    const leaf = lay(root, 400).children[0];
    expect(leaf?.text?.lines).toHaveLength(1);
    expect(leaf?.w).toBeGreaterThanOrEqual(leaf?.text?.width ?? Infinity);
  });

  it('shrinks flex children by default, as CSS does', () => {
    const root = el('pdf-view', { 'flex-direction': 'row', width: '100' }, [
      el('pdf-view', { width: '80' }),
      el('pdf-view', { width: '80' }),
    ]);
    expect(lay(root, 100).children.map((child) => child.w)).toEqual([50, 50]);
  });

  it('keeps flex-shrink 0 and grows with flex-grow', () => {
    const root = el('pdf-view', { 'flex-direction': 'row' }, [
      el('pdf-view', { width: '30', 'flex-shrink': '0' }),
      el('pdf-view', { 'flex-grow': '1' }),
    ]);
    const [fixed, grown] = lay(root, 100).children;
    expect([fixed?.w, grown?.w, grown?.x]).toEqual([30, 70, 30]);
  });

  it('applies percent sizes, margins and borders', () => {
    const root = el('pdf-view', { border: '2 solid #000' }, [
      el('pdf-view', { width: '50%', height: '10', margin: '3' }),
    ]);
    const child = lay(root, 104).children[0];
    expect([child?.x, child?.y, child?.w]).toEqual([5, 5, 50]);
  });

  it('applies justify, align, auto sizes and min/max limits', () => {
    const root = el(
      'pdf-view',
      {
        'flex-direction': 'row',
        'justify-content': 'center',
        'align-items': 'flex-end',
        height: '50',
      },
      [
        el('pdf-view', {
          width: 'auto',
          'min-width': '20',
          'max-width': '30%',
          height: '10',
          'flex-basis': '60',
        }),
        el('pdf-view', {
          width: '20',
          height: '10',
          'align-self': 'flex-start',
          'min-height': '5',
          'max-height': '8',
          margin: 'auto',
        }),
      ],
    );
    const box = lay(root, 200);
    expect(box.children).toHaveLength(2);
    expect(box.children[0]?.w).toBe(60);
    expect(box.children[1]?.h).toBe(8);
  });

  it('sizes an image box from its style and attaches the asset', () => {
    const image = el('pdf-image', { width: '40', height: '30' });
    const asset = { data: new Uint8Array(1), width: 4, height: 3 };
    const box = layoutBox(image, resolveStyles(image), 100, {
      yoga,
      metrics: writer,
      images: new Map([[image, asset]]),
    });
    expect([box.w, box.h, box.image]).toEqual([100, 30, asset]);
  });

  it('ignores non-element children', () => {
    const root = el('pdf-view', {}, [textNode('stray'), el('pdf-view', { height: '5' })]);
    expect(lay(root, 50).children).toHaveLength(1);
  });
});

describe('tables', () => {
  it('lines every cell up at its column start in all rows', () => {
    const root = table([30, '2fr', '1fr'], [cells([1, 1, 1]), cells([1, 1, 1])]);
    const box = lay(root, 330);
    const xs = box.children.map((row) => row.children.map((cell) => cell.x));
    expect(xs[0]).toEqual([0, 30, 230]);
    expect(xs[1]).toEqual(xs[0]);
    expect(box.children[1]?.y).toBe(10);
  });

  it('gives a spanning cell the width of its columns', () => {
    const root = table([30, '2fr', '1fr'], [cells([1, 1, 1]), cells([2, 1])]);
    const row = lay(root, 330).children[1];
    expect(row?.children.map((cell) => [cell.x, cell.w])).toEqual([
      [0, 230],
      [230, 100],
    ]);
  });

  it('measures columns inside table padding', () => {
    const root = table(['1fr', '1fr'], [cells([1, 1])]);
    root.rawStyle = { padding: '10' };
    const row = lay(root, 120).children[0];
    expect(row?.children.map((cell) => [cell.x, cell.w])).toEqual([
      [0, 50],
      [50, 50],
    ]);
  });

  it('resolves nested tables against their own width', () => {
    const inner = table(['1fr', '1fr'], [cells([1, 1])]);
    const outer = table([100, '1fr'], [[el('pdf-cell', {}, [inner]), ...cells([1])]]);
    const innerBox = lay(outer, 300).children[0]?.children[0]?.children[0];
    expect(innerBox?.children[0]?.children.map((cell) => cell.w)).toEqual([50, 50]);
  });

  it('lays out a table without rows', () => {
    expect(() => lay(table([], []), 100)).not.toThrow();
  });
});

describe('table box model', () => {
  const styledRow = (style: Record<string, string>): PdfNode => el('pdf-row', style, cells([1, 1]));
  const tableOf = (rows: PdfNode[]): PdfNode => el('pdf-table', {}, rows, { columns: [60, '1fr'] });

  it('keeps cells on their columns whatever the row padding, borders and margin', () => {
    const root = tableOf([
      styledRow({ padding: '6', 'border-left': '3 solid #000', 'border-right': '1 solid #000' }),
      styledRow({ margin: '5', 'justify-content': 'flex-end', 'flex-direction': 'column' }),
      styledRow({}),
    ]);
    const warnings: string[] = [];
    const box = lay(root, 200, (message) => warnings.push(message));
    for (const row of box.children) {
      expect(row.children.map((cell) => [cell.x, cell.w])).toEqual([
        [0, 60],
        [60, 140],
      ]);
    }
    expect(box.children[0]?.x).toBe(0);
    // Vertical padding stays: 6 + 10 + 6.
    expect(box.children[0]?.h).toBe(22);
    expect(box.children[0]?.style.borderWidth.left).toBe(0);
  });

  it('warns once per layout, naming each ignored property', () => {
    const root = tableOf([
      styledRow({ padding: '6', 'border-left': '3 solid #000' }),
      styledRow({ padding: '6' }),
      el('pdf-row', {}, [
        el('pdf-cell', { margin: '4', 'min-width': '10', 'max-width': '20' }, [], { span: 1 }),
      ]),
    ]);
    const warn = vi.fn();
    lay(root, 200, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    for (const name of [
      'pdf-row padding-left',
      'pdf-row padding-right',
      'pdf-row border-left',
      'pdf-cell margin',
      'pdf-cell min-width',
      'pdf-cell max-width',
    ]) {
      expect(message).toContain(name);
    }
  });

  it('does not warn for an untouched table', () => {
    const warn = vi.fn();
    lay(tableOf([styledRow({})]), 200, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns for margin, justify-content and flex-direction on a row', () => {
    const warn = vi.fn();
    lay(
      tableOf([
        styledRow({ margin: '5', 'justify-content': 'center', 'flex-direction': 'column' }),
      ]),
      200,
      warn,
    );
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('pdf-row margin');
    expect(message).toContain('pdf-row justify-content');
    expect(message).toContain('pdf-row flex-direction');
  });
});

describe('passes and cleanup', () => {
  it('lays a table in a shrink-to-fit parent out deterministically', () => {
    const build = (): PdfNode =>
      el('pdf-view', { 'align-items': 'flex-start' }, [
        table(
          [40, '1fr'],
          [[...cells([1]), el('pdf-cell', {}, [el('pdf-text', {}, [textNode('some text')])])]],
        ),
      ]);
    const warn = vi.fn();
    const first = lay(build(), 300, warn);
    const second = lay(build(), 300);
    const widths = (box: Box): number[] =>
      (box.children[0]?.children[0]?.children ?? []).map((cell) => cell.w);
    expect(widths(first)).toEqual(widths(second));
    expect(warn).not.toHaveBeenCalled();
  });

  it('wraps each text node once per call, however many passes run', () => {
    const spy = vi.spyOn(textModule, 'layoutText');
    const text = el('pdf-text', {}, [textNode('some text in a cell')]);
    const root = table([100, '1fr'], [[el('pdf-cell', {}, [text]), ...cells([1])]]);
    spy.mockClear();
    lay(root, 300);
    const wraps = spy.mock.calls.filter(([content]) => content === 'some text in a cell');
    spy.mockRestore();
    expect(wraps).toHaveLength(1);
  });

  it('uses the last pass and warns when the table widths never settle', () => {
    // The column is 99% of a table that is as wide as its own column.
    const root = el('pdf-view', { 'align-items': 'flex-start' }, [
      table(['99%'], [[el('pdf-cell', {}, [el('pdf-view', { width: '100' })])]]),
    ]);
    const warn = vi.fn();
    const box = lay(root, 300, warn);
    expect(warn).toHaveBeenCalledWith('ngpdf: table columns did not settle');
    expect(box.children).toHaveLength(1);
  });

  it('frees every Yoga node when a build fails halfway', () => {
    const live = new Set<unknown>();
    const tracked = {
      ...yoga,
      Node: {
        ...yoga.Node,
        create: (config?: Parameters<typeof yoga.Node.create>[0]) => {
          const node = yoga.Node.create(config);
          live.add(node);
          const free = node.free.bind(node);
          node.free = () => {
            live.delete(node);
            free();
          };
          return node;
        },
      },
    } as unknown as Yoga;
    const huge = 'x'.repeat(1_048_577);
    const root = el('pdf-view', {}, [
      el('pdf-view', {}, [el('pdf-view', {}), el('pdf-text', {}, [textNode(huge)])]),
    ]);
    expect(() =>
      layoutBox(root, resolveStyles(root), 100, {
        yoga: tracked,
        metrics: writer,
        images: new Map(),
      }),
    ).toThrow(/^ngpdf:/);
    expect(live.size).toBe(0);
  });
});
