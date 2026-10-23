import type { PdfNode } from '../tree/node';
import { MAX_NESTING } from './style';

const PDF_ELEMENTS = new Set([
  'pdf-document',
  'pdf-page',
  'pdf-view',
  'pdf-text',
  'pdf-image',
  'pdf-table',
  'pdf-row',
  'pdf-cell',
  'pdf-page-number',
]);

/** A user component's host (or any element that is not one of the pdf-* elements). */
function isHost(node: PdfNode): boolean {
  return node.kind === 'element' && !PDF_ELEMENTS.has(node.tag);
}

/**
 * A copy of the document's tree in which every component host is replaced by its children, like
 * CSS `display: contents`. Every later stage then sees pages under the document, rows under a
 * table and cells under a row however the template splits them into components. A host's own
 * style is dropped, with a warning. The input tree is left unchanged.
 */
export function dissolveHosts(document: PdfNode, warn: (message: string) => void): PdfNode {
  const ignoreStyle = (host: PdfNode): void => {
    if (Object.keys(host.rawStyle).length > 0) {
      warn(`ngpdf: styles on <${host.tag}> are ignored; style a pdf-* element inside it`);
    }
  };
  for (let above = document.parent; above; above = above.parent) {
    if (isHost(above)) ignoreStyle(above);
  }

  const copy = (node: PdfNode, parent: PdfNode | null, depth: number): PdfNode => {
    if (depth > MAX_NESTING) throw new Error(`ngpdf: nesting deeper than ${String(MAX_NESTING)}`);
    const out: PdfNode = { ...node, parent, children: [] };
    const adopt = (children: readonly PdfNode[]): void => {
      for (const child of children) {
        if (isHost(child)) {
          ignoreStyle(child);
          adopt(child.children);
        } else {
          out.children.push(copy(child, out, depth + 1));
        }
      }
    };
    adopt(node.children);
    return out;
  };

  const root = copy(document, null, 1);
  if (!root.children.some((child) => child.kind === 'element' && child.tag === 'pdf-page')) {
    throw new Error('ngpdf: pdf-document has no pdf-page');
  }
  return root;
}
