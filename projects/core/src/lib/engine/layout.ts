import type { Edge, Node as YogaNode, Yoga } from 'yoga-layout/load';
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
  /**
   * Dev-mode warnings (ignored table styles, table columns that did not settle), at most one of
   * each kind per `layoutBox` call. The caller decides where they go.
   */
  readonly warn?: (message: string) => void;
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

/**
 * Sets the style on a fresh Yoga node. Each setter is a call into WebAssembly, so values equal
 * to Yoga's defaults (column, stretch, auto sizes, no limits, zero edges) are skipped: a
 * 1,000-row table makes hundreds of thousands of these calls otherwise.
 */
function applyStyle(yoga: Yoga, node: YogaNode, style: ResolvedStyle): void {
  if (style.flexDirection === 'row') node.setFlexDirection(yoga.FLEX_DIRECTION_ROW);
  if (style.flexGrow !== 0) node.setFlexGrow(style.flexGrow);
  // Yoga's default is 0; CSS (and ResolvedStyle) default to 1.
  if (style.flexShrink !== 0) node.setFlexShrink(style.flexShrink);
  if (style.flexBasis !== 'auto') node.setFlexBasis(yogaLength(style.flexBasis));
  if (style.justifyContent !== 'flex-start') {
    node.setJustifyContent(yoga[JUSTIFY[style.justifyContent]]);
  }
  if (style.alignItems !== 'stretch') node.setAlignItems(yoga[ALIGN[style.alignItems]]);
  if (style.alignSelf !== 'auto') node.setAlignSelf(yoga[ALIGN[style.alignSelf]]);
  if (style.gap !== 0) node.setGap(yoga.GUTTER_ALL, style.gap);
  if (style.width !== 'auto') node.setWidth(yogaLength(style.width));
  if (style.height !== 'auto') node.setHeight(yogaLength(style.height));
  if (style.minWidth !== 'auto') node.setMinWidth(yogaLimit(style.minWidth));
  if (style.minHeight !== 'auto') node.setMinHeight(yogaLimit(style.minHeight));
  if (style.maxWidth !== 'auto') node.setMaxWidth(yogaLimit(style.maxWidth));
  if (style.maxHeight !== 'auto') node.setMaxHeight(yogaLimit(style.maxHeight));
  applyEdges(yoga, style.margin, (edge, value) => {
    if (value !== 0) node.setMargin(edge, yogaLength(value));
  });
  applyEdges(yoga, style.padding, (edge, value) => {
    if (value !== 0 && value !== 'auto') node.setPadding(edge, yogaLimit(value));
  });
  const border = style.borderWidth;
  if (border.top !== 0) node.setBorder(yoga.EDGE_TOP, border.top);
  if (border.right !== 0) node.setBorder(yoga.EDGE_RIGHT, border.right);
  if (border.bottom !== 0) node.setBorder(yoga.EDGE_BOTTOM, border.bottom);
  if (border.left !== 0) node.setBorder(yoga.EDGE_LEFT, border.left);
}

function styleOf(styles: ReadonlyMap<PdfNode, ResolvedStyle>, node: PdfNode): ResolvedStyle {
  const style = styles.get(node);
  if (!style) throw new Error(`ngpdf: no resolved style for <${node.tag}>`);
  return style;
}

/**
 * An image with one dimension set follows the aspect ratio for the other; with none set it
 * takes its natural size (1 pixel = 1pt), capped to the available width.
 */
function sizeImage(
  node: YogaNode,
  style: ResolvedStyle,
  asset: ImageAsset,
  yoga: Yoga,
  parent: ResolvedStyle | undefined,
): void {
  const { width, height } = style;
  if (!(asset.width > 0 && asset.height > 0)) {
    // No usable ratio: the image takes its style size, or nothing.
    if (width === 'auto') node.setWidth(0);
    if (height === 'auto') node.setHeight(0);
    return;
  }
  const ratio = asset.width / asset.height;
  if (width === 'auto' && height === 'auto') {
    // Measured, so the width can be capped while the height follows it. A stretching parent
    // would widen (column) or lengthen (row) the image away from its ratio, so only that case
    // (neither the image nor the parent asks for another alignment) is moved to the start.
    // An explicit `align-self: stretch` is kept: the image fills the width and its height follows the ratio.
    if (style.alignSelf === 'auto' && parent?.alignItems === 'stretch') {
      node.setAlignSelf(yoga.ALIGN_FLEX_START);
    }
    node.setMeasureFunc((available, mode) => {
      let fitted = Math.min(asset.width, available);
      if (mode === yoga.MEASURE_MODE_UNDEFINED) fitted = asset.width;
      else if (mode === yoga.MEASURE_MODE_EXACTLY) fitted = available;
      return { width: fitted, height: fitted / ratio };
    });
  } else if (height === 'auto') {
    node.setAspectRatio(ratio);
  } else if (width === 'auto') {
    if (typeof height === 'number') node.setWidth(height * ratio);
    else node.setAspectRatio(ratio);
  }
}

const zeroEdge: Length = 0;

function isZero(length: Length): boolean {
  return length === 0;
}

