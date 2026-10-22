// @vitest-environment jsdom
import { Component, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_ELEMENTS } from '../elements';

@Component({
  selector: 'pdf-lazy-document',
  imports: [PDF_ELEMENTS],
  template: '<pdf-document><pdf-page /></pdf-document>',
})
class LazyDocument {}

// A fresh pdf-renderer module per test, so its engine memo starts empty.
let loads = 0;
let failures = 0;
let renderPdf: typeof import('./pdf-renderer').renderToBlob;

beforeEach(async () => {
  loads = 0;
  vi.resetModules();
  vi.doMock('../engine', () => {
    loads++;
    if (failures > 0) {
      failures--;
      throw new Error('chunk failed to load');
    }
    return { renderDocument: () => Promise.resolve(new Blob(['pdf'])) };
  });
  ({ renderToBlob: renderPdf } = await import('./pdf-renderer'));
});
afterEach(() => {
  vi.doUnmock('../engine');
  TestBed.resetTestingModule();
});

describe('lazy engine', () => {
  it('imports the engine once for many renders, including concurrent ones', async () => {
    const injector = TestBed.inject(EnvironmentInjector);
    await Promise.all([
      renderPdf(LazyDocument, { injector }),
      renderPdf(LazyDocument, { injector }),
    ]);
    await renderPdf(LazyDocument, { injector });
    expect(loads).toBe(1);
  });

  it('forgets a failed import so the next render retries', async () => {
    const injector = TestBed.inject(EnvironmentInjector);
    failures = 1;
    await expect(renderPdf(LazyDocument, { injector })).rejects.toThrow(/mocking a module/);
    const blob = await renderPdf(LazyDocument, { injector });
    expect(await blob.text()).toBe('pdf');
    expect(loads).toBe(2);
  });
});
