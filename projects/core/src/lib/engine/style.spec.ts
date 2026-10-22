import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { parseLength, resolveStyles, ROOT_TEXT_STYLE } from './style';

function el(tag: string, rawStyle: Record<string, string> = {}, children: PdfNode[] = []): PdfNode {
  const node = createNode('element', tag);
  node.rawStyle = rawStyle;
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

function styleOf(rawStyle: Record<string, string>, tag = 'pdf-view') {
  const node = el(tag, rawStyle);
  const style = resolveStyles(el('pdf-document', {}, [node])).get(node);
  if (!style) throw new Error('missing style');
  return style;
}

describe('parseLength', () => {
  it('converts units to points', () => {
    expect(parseLength('10mm')).toBeCloseTo(28.346, 3);
    expect(parseLength('1in')).toBe(72);
    expect(parseLength('1cm')).toBeCloseTo(28.346, 3);
    expect(parseLength('12px')).toBe(12);
    expect(parseLength('12pt')).toBe(12);
    expect(parseLength('12')).toBe(12);
    expect(parseLength('-4.5')).toBe(-4.5);
  });

  it('parses percent and auto', () => {
    expect(parseLength('50%')).toEqual({ percent: 50 });
    expect(parseLength('auto')).toBe('auto');
  });

  it('throws on unknown units and garbage', () => {
    expect(() => parseLength('3em')).toThrow(/^ngpdf: unknown unit in "3em"/);
    expect(() => parseLength('abc')).toThrow(/^ngpdf:/);
    expect(() => parseLength('')).toThrow(/^ngpdf:/);
  });
});

describe('resolveStyles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses root text defaults', () => {
    const style = styleOf({});
    expect(style).toMatchObject(ROOT_TEXT_STYLE);
    expect(ROOT_TEXT_STYLE).toEqual({
      color: '#000',
      fontFamily: 'Helvetica',
      fontSize: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      lineHeight: 1.2,
      textAlign: 'left',
      textDecoration: 'none',
    });
  });

  it('expands padding and margin shorthands', () => {
    const style = styleOf({ padding: '4 8', margin: '1 2 3' });
    expect(style.padding).toEqual({ top: 4, right: 8, bottom: 4, left: 8 });
    expect(style.margin).toEqual({ top: 1, right: 2, bottom: 3, left: 2 });
    expect(styleOf({ padding: '5' }).padding).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
    expect(styleOf({ padding: '1 2 3 4' }).padding).toEqual({
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    });
    expect(styleOf({ margin: 'auto 10%' }).margin.top).toBe('auto');
  });

  it('lets a longhand override the shorthand it follows', () => {
    const style = styleOf({ padding: '4', 'padding-left': '9' });
    expect(style.padding).toEqual({ top: 4, right: 4, bottom: 4, left: 9 });
  });

  it('rejects a shorthand with too many values', () => {
    expect(() => styleOf({ padding: '1 2 3 4 5' })).toThrow(/^ngpdf:/);
  });

  it('sets only one side with border-bottom', () => {
    const style = styleOf({ 'border-bottom': '1 solid #ddd' });
    expect(style.borderWidth).toEqual({ top: 0, right: 0, bottom: 1, left: 0 });
    expect(style.borderColor.bottom).toBe('#ddd');
    expect(style.borderColor.top).toBe('#000');
  });

  it('applies border to all sides and draws other styles solid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const style = styleOf({ border: '2pt dashed red' });
    expect(style.borderWidth).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    expect(style.borderColor.left).toBe('red');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^ngpdf:/);
  });

  it('expands border-width and border-color like margin', () => {
    const style = styleOf({ 'border-width': '1 2', 'border-color': 'red blue green' });
    expect(style.borderWidth).toEqual({ top: 1, right: 2, bottom: 1, left: 2 });
    expect(style.borderColor).toEqual({ top: 'red', right: 'blue', bottom: 'green', left: 'blue' });
    expect(() => styleOf({ 'border-width': '1 2 3 4 5' })).toThrow(/^ngpdf:/);
    expect(() => styleOf({ 'border-width': '2%' })).toThrow(/^ngpdf:/);
  });

  it('sets one side with the border-<side>-width and -color longhands', () => {
    const width = styleOf({ 'border-top-width': '3', 'border-left-width': '1mm' });
    expect(width.borderWidth.top).toBe(3);
    expect(width.borderWidth.left).toBeCloseTo(2.835, 3);
    expect(width.borderWidth.right).toBe(0);
    const color = styleOf({ 'border-right-color': 'blue', 'border-bottom-color': '#abc' });
    expect(color.borderColor).toEqual({ top: '#000', right: 'blue', bottom: '#abc', left: '#000' });
  });

  it('applies border declarations in order', () => {
    const later = styleOf({ border: '1 solid red', 'border-left-color': 'blue' });
    expect(later.borderColor).toEqual({ top: 'red', right: 'red', bottom: 'red', left: 'blue' });
    const earlier = styleOf({ 'border-left-color': 'blue', border: '1 solid red' });
    expect(earlier.borderColor.left).toBe('red');
    const widths = styleOf({ border: '1 solid red', 'border-width': '4' });
    expect(widths.borderWidth.top).toBe(4);
    expect(widths.borderColor.top).toBe('red');
  });

  it('expands the flex shorthand', () => {
    const one = styleOf({ flex: '2' });
    expect([one.flexGrow, one.flexShrink, one.flexBasis]).toEqual([2, 1, 0]);
    const two = styleOf({ flex: '2 3' });
    expect([two.flexGrow, two.flexShrink, two.flexBasis]).toEqual([2, 3, 0]);
    const three = styleOf({ flex: '1 0 50%' });
    expect([three.flexGrow, three.flexShrink, three.flexBasis]).toEqual([1, 0, { percent: 50 }]);
    const basis = styleOf({ flex: '1 10mm' });
    expect(basis.flexShrink).toBe(1);
    expect(basis.flexBasis).toBeCloseTo(28.346, 3);
  });

  it('defaults flexDirection by tag', () => {
    expect(styleOf({}, 'pdf-row').flexDirection).toBe('row');
    expect(styleOf({}, 'pdf-view').flexDirection).toBe('column');
    expect(styleOf({ 'flex-direction': 'row' }).flexDirection).toBe('row');
  });

  it('resolves bold from keyword or weight >= 600', () => {
    expect(styleOf({ 'font-weight': 'bold' }).fontWeight).toBe('bold');
    expect(styleOf({ 'font-weight': '600' }).fontWeight).toBe('bold');
    expect(styleOf({ 'font-weight': '500' }).fontWeight).toBe('normal');
  });

  it('resolves line-height from a multiplier or a length', () => {
    expect(styleOf({ 'line-height': '1.5' }).lineHeight).toBe(1.5);
    expect(styleOf({ 'line-height': '14pt', 'font-size': '10' }).lineHeight).toBeCloseTo(1.4);
    expect(styleOf({ 'line-height': '150%' }).lineHeight).toBe(1.5);
    expect(styleOf({ 'line-height': '14', 'font-size': '10' }).lineHeight).toBe(14);
    expect(styleOf({ 'line-height': '20px', 'font-size': '10' }).lineHeight).toBe(2);
  });

  it('does not divide by a zero font size', () => {
    const style = styleOf({ 'line-height': '14pt', 'font-size': '0' });
    expect(style.lineHeight).toBe(1.2);
  });

  it('inherits text properties from the nearest setting ancestor, not the rest', () => {
    const white = el('pdf-text', { color: 'white', 'font-weight': '700' });
    const plain = el('pdf-text');
    const row = el('pdf-row', { color: 'white', 'font-weight': '700', 'background-color': 'red' }, [
      el('pdf-text', {}, []),
    ]);
    const sibling = el('pdf-row', {}, [plain]);
    const inner = el('pdf-view', { padding: '4' }, [white]);
    const root = el('pdf-document', {}, [row, sibling, inner]);
    const styles = resolveStyles(root);

    const rowText = row.children[0]!;
    expect(styles.get(rowText)).toMatchObject({ color: 'white', fontWeight: 'bold' });
    expect(styles.get(rowText)?.backgroundColor).toBeNull();
    expect(styles.get(rowText)?.padding.top).toBe(0);
    expect(styles.get(plain)).toMatchObject({ color: '#000', fontWeight: 'normal' });
    expect(styles.get(white)).toMatchObject({ color: 'white', fontWeight: 'bold' });
  });

  it('inherits through an intermediate that does not set the property', () => {
    const leaf = el('pdf-text');
    const mid = el('pdf-view', {}, [leaf]);
    const top = el('pdf-view', { 'font-size': '20', 'text-align': 'center' }, [mid]);
    const styles = resolveStyles(el('pdf-document', {}, [top]));
    expect(styles.get(leaf)).toMatchObject({ fontSize: 20, textAlign: 'center' });
  });

  it('reads breakBefore from props or break-before: page', () => {
    const withProp = el('pdf-view');
    withProp.owner = { pdfProps: () => ({ breakBefore: true }) };
    const root = el('pdf-document', {}, [withProp, el('pdf-view', { 'break-before': 'page' })]);
    const styles = resolveStyles(root);
    expect(styles.get(withProp)?.breakBefore).toBe(true);
    expect(styles.get(root.children[1]!)?.breakBefore).toBe(true);
    expect(styleOf({}).breakBefore).toBe(false);
  });

  it('ignores unknown properties and throws on unknown units', () => {
    expect(() => styleOf({ 'z-index': '3', cursor: 'pointer' })).not.toThrow();
    expect(() => styleOf({ width: '3em' }, 'pdf-view')).toThrow(
      'ngpdf: unknown unit in "3em" on pdf-view',
    );
  });

  it('skips text and comment nodes', () => {
    const text = createNode('text', '', 'hi');
    const view = el('pdf-text', {}, [text]);
    const styles = resolveStyles(el('pdf-document', {}, [view]));
    expect(styles.has(text)).toBe(false);
    expect(styles.has(view)).toBe(true);
  });

  it('accepts 64 nested elements and throws on the 65th', () => {
    const build = (depth: number) => {
      let node = el('pdf-view');
      for (let i = 1; i < depth; i++) node = el('pdf-view', {}, [node]);
      return node;
    };
    expect(() => resolveStyles(build(64))).not.toThrow();
    expect(() => resolveStyles(build(65))).toThrow('ngpdf: nesting deeper than 64');
    expect(() => resolveStyles(build(100000))).toThrow('ngpdf: nesting deeper than 64');
  });
});