/**
 * Inside a table, rows and cells give up the styles that would move cells off their columns:
 * a row keeps vertical padding and borders and its background, but its horizontal padding,
 * left/right border, margin, justify-content and direction are fixed; a cell loses its margin
 * and min/max width. `ignored` collects the properties the author had set.
 */
function tableStyle(style: ResolvedStyle, node: PdfNode, ignored: Set<string>): ResolvedStyle {
  const parent = node.parent;
  if (node.tag === 'pdf-row' && parent?.tag === 'pdf-table') {
    const { padding, borderWidth, margin } = style;
    if (!isZero(padding.left)) ignored.add('pdf-row padding-left');
    if (!isZero(padding.right)) ignored.add('pdf-row padding-right');
    if (borderWidth.left !== 0) ignored.add('pdf-row border-left');
    if (borderWidth.right !== 0) ignored.add('pdf-row border-right');
    if (Object.values(margin).some((side) => !isZero(side as Length))) {
      ignored.add('pdf-row margin');
    }
    if (style.justifyContent !== 'flex-start') ignored.add('pdf-row justify-content');
    if (style.flexDirection !== 'row') ignored.add('pdf-row flex-direction');
    return {
      ...style,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      gap: 0,
      margin: { top: zeroEdge, right: zeroEdge, bottom: zeroEdge, left: zeroEdge },
      padding: { ...padding, left: zeroEdge, right: zeroEdge },
      borderWidth: { ...borderWidth, left: 0, right: 0 },
    };
  }
  if (node.tag === 'pdf-cell' && parent?.tag === 'pdf-row' && parent.parent?.tag === 'pdf-table') {
    if (Object.values(style.margin).some((side) => !isZero(side as Length))) {
      ignored.add('pdf-cell margin');
    }
    if (style.minWidth !== 'auto') ignored.add('pdf-cell min-width');
    if (style.maxWidth !== 'auto') ignored.add('pdf-cell max-width');
    return {
      ...style,
      margin: { top: zeroEdge, right: zeroEdge, bottom: zeroEdge, left: zeroEdge },
      minWidth: 'auto',
      maxWidth: 'auto',
    };
  }
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
  const created: YogaNode[] = [];
  const ignored = new Set<string>();
  const effective = new Map<PdfNode, ResolvedStyle>();

  const styleFor = (current: PdfNode): ResolvedStyle => {
    let style = effective.get(current);
    if (!style) {
      style = tableStyle(styleOf(styles, current), current, ignored);
      effective.set(current, style);
    }
    return style;
  };

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
    const style = styleFor(current);
    const yogaNode = yoga.Node.create(config);
    created.push(yogaNode);
    applyStyle(yoga, yogaNode, style);
    const asset = current.tag === 'pdf-image' ? ctx.images.get(current) : undefined;
    if (asset) {
      sizeImage(
        yogaNode,
        style,
        asset,
        yoga,
        current.parent ? styleFor(current.parent) : undefined,
      );
    }
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

  const collectTableWidths = (built: Built, found: Map<PdfNode, number>): void => {
    if (built.node.tag === 'pdf-table') found.set(built.node, contentWidthOf(built.yoga));
    for (const child of built.children) collectTableWidths(child, found);
  };

  const contentWidthOf = (yogaNode: YogaNode): number => {
    const inset = (edge: Edge): number =>
      yogaNode.getComputedPadding(edge) + yogaNode.getComputedBorder(edge);
    return yogaNode.getComputedWidth() - inset(yoga.EDGE_LEFT) - inset(yoga.EDGE_RIGHT);
  };

  // Only the final pass reads boxes, so text is wrapped once per node.
  const read = (built: Built): Box => {
    const { node: current, yoga: yogaNode } = built;
    const style = styleFor(current);
    const image = ctx.images.get(current);
    return {
      node: current,
      style,
      x: yogaNode.getComputedLeft(),
      y: yogaNode.getComputedTop(),
      w: yogaNode.getComputedWidth(),
      h: yogaNode.getComputedHeight(),
      ...(built.isText
        ? {
            text: layoutText(textContent(current), style, contentWidthOf(yogaNode), ctx.metrics),
          }
        : {}),
      ...(image ? { image } : {}),
      children: built.children.map(read),
    };
  };

  try {
    let known: TableWidths = new Map();
    for (let pass = 1; ; pass++) {
      const root = build(node, known, null, { next: 0 });
      root.yoga.setWidth(width);
      root.yoga.calculateLayout(width, undefined, yoga.DIRECTION_LTR);
      const found = new Map<PdfNode, number>();
      collectTableWidths(root, found);
      const settled = sameWidths(known, found);
      if (settled || pass === MAX_PASSES) {
        if (!settled) ctx.warn?.('ngpdf: table columns did not settle');
        const box = read(root);
        if (ignored.size > 0) {
          ctx.warn?.(`ngpdf: ignored inside tables: ${[...ignored].join(', ')}`);
        }
        return box;
      }
      known = found;
      freeAll(created);
    }
  } finally {
    freeAll(created);
    config.free();
  }
}

/** Frees every node created so far, also those a failed build never attached. */
function freeAll(nodes: YogaNode[]): void {
  for (const created of nodes.splice(0)) created.free();
}

function sameWidths(a: TableWidths, b: TableWidths): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other === undefined || Math.abs(other - value) > WIDTH_EPSILON) return false;
  }
  return true;
}
