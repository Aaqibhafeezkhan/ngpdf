import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { fitImage, loadImages } from './images';
import { createPdfkitWriter, type PdfWriter } from './writer';

/** PNG signature plus an IHDR chunk: all `imageSize` reads. */
function pngHeader(width: number, height: number): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    0x49,
    0x48,
    0x44,
    0x52,
    ...u32(width),
    ...u32(height),
    8,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function imageNode(src: unknown): PdfNode {
  const node = createNode('element', 'pdf-image');
  node.owner = { pdfProps: () => ({ src }) };
  return node;
}

function root(...children: PdfNode[]): PdfNode {
  const node = createNode('element', 'pdf-view');
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

let writer: PdfWriter;
beforeAll(async () => {
  writer = await createPdfkitWriter({ compress: false });
});

const png = pngHeader(200, 100);

describe('loadImages', () => {
  it('loads a base64 PNG data URL with its natural size', async () => {
    const node = imageNode(`data:image/png;base64,${base64(png)}`);
    const assets = await loadImages(root(node), writer);
    expect(assets.get(node)).toEqual({ data: png, width: 200, height: 100 });
  });

  it('decodes a percent-encoded data URL', async () => {
    const encoded = Array.from(png, (b) => `%${b.toString(16).padStart(2, '0')}`).join('');
    const node = imageNode(`data:image/png,${encoded}`);
    const assets = await loadImages(root(node), writer);
    expect(assets.get(node)?.width).toBe(200);
  });

  it('keeps a stray percent sign and rejects a data URL without a comma', async () => {
    const bad = imageNode('data:image/png;base64');
    await expect(loadImages(root(bad), writer)).rejects.toThrow(/malformed data URL/);
    const stray = imageNode('data:image/png,%zz');
    await expect(loadImages(root(stray), writer)).rejects.toThrow(/could not load image/);
  });

  it('loads a Blob and an ArrayBuffer the same way', async () => {
    const blobNode = imageNode(new Blob([png as BlobPart], { type: 'image/png' }));
    const bufferNode = imageNode(png.buffer.slice(0));
    const assets = await loadImages(root(blobNode, bufferNode), writer);
    expect(assets.get(blobNode)).toEqual({ data: png, width: 200, height: 100 });
    expect(assets.get(bufferNode)).toEqual({ data: png, width: 200, height: 100 });
  });

  it('fetches a URL with same-origin credentials', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(png as BodyInit)));
    const node = imageNode('/logo.png');
    const assets = await loadImages(root(node), writer, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/logo.png', { credentials: 'same-origin' });
    expect(assets.get(node)?.height).toBe(100);
  });

  it('uses the global fetch bound at call time by default', async () => {
    const original = globalThis.fetch;
    const stub = vi.fn(() => Promise.resolve(new Response(png as BodyInit)));
    globalThis.fetch = stub;
    try {
      await loadImages(root(imageNode('https://example.test/a.png')), writer);
    } finally {
      globalThis.fetch = original;
    }
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('rejects a 404 with the URL and the status', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('no', { status: 404 })));
    await expect(
      loadImages(root(imageNode('/missing.png')), writer, fetchFn as unknown as typeof fetch),
    ).rejects.toThrow('ngpdf: could not load image "/missing.png": HTTP 404');
  });

  it('rejects a failed fetch with the reason', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(
      loadImages(root(imageNode('/cors.png')), writer, fetchFn as unknown as typeof fetch),
    ).rejects.toThrow('ngpdf: could not load image "/cors.png": Failed to fetch');
  });

  it('rejects bytes that are not an image, naming the source kind', async () => {
    const bad = new Uint8Array([1, 2, 3]);
    await expect(loadImages(root(imageNode(bad.buffer)), writer)).rejects.toThrow(
      /could not load image "ArrayBuffer"/,
    );
    await expect(loadImages(root(imageNode(new Blob([bad]))), writer)).rejects.toThrow(
      /could not load image "Blob"/,
    );
    await expect(
      loadImages(root(imageNode(`data:text/plain;base64,${base64(bad)}`)), writer),
    ).rejects.toThrow(/could not load image "data URL"/);
  });

  it('rejects a source of the wrong type', async () => {
    await expect(loadImages(root(imageNode(42)), writer)).rejects.toThrow(/could not load image/);
  });

  it('ignores other elements and loads nested images', async () => {
    const nested = imageNode(png.buffer.slice(0));
    const inner = root(nested);
    const assets = await loadImages(root(inner, createNode('text', '', 'x')), writer);
    expect([...assets.keys()]).toEqual([nested]);
  });
});

describe('fitImage', () => {
  const asset = { data: new Uint8Array(), width: 200, height: 100 };

  it('contain letterboxes inside the box', () => {
    expect(fitImage(asset, { w: 100, h: 100 }, 'contain')).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('cover overflows the box on the short axis', () => {
    expect(fitImage(asset, { w: 100, h: 100 }, 'cover')).toEqual({ x: -50, y: 0, w: 200, h: 100 });
  });
});
