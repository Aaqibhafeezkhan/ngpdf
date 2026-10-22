// @vitest-environment jsdom
import {
  ApplicationRef,
  Component,
  EnvironmentInjector,
  RendererFactory2,
  createComponent,
  createEnvironmentInjector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { elementChildren, propsOf, type PdfNode } from '../tree/node';
import { PdfRendererFactory } from '../tree/pdf-renderer-factory';
import { PDF_ELEMENTS } from '.';

@Component({
  selector: 'pdf-test-defaults',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-view />
        <pdf-text />
        <pdf-image src="data:image/png;base64,AAAA" />
        <pdf-table>
          <pdf-row><pdf-cell /></pdf-row>
        </pdf-table>
        <pdf-page-number />
      </pdf-page>
    </pdf-document>
  `,
})
class DefaultsDocument {}

const BLOB = new Blob(['x']);

@Component({
  selector: 'pdf-test-bound',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page size="Letter" orientation="landscape" />
      <pdf-page [size]="[100, 200]" />
      <pdf-view breakBefore />
      <pdf-view [breakBefore]="false" />
      <pdf-text breakBefore="true" />
      <pdf-image [src]="blob" />
      <pdf-page-number format="Page {page}" />
      <pdf-table [columns]="['1fr', 40]">
        <pdf-row header><pdf-cell span="2" /></pdf-row>
      </pdf-table>
    </pdf-document>
  `,
})
class BoundDocument {
  readonly blob = BLOB;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${String(index)}`);
  return item;
}

describe('pdf-* elements', () => {
  let rendered: { destroy(): void }[] = [];

  beforeAll(async () => {
    await TestBed.inject(ApplicationRef).whenStable();
  });

  afterEach(() => {
    for (const result of rendered) result.destroy();
    rendered = [];
  });

  function render(component: typeof DefaultsDocument | typeof BoundDocument): PdfNode {
    const environmentInjector = createEnvironmentInjector(
      [{ provide: RendererFactory2, useFactory: () => new PdfRendererFactory() }],
      TestBed.inject(EnvironmentInjector),
    );
    const ref = createComponent(component, { environmentInjector });
    rendered.push({
      destroy: () => {
        ref.destroy();
        environmentInjector.destroy();
      },
    });
    ref.changeDetectorRef.detectChanges();
    return at(elementChildren(ref.location.nativeElement as PdfNode), 0);
  }

  it('registers each element component as the owner of its node', () => {
    const page = at(elementChildren(render(DefaultsDocument)), 0);
    const kids = elementChildren(page);
    expect(kids.map((n) => n.tag)).toEqual([
      'pdf-view',
      'pdf-text',
      'pdf-image',
      'pdf-table',
      'pdf-page-number',
    ]);
    for (const node of [page, ...kids]) expect(node.owner).not.toBeNull();
  });

  it('exposes the default input values through pdfProps', () => {
    const page = at(elementChildren(render(DefaultsDocument)), 0);
    const kids = elementChildren(page);
    expect(propsOf(page)).toEqual({ size: 'A4', orientation: 'portrait' });
    expect(propsOf(at(kids, 0))).toEqual({ breakBefore: false });
    expect(propsOf(at(kids, 1))).toEqual({ breakBefore: false });
    expect(propsOf(at(kids, 2))).toEqual({ src: 'data:image/png;base64,AAAA' });
    expect(propsOf(at(kids, 4))).toEqual({ format: '{page} / {total}' });
    const cell = at(elementChildren(at(elementChildren(at(kids, 3)), 0)), 0);
    expect(propsOf(cell)).toEqual({ span: 1 });
  });

  it('exposes bound and attribute values, applying the input transforms', () => {
    const children = elementChildren(render(BoundDocument));
    expect(propsOf(at(children, 0))).toEqual({ size: 'Letter', orientation: 'landscape' });
    expect(propsOf(at(children, 1))['size']).toEqual([100, 200]);
    expect(propsOf(at(children, 2))).toEqual({ breakBefore: true });
    expect(propsOf(at(children, 3))).toEqual({ breakBefore: false });
    expect(propsOf(at(children, 4))).toEqual({ breakBefore: true });
    expect(propsOf(at(children, 5))).toEqual({ src: BLOB });
    expect(propsOf(at(children, 6))).toEqual({ format: 'Page {page}' });
    const table = at(children, 7);
    expect(propsOf(table)['columns']).toEqual(['1fr', 40]);
    const row = at(elementChildren(table), 0);
    expect(propsOf(row)['header']).toBe(true);
    expect(propsOf(at(elementChildren(row), 0))).toEqual({ span: 2 });
  });
});
