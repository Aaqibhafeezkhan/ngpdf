import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { renderDocument } from './index';
import { createPdfkitWriter, type DocumentInfo, type PageOps, type PdfWriter } from './writer';

let real: PdfWriter;
beforeAll(async () => {
  real = await createPdfkitWriter({ compress: false });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

function text(content: string): PdfNode {
  const node = el('pdf-text');
  const run = createNode('text', '', content);
  run.parent = node;
  node.children.push(run);
  return node;
}

function host(documentProps: Record<string, unknown>, pages: PdfNode[]): PdfNode {
  return el('div', {}, [el('pdf-document', {}, pages, documentProps)]);
}

/** Pages of 1 and 3 sheets: three 400pt rows fill one A4 page at two rows. */
function twoPages(documentProps: Record<string, unknown> = {}): PdfNode {
  const one = el('pdf-page', {}, [text('single')], { size: 'A4' });
  const rows = [0, 1, 2, 3, 4, 5].map(() => el('pdf-view', { height: '400' }));
  const three = el('pdf-page', {}, rows, { size: 'A4' });
  return host(documentProps, [one, three]);
}

interface Recorded {
  pages: readonly PageOps[];
  info: DocumentInfo;
}

function recordingWriter(): PdfWriter & { recorded: Recorded[] } {
  const recorded: Recorded[] = [];
  return {
    widthOf: (t, f, s) => real.widthOf(t, f, s),
    ascent: (f, s) => real.ascent(f, s),
    imageSize: (d) => real.imageSize(d),
    write: (pages, info) => {
      recorded.push({ pages, info });
      return Promise.resolve(new Blob(['x']));
    },
    recorded,
  };
}

async function bytesOf(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(await blob.arrayBuffer());
}

describe('renderDocument', () => {
  it('hands the writer every page and the document metadata', async () => {
    const writer = recordingWriter();
    const props = { title: 'Report', author: 'Ana', subject: 'S', keywords: ['a', 'b'] };
    await renderDocument(twoPages(props), { writer, dev: false });
    const [{ pages, info }] = writer.recorded as [Recorded];
    expect(pages).toHaveLength(4);
    expect(info).toMatchObject(props);
    expect(pages[0]!.width).toBe(595.28);
    expect(pages[0]!.ops.some((op) => op.op === 'text' && op.text === 'single')).toBe(true);
  });

  it('leaves unset metadata out of the info', async () => {
    const writer = recordingWriter();
    await renderDocument(twoPages(), { writer, dev: false });
    expect(Object.keys(writer.recorded[0]!.info)).toEqual(['creationDate']);
  });

  it('numbers page-number text across all pages of the document', async () => {
    const writer = recordingWriter();
    const number = el('pdf-page-number', {}, [], { format: '{page}/{total}' });
    const first = el('pdf-page', {}, [text('a'), number], { size: 'A4' });
    const second = el(
      'pdf-page',
      { 'break-before': 'true' },
      [text('b'), el('pdf-page-number', {}, [], { format: '{page}/{total}' })],
      { size: 'A4' },
    );
    await renderDocument(host({}, [first, second]), { writer, dev: false });
    const labels = writer.recorded[0]!.pages.map((p) =>
      p.ops.flatMap((op) => (op.op === 'text' ? [op.text] : [])).at(-1),
    );
    expect(labels).toEqual(['1/2', '2/2']);
  });

  it('throws when the tree has no pdf-document', async () => {
    await expect(renderDocument(el('div'), { writer: recordingWriter() })).rejects.toThrow(
      'ngpdf: no pdf-document in the rendered component',
    );
    await expect(renderDocument(createNode('text', '', 'x'))).rejects.toThrow(
      'ngpdf: no pdf-document',
    );
  });

  it('reads the clock once per render when creationDate is unset', async () => {
    const RealDate = Date;
    let constructed = 0;
    class CountingDate extends RealDate {
      constructor(...args: [] | [number | string | Date]) {
        if (args.length === 0) constructed++;
        super(...(args as [number]));
      }
    }
    vi.stubGlobal('Date', CountingDate);
    const writer = recordingWriter();
    await renderDocument(twoPages(), { writer, dev: false });
    expect(constructed).toBe(1);
    expect(writer.recorded[0]!.info.creationDate).toBeInstanceOf(RealDate);
  });

  it('uses a bound creationDate and does not need the clock', async () => {
    const writer = recordingWriter();
    const date = new Date(Date.UTC(2026, 0, 2));
    await renderDocument(twoPages({ creationDate: date }), { writer, dev: false });
    expect(writer.recorded[0]!.info.creationDate).toBe(date);
  });

  it('resolves a PDF Blob from the real writer', async () => {
    const blob = await renderDocument(twoPages({ creationDate: new Date(0) }), { dev: false });
    expect(blob.type).toBe('application/pdf');
    expect(await bytesOf(blob)).toMatch(/^%PDF-/);
  });

  it('writes none of the active-content keys', async () => {
    // The real engine, uncompressed so the object dictionaries are readable.
    const writer = await createPdfkitWriter({ compress: false });
    const blob = await renderDocument(twoPages({ title: 'T', creationDate: new Date(0) }), {
      writer,
      dev: false,
    });
    const body = await bytesOf(blob);
    for (const key of ['/JavaScript', '/JS', '/OpenAction', '/Launch', '/AA', '/EmbeddedFile']) {
      expect(body).not.toContain(key);
    }
  });

  it('gives the same bytes for the same tree and a fixed creationDate', async () => {
    const render = async (): Promise<string> => {
      const writer = await createPdfkitWriter({ compress: false });
      const props = { title: 'T', creationDate: new Date(0) };
      return bytesOf(await renderDocument(twoPages(props), { writer, dev: false }));
    };
    expect(await render()).toBe(await render());
  });

  describe('warnings', () => {
    function tallPage(): PdfNode {
      const unit = (): PdfNode => el('pdf-view', { height: '1200' });
      return host({}, [el('pdf-page', {}, [unit(), unit()], { size: 'A4' })]);
    }

    it('prints identical warnings once', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await renderDocument(tallPage(), { writer: recordingWriter(), dev: true });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        'ngpdf: pdf-view is taller than a page and is cut at the bottom',
      );
    });

    it('still prints the warnings when the write fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const writer = { ...recordingWriter(), write: () => Promise.reject(new Error('disk full')) };
      await expect(renderDocument(tallPage(), { writer, dev: true })).rejects.toThrow('disk full');
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('prints nothing when dev is false', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await renderDocument(tallPage(), { writer: recordingWriter(), dev: false });
      expect(warn).not.toHaveBeenCalled();
    });

    it('defaults dev to the ngDevMode check', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await renderDocument(tallPage(), { writer: recordingWriter() });
      expect(warn).toHaveBeenCalledTimes(1);
      vi.stubGlobal('ngDevMode', false);
      await renderDocument(tallPage(), { writer: recordingWriter() });
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('names every replaced character once, in one message', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const number = el('pdf-page-number', {}, [], { format: 'Ω {page}' });
      const doc = host({}, [el('pdf-page', {}, [text('ő ő'), text('ő 😀'), number])]);
      const writer = recordingWriter();
      await renderDocument(doc, { writer, dev: true });
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]![0]);
      expect(message).toMatch(/^ngpdf: characters outside WinAnsi replaced with "\?": /);
      for (const char of ['ő', '😀', 'Ω']) expect(message.split(char)).toHaveLength(2);
      const texts = writer.recorded[0]!.pages[0]!.ops.flatMap((op) =>
        op.op === 'text' ? [op.text] : [],
      );
      expect(texts).toContain('? ?');
    });
  });
});
