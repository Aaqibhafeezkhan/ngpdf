import type { Config, Edge, Node as YogaNode, Yoga } from 'yoga-layout/load';
import { elementChildren, propsOf, textContent, type PdfNode } from '../tree/node';
import type { TableColumn } from '../tree/table-column';
import type { ImageAsset } from './images';
import type { Edges, Length, ResolvedStyle } from './style';
import { layoutText, measureText, type TextBlock } from './text';
import type { FontMetrics } from './writer';

export interface Box {
  readonly node: PdfNode;
  readonly style: ResolvedStyle;
  /** Position of the border box relative to the parent box's border-box origin. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly text?: TextBlock;
  readonly image?: ImageAsset;
  readonly children: readonly Box[];
}

export interface LayoutContext {
  readonly yoga: Yoga;
  readonly metrics: FontMetrics;
  readonly images: ReadonlyMap<PdfNode, ImageAsset>;
}

type Measure = (width: number, widthMode: number) => { width: number; height: number };

/** A Yoga node together with the PdfNode and child nodes it was built from. */
interface Built {
  readonly node: PdfNode;
  readonly yoga: YogaNode;
  readonly children: Built[];
  readonly isText: boolean;
}

/** Table content widths found by the previous pass; cells of a table not in it flex instead. */
type TableWidths = ReadonlyMap<PdfNode, number>;

// Each pass fixes the tables one nesting level deeper; deeper trees are rejected by the renderer.
const MAX_PASSES = 66;
const WIDTH_EPSILON = 1e-6;
// Yoga stores sizes as float32, which can round a measured width down by a few millionths.
const WIDTH_SLACK = 0.001;

/**
 * Column widths in points: fixed columns first, then percentages of `tableWidth`, then the rest
 * split by `fr` shares. Fixed and percentage columns that overflow leave the fr columns at 0.
 */
export function resolveColumns(columns: readonly TableColumn[], tableWidth: number): number[] {
  const widths = columns.map((column) => {
    if (typeof column === 'number') return column;
    if (column.endsWith('%')) return (parseFloat(column) / 100) * tableWidth;
    return 0;
  });
  const frOf = (column: TableColumn): number =>
    typeof column === 'string' && column.endsWith('fr') ? parseFloat(column) : 0;
  const totalFr = columns.reduce<number>((sum, column) => sum + frOf(column), 0);
  if (totalFr > 0) {
    const taken = widths.reduce((sum, width) => sum + width, 0);
    const perFr = Math.max(0, tableWidth - taken) / totalFr;
    columns.forEach((column, i) => {
      if (frOf(column) > 0) widths[i] = frOf(column) * perFr;
    });
  }
  return widths;
}

function percent(amount: number): `${number}%` {
  return `${String(amount)}%` as `${number}%`;
}

function yogaLength(length: Length): number | 'auto' | `${number}%` {
  return typeof length === 'object' ? percent(length.percent) : length;
}

/** Same as `yogaLength`, with `auto` meaning "no value" for properties that have no auto. */
function yogaLimit(length: Length): number | `${number}%` | undefined {
  if (length === 'auto') return undefined;
  return typeof length === 'object' ? percent(length.percent) : length;
}

function applyEdges(
  yoga: Yoga,
  edges: Edges<Length>,
  set: (edge: Edge, value: Length) => void,
): void {
  set(yoga.EDGE_TOP, edges.top);
  set(yoga.EDGE_RIGHT, edges.right);
  set(yoga.EDGE_BOTTOM, edges.bottom);
  set(yoga.EDGE_LEFT, edges.left);
}

const JUSTIFY = {
  'flex-start': 'JUSTIFY_FLEX_START',
  center: 'JUSTIFY_CENTER',
  'flex-end': 'JUSTIFY_FLEX_END',
  'space-between': 'JUSTIFY_SPACE_BETWEEN',
  'space-around': 'JUSTIFY_SPACE_AROUND',
  'space-evenly': 'JUSTIFY_SPACE_EVENLY',
} as const;

const ALIGN = {
  auto: 'ALIGN_AUTO',
  stretch: 'ALIGN_STRETCH',
  'flex-start': 'ALIGN_FLEX_START',
  center: 'ALIGN_CENTER',
  'flex-end': 'ALIGN_FLEX_END',
} as const;

function applyStyle(yoga: Yoga, node: YogaNode, style: ResolvedStyle): void {
  node.setFlexDirection(
    style.flexDirection === 'row' ? yoga.FLEX_DIRECTION_ROW : yoga.FLEX_DIRECTION_COLUMN,
  );
  node.setFlexGrow(style.flexGrow);
  // Yoga's default is 0; CSS (and ResolvedStyle) default to 1.
  node.setFlexShrink(style.flexShrink);
  node.setFlexBasis(yogaLength(style.flexBasis));
  node.setJustifyContent(yoga[JUSTIFY[style.justifyContent]]);
  node.setAlignItems(yoga[ALIGN[style.alignItems]]);
  node.setAlignSelf(yoga[ALIGN[style.alignSelf]]);
  node.setGap(yoga.GUTTER_ALL, style.gap);
  node.setWidth(yogaLength(style.width));
  node.setHeight(yogaLength(style.height));
  node.setMinWidth(yogaLimit(style.minWidth));
  node.setMinHeight(yogaLimit(style.minHeight));
  node.setMaxWidth(yogaLimit(style.maxWidth));
  node.setMaxHeight(yogaLimit(style.maxHeight));
  applyEdges(yoga, style.margin, (edge, value) => {
    node.setMargin(edge, yogaLength(value));
  });
  applyEdges(yoga, style.padding, (edge, value) => {
    node.setPadding(edge, yogaLimit(value));
  });
  node.setBorder(yoga.EDGE_TOP, style.borderWidth.top);
  node.setBorder(yoga.EDGE_RIGHT, style.borderWidth.right);
  node.setBorder(yoga.EDGE_BOTTOM, style.borderWidth.bottom);
  node.setBorder(yoga.EDGE_LEFT, style.borderWidth.left);
}

function styleOf(styles: ReadonlyMap<PdfNode, ResolvedStyle>, node: PdfNode): ResolvedStyle {
  const style = styles.get(node);
  if (!style) throw new Error(`ngpdf: no resolved style for <${node.tag}>`);
  return style;
}

/**
 * Lays `node` out in `width` points with unbounded height. Positions are relative to the parent
 * box. Yoga runs with a point scale factor of 0, so nothing is rounded to a pixel grid and a
 * text box is never narrower than its text; measured widths also get 0.001pt of slack, because
 * Yoga's float32 arithmetic can round a width down and wrap the last word.
 */
export function layoutBox(
  node: PdfNode,
  styles: ReadonlyMap<PdfNode, ResolvedStyle>,
  width: number,
  ctx: LayoutContext,
): Box {
  const { yoga } = ctx;
  const config = yoga.Config.create();
  config.setPointScaleFactor(0);
  const measures = new Map<PdfNode, Measure>();

  const measureOf = (textNode: PdfNode, style: ResolvedStyle): Measure => {
    let measure = measures.get(textNode);
    if (!measure) {
      const inner = measureText(textContent(textNode), style, ctx.metrics);
      const cache = new Map<number, { width: number; height: number }>();
      measure = (available, mode) => {
        const key = mode === 0 ? Infinity : available;
        let size = cache.get(key);
        if (!size) {
          const measured = inner(available, mode);
          size = { width: measured.width + WIDTH_SLACK, height: measured.height };
          cache.set(key, size);
        }
        return size;
      };
      measures.set(textNode, measure);
    }
    return measure;
  };

  const build = (
    current: PdfNode,
    tableWidths: TableWidths,
    columns: readonly number[] | null,
    spanStart: { next: number },
  ): Built => {
    const style = styleOf(styles, current);
    const yogaNode = yoga.Node.create(config);
    applyStyle(yoga, yogaNode, style);
    const isText = current.tag === 'pdf-text';
    const built: Built = { node: current, yoga: yogaNode, children: [], isText };

    if (isText) {
      yogaNode.setMeasureFunc(measureOf(current, style));
      return built;
    }

    let childColumns: readonly number[] | null = null;
    if (current.tag === 'pdf-table') {
      const known = tableWidths.get(current);
      const declared = (propsOf(current)['columns'] ?? []) as TableColumn[];
      childColumns = known === undefined ? null : resolveColumns(declared, known);
    } else if (current.tag === 'pdf-row' && columns) {
      // Cells carry the alignment, so a gap would shift them off their columns.
      yogaNode.setGap(yoga.GUTTER_ALL, 0);
      childColumns = columns;
    } else if (current.tag === 'pdf-cell' && columns) {
      const span = Math.max(1, Math.floor(Number(propsOf(current)['span'] ?? 1)) || 1);
      const start = spanStart.next;
      spanStart.next += span;
      const cellWidth = columns.slice(start, start + span).reduce((sum, w) => sum + w, 0);
      yogaNode.setWidth(cellWidth);
      yogaNode.setFlexGrow(0);
      yogaNode.setFlexShrink(0);
      yogaNode.setFlexBasis('auto');
    }

    // Row children are cells; each row restarts the column counter.
    const counter = current.tag === 'pdf-row' ? { next: 0 } : spanStart;
    let index = 0;
    for (const child of elementChildren(current)) {
      const isTableRow = current.tag === 'pdf-table';
      const nodeColumns =
        current.tag === 'pdf-table' || current.tag === 'pdf-row' ? childColumns : null;
      const builtChild = build(child, tableWidths, nodeColumns, isTableRow ? { next: 0 } : counter);
      built.children.push(builtChild);
      yogaNode.insertChild(builtChild.yoga, index++);
    }
    return built;
  };

  const read = (built: Built, found: Map<PdfNode, number>): Box => {
    const { node: current, yoga: yogaNode } = built;
    const style = styleOf(styles, current);
    const w = yogaNode.getComputedWidth();
    const insetX = (edge: Edge): number =>
      yogaNode.getComputedPadding(edge) + yogaNode.getComputedBorder(edge);
    const contentWidth = w - insetX(yoga.EDGE_LEFT) - insetX(yoga.EDGE_RIGHT);
    if (current.tag === 'pdf-table') found.set(current, contentWidth);
    const image = ctx.images.get(current);
    return {
      node: current,
      style,
      x: yogaNode.getComputedLeft(),
      y: yogaNode.getComputedTop(),
      w,
      h: yogaNode.getComputedHeight(),
      ...(built.isText
        ? { text: layoutText(textContent(current), style, contentWidth, ctx.metrics) }
        : {}),
      ...(image ? { image } : {}),
      children: built.children.map((child) => read(child, found)),
    };
  };

  return run(config, () => {
    let known: TableWidths = new Map();
    for (let pass = 1; ; pass++) {
      const root = build(node, known, null, { next: 0 });
      root.yoga.setWidth(width);
      root.yoga.calculateLayout(width, undefined, yoga.DIRECTION_LTR);
      const found = new Map<PdfNode, number>();
      let box: Box;
      try {
        box = read(root, found);
      } finally {
        root.yoga.freeRecursive();
      }
      if (pass === MAX_PASSES || sameWidths(known, found)) return box;
      known = found;
    }
  });
}

function sameWidths(a: TableWidths, b: TableWidths): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other === undefined || Math.abs(other - value) > WIDTH_EPSILON) return false;
  }
  return true;
}

/** Frees the shared config after `work`, also when it throws. */
function run<T>(config: Config, work: () => T): T {
  try {
    return work();
  } finally {
    config.free();
  }
}
