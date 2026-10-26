// ng-packagr compiles from the entry point, so the ambient module declarations are named here.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./pdfkit-standalone.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./linebreak.d.ts" />
import { elementChildren, propsOf, type PdfNode } from '../tree/node';
import { displayList } from './display-list';
import { dissolveHosts } from './hosts';
import { loadImages } from './images';
import type { LayoutContext } from './layout';
import { paginatePage } from './paginate';
import { resolveStyles } from './style';
import { TextMeasureCache } from './text';
import { createPdfkitWriter, type DocumentInfo, type PageOps, type PdfWriter } from './writer';
import type { Yoga } from 'yoga-layout/load';

export const PAGE_MODES = ['UseNone', 'UseThumbs', 'FullScreen'] as const;
export type PageMode = (typeof PAGE_MODES)[number];

export const PAGE_LAYOUTS = [
  'SinglePage', 'OneColumn', 'TwoColumnLeft', 'TwoColumnRight', 'TwoPageLeft', 'TwoPageRight',
] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];

declare const ngDevMode: unknown;

export interface RenderDocumentOptions {
  /** Emit the render's warnings with `console.warn`. Defaults to Angular's dev-mode check. */
  readonly dev?: boolean;
  /** Replaces the pdfkit writer; tests use it to see what the engine hands over. */
  readonly writer?: PdfWriter;
}

// The one piece of module state: the Yoga WebAssembly module is compiled once per page load.
let yogaLoading: Promise<Yoga> | undefined;

function loadYogaOnce(): Promise<Yoga> {
  yogaLoading ??= import('yoga-layout/load')
    .then(({ loadYoga }) => loadYoga())
    .catch((error: unknown) => {
      yogaLoading = undefined;
      throw error;
    });
  return yogaLoading;
}

function findDocument(node: PdfNode): PdfNode | undefined {
  if (node.kind !== 'element') return undefined;
  if (node.tag === 'pdf-document') return node;
  for (const child of node.children) {
    const found = findDocument(child);
    if (found) return found;
  }
  return undefined;
}

function enumValue<T extends string>(
  value: unknown,
  name: 'pageMode' | 'pageLayout',
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`ngpdf: invalid ${name} "${String(value)}"`);
  }
  return value as T;
}

function languageOf(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('ngpdf: invalid language');
  try {
    const language = Intl.getCanonicalLocales(value)[0];
    if (language === undefined) throw new Error();
    return language;
  } catch {
    throw new Error(`ngpdf: invalid language "${value}"`);
  }
}

function infoOf(document: PdfNode, now: Date): DocumentInfo {
  const props = propsOf(document);
  const text = (name: string): string | undefined => {
    const value = props[name];
    return typeof value === 'string' ? value : undefined;
  };
  const title = text('title');
  const author = text('author');
  const subject = text('subject');
  const creator = text('creator');
  const producer = text('producer');
  const keywords = props['keywords'];
  const date = props['creationDate'];
  const language = languageOf(props['language']);
  const pageMode = enumValue(props['pageMode'], 'pageMode', PAGE_MODES);
  const pageLayout = enumValue(props['pageLayout'], 'pageLayout', PAGE_LAYOUTS);
  return {
    ...(title !== undefined && { title }),
    ...(author !== undefined && { author }),
    ...(subject !== undefined && { subject }),
    ...(Array.isArray(keywords) && { keywords: keywords as readonly string[] }),
    ...(language !== undefined && { language }),
    ...(creator !== undefined && { creator }),
    producer: producer ?? 'ngpdf',
    ...(pageMode !== undefined && { pageMode }),
    ...(pageLayout !== undefined && { pageLayout }),
    creationDate: date instanceof Date ? date : now,
  };
}

/**
 * Lays out, paginates and writes the document under `root` (the host element from `renderTree`).
 * Warnings of one render are collected once each and printed at the end, in dev mode only.
 */
export async function renderDocument(
  root: PdfNode,
  options: RenderDocumentOptions = {},
): Promise<Blob> {
  // The clock is read once, so every use of "now" in one render agrees.
  const now = new Date();
  const dev = options.dev ?? (typeof ngDevMode === 'undefined' || !!ngDevMode);
  const document = findDocument(root);
  if (!document) throw new Error('ngpdf: no pdf-document in the rendered component');

  const warnings = new Set<string>();
  const warn = (message: string): void => {
    warnings.add(message);
  };
  // One message for the whole render, naming every distinct character once.
  const replaced = new Set<string>();
  const warnChars = (chars: string[]): void => {
    for (const char of chars) replaced.add(char);
  };

  const [yoga, writer] = await Promise.all([
    loadYogaOnce(),
    options.writer ?? createPdfkitWriter({ compress: true }),
  ]);
  try {
    // Component hosts are transparent: the stages below see only pdf-* elements.
    const tree = dissolveHosts(document, warn);
    const styles = resolveStyles(tree, warn);
    const images = await loadImages(tree, writer);
    // One text cache per render, passed down like the metrics and images, so renders share nothing.
    const textCache = new TextMeasureCache();
    const ctx: LayoutContext = { yoga, metrics: writer, images, warn, warnChars, textCache };

    const layouts = elementChildren(tree)
      .filter((child) => child.tag === 'pdf-page')
      .flatMap((child) => paginatePage(child, styles, ctx));
    const pages: PageOps[] = layouts.map((layout, index) => ({
      width: layout.width,
      height: layout.height,
      ops: displayList(layout, index, layouts.length, undefined, {
        metrics: writer,
        warn: warnChars,
      }),
    }));
    return await writer.write(pages, infoOf(document, now));
  } finally {
    // Also on failure: a warning often explains why the render broke.
    if (replaced.size > 0) {
      warn(`ngpdf: characters outside WinAnsi replaced with "?": ${[...replaced].join('')}`);
    }
    if (dev) for (const message of warnings) console.warn(message);
  }
}
