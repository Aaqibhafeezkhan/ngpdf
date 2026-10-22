import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPdfkitWriter, type DrawOp, type PdfWriter } from './writer';

/** 3x2 8-bit grayscale PNG, generated so no binary file sits in the repo. */
function tinyPng(): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: number[]) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, data: number[]) => {
    const body = Array.from(type, (ch) => ch.charCodeAt(0)).concat(data);
    return [...u32(data.length), ...body, ...u32(crc(body))];
  };
  // zlib stream of two filter-0 rows (3 bytes each), stored (uncompressed) block.
  const raw = [0, 10, 100, 200, 0, 30, 60, 90];
  const adler = (() => {
    let a = 1;
    let b = 0;
    for (const v of raw) {
      a = (a + v) % 65521;
      b = (b + a) % 65521;
    }
    return u32(((b << 16) | a) >>> 0);
  })();
  const len = raw.length;
  const zlib = [
    0x78,
    0x01,
    1,
    len & 255,
    len >> 8,
    ~len & 255,
    (~len >> 8) & 255,
    ...raw,
    ...adler,
  ];
  const ihdr = [...u32(3), ...u32(2), 8, 0, 0, 0, 0];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlib),
    ...chunk('IEND', []),
  ]);
}

const A4 = { width: 595.28, height: 841.89 };
const info = { title: 'Quarterly report', creationDate: new Date('2026-01-02T03:04:05Z') };

