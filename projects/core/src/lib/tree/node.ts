export type PdfNodeKind = 'element' | 'text' | 'comment';

export interface PdfNode {
  kind: PdfNodeKind;
  /** Element tag; empty for text and comment nodes. */
  tag: string;
  /** The element component that owns this node; set by the pdf-* components. */
  owner: { pdfProps(): Record<string, unknown> } | null;
  /** Kebab-case CSS property to its value as written. */
  rawStyle: Record<string, string>;
  text: string;
  parent: PdfNode | null;
  children: PdfNode[];
}

export function createNode(kind: PdfNodeKind, tag = '', text = ''): PdfNode {
  return { kind, tag, owner: null, rawStyle: {}, text, parent: null, children: [] };
}

export function elementChildren(node: PdfNode): PdfNode[] {
  return node.children.filter((child) => child.kind === 'element');
}

export function textContent(node: PdfNode): string {
  if (node.kind === 'text') return node.text;
  if (node.kind === 'comment') return '';
  return node.children.map(textContent).join('');
}

export function propsOf(node: PdfNode): Record<string, unknown> {
  return node.owner?.pdfProps() ?? {};
}