describe('createPdfkitWriter', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });

  it('measures text with the standard font metrics', () => {
    expect(writer.widthOf('Hello', 'Helvetica', 10)).toBeCloseTo(22.78, 2);
    expect(writer.widthOf('Hello', 'Courier', 10)).toBeCloseTo(30, 2);
  });

  it('reports a positive ascent that scales with size', () => {
    const ascent = writer.ascent('Helvetica', 10);
    expect(ascent).toBeGreaterThan(0);
    expect(ascent).toBeLessThan(10);
    expect(writer.ascent('Helvetica', 20)).toBeCloseTo(ascent * 2, 5);
  });

  it('writes a PDF blob with a rect and a text op', async () => {
    const ops: DrawOp[] = [
      { op: 'rect', x: 10, y: 10, w: 100, h: 50, radius: 4, fill: '#ff0000', opacity: 0.5 },
      {
        op: 'text',
        x: 20,
        y: 20,
        text: 'Hello PDF',
        font: 'Helvetica-Bold',
        size: 12,
        color: '#000000',
        opacity: 1,
        underline: true,
        strike: false,
      },
    ];
    const blob = await writer.write([{ ...A4, ops }], info);
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Quarterly report');
    expect(text).toContain('Helvetica-Bold');
    // Standard-font text is written as hex inside a TJ array.
    expect(text).toContain('<48656c6c6f20504446>');
  });

  it('draws lines, strike text, images and one page per entry', async () => {
    const png = tinyPng();
    const ops: DrawOp[] = [
      { op: 'line', x1: 0, y1: 0, x2: 50, y2: 50, width: 2, color: '#00f' },
      {
        op: 'text',
        x: 0,
        y: 0,
        text: 'gone',
        font: 'Courier',
        size: 9,
        color: '#333',
        opacity: 0.4,
        underline: false,
        strike: true,
      },
      {
        op: 'image',
        x: 5,
        y: 5,
        w: 30,
        h: 20,
        clip: { x: 5, y: 5, w: 20, h: 20 },
        data: png,
        opacity: 0.8,
      },
    ];
    const blob = await writer.write(
      [
        { width: 200, height: 200, ops },
        { width: 100, height: 100, ops: [] },
      ],
      { ...info, author: 'A', subject: 'S', keywords: ['k1', 'k2'] },
    );
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('k1, k2');
  });

  it('produces identical bytes for identical input', async () => {
    const pages = [{ ...A4, ops: [] as DrawOp[] }];
    const a = new Uint8Array(await (await writer.write(pages, info)).arrayBuffer());
    const b = new Uint8Array(await (await writer.write(pages, info)).arrayBuffer());
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('compresses streams by default', async () => {
    const compressed = await createPdfkitWriter();
    const ops: DrawOp[] = [
      { op: 'rect', x: 0, y: 0, w: 5, h: 5, radius: 0, fill: '#000', opacity: 1 },
    ];
    const blob = await compressed.write([{ ...A4, ops }], info);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain('/FlateDecode');
  });

  it('reads PNG sizes and rejects other bytes', () => {
    expect(writer.imageSize(tinyPng())).toEqual({ width: 3, height: 2 });
    expect(() => writer.imageSize(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('reads JPEG sizes from the SOF marker', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x07,
      0x00, 0x09, 0x01, 0x01, 0x11, 0x00,
    ]);
    expect(writer.imageSize(jpeg)).toEqual({ width: 9, height: 7 });
    expect(() => writer.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow();
  });

  it('rejects malformed PNG and JPEG headers', () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    expect(() => writer.imageSize(new Uint8Array(sig))).toThrow(/PNG/);
    expect(() => writer.imageSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00]))).toThrow(/JPEG/);
    // Fill byte, standalone RESTART marker, a zero-length segment, then nothing useful.
    expect(() =>
      writer.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xd0, 0xff, 0xe0, 0x00, 0x00])),
    ).toThrow(/JPEG/);
    // Frame marker cut short before the size bytes.
    expect(() => writer.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b]))).toThrow(
      /JPEG/,
    );
  });

  it('draws a square-cornered rect without rounding', async () => {
    const ops: DrawOp[] = [
      { op: 'rect', x: 1, y: 1, w: 9, h: 9, radius: 0, fill: '#0f0', opacity: 1 },
    ];
    const blob = await writer.write([{ width: 20, height: 20, ops }], info);
    expect(blob.size).toBeGreaterThan(0);
  });

  describe('content stream', () => {
    const TEXT_OP: DrawOp = {
      op: 'text',
      x: 10,
      y: 10,
      text: 'decorated',
      font: 'Helvetica',
      size: 12,
      color: '#000000',
      opacity: 0.4,
      underline: true,
      strike: true,
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function pdfText(ops: DrawOp[]): Promise<string> {
      const blob = await writer.write([{ width: 200, height: 200, ops }], info);
      return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    }

    /** Page content streams only: the ones that open a graphics state. */
    function contentOf(pdf: string): string {
      return [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
        .map((match) => match[1] ?? '')
        .filter((body) => /^q$/m.test(body))
        .join('\n');
    }

    const count = (haystack: string, pattern: RegExp) => haystack.match(pattern)?.length ?? 0;

    it('rejects, instead of throwing synchronously, on an unknown op', async () => {
      const bad = { op: 'blob' } as unknown as DrawOp;
      let pending: Promise<Blob> | undefined;
      expect(() => {
        pending = writer.write([{ ...A4, ops: [bad] }], info);
      }).not.toThrow();
      await expect(pending).rejects.toThrow('ngpdf: unhandled draw op {"op":"blob"}');
    });

    it('leaves no unhandled rejection after a failed write', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const bad = { op: 'blob' } as unknown as DrawOp;
        await expect(writer.write([{ ...A4, ops: [bad] }], info)).rejects.toThrow(/unhandled/);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });

    it('draws a rounded rect with curve operators and a square one without', async () => {
      const rounded = contentOf(
        await pdfText([
          { op: 'rect', x: 10, y: 10, w: 80, h: 40, radius: 6, fill: '#ff0000', opacity: 1 },
        ]),
      );
      expect(count(rounded, /\sc\n/g)).toBe(4);
      expect(rounded).toMatch(/\nf\n/);
      const square = contentOf(
        await pdfText([
          { op: 'rect', x: 10, y: 10, w: 80, h: 40, radius: 0, fill: '#ff0000', opacity: 1 },
        ]),
      );
      expect(square).toContain('10 10 80 40 re');
      expect(count(square, /\sc\n/g)).toBe(0);
    });

    it('clips an image with re + W n and paints it with Do', async () => {
      const content = contentOf(
        await pdfText([
          {
            op: 'image',
            x: 5,
            y: 5,
            w: 30,
            h: 20,
            clip: { x: 5, y: 5, w: 20, h: 20 },
            data: tinyPng(),
            opacity: 0.8,
          },
        ]),
      );
      expect(content).toMatch(/5 5 20 20 re\nW n\n/);
      expect(content).toMatch(/\/I\d+ Do\n/);
      expect(content.indexOf('W n')).toBeLessThan(content.indexOf(' Do'));
    });

    it('sets opacity through an ExtGState and balances q and Q', async () => {
      const pdf = await pdfText([
        { op: 'rect', x: 0, y: 0, w: 10, h: 10, radius: 0, fill: '#000', opacity: 0.5 },
        { op: 'line', x1: 0, y1: 0, x2: 9, y2: 9, width: 1, color: '#00f' },
        TEXT_OP,
        {
          op: 'image',
          x: 0,
          y: 0,
          w: 3,
          h: 2,
          clip: { x: 0, y: 0, w: 3, h: 2 },
          data: tinyPng(),
          opacity: 0.8,
        },
      ]);
      const content = contentOf(pdf);
      expect(content).toMatch(/\/Gs\d+ gs\n/);
      expect(pdf).toMatch(/\/ca 0\.5\b/);
      expect(count(content, /^q$/gm)).toBeGreaterThanOrEqual(4);
      expect(count(content, /^q$/gm)).toBe(count(content, /^Q$/gm));
    });

    it('strokes underline and strike at the text opacity', async () => {
      const pdf = await pdfText([TEXT_OP]);
      expect(pdf).toMatch(/\/CA 0\.4\b/);
      expect(pdf).toMatch(/\/ca 0\.4\b/);
      const plain = await pdfText([{ ...TEXT_OP, underline: false, strike: false }]);
      expect(plain).toMatch(/\/ca 0\.4\b/);
      expect(plain).not.toMatch(/\/CA /);
    });

    it('encodes each image data URL once per write, per Uint8Array', async () => {
      const btoaSpy = vi.spyOn(globalThis, 'btoa');
      const shared = tinyPng();
      const image = (data: Uint8Array): DrawOp => ({
        op: 'image',
        x: 0,
        y: 0,
        w: 3,
        h: 2,
        clip: { x: 0, y: 0, w: 3, h: 2 },
        data,
        opacity: 1,
      });
      await pdfText([image(shared), image(shared), image(shared)]);
      expect(btoaSpy).toHaveBeenCalledTimes(1);
      btoaSpy.mockClear();
      await pdfText([image(shared), image(tinyPng())]);
      expect(btoaSpy).toHaveBeenCalledTimes(2);
      btoaSpy.mockClear();
      await pdfText([image(shared)]);
      expect(btoaSpy).toHaveBeenCalledTimes(1);
    });
  });
});
