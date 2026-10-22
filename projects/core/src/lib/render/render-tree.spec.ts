// @vitest-environment jsdom
import { DatePipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  ApplicationRef,
  Component,
  DestroyRef,
  EnvironmentInjector,
  InjectionToken,
  LOCALE_ID,
  createEnvironmentInjector,
  inject,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDF_ELEMENTS } from '../elements';
import { elementChildren, propsOf, textContent, type PdfNode } from '../tree/node';
import { renderTree } from './render-tree';

registerLocaleData(localePt);

const GREETING = new InjectionToken<string>('GREETING');
const destroyed: string[] = [];

@Component({
  selector: 'pdf-test-document',
  imports: [PDF_ELEMENTS, DatePipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  template: `
    <pdf-document title="Report">
      <pdf-page>
        <pdf-table [columns]="columns">
          <pdf-row header><pdf-cell>Name</pdf-cell></pdf-row>
          @for (item of items(); track item) {
            <pdf-row style="padding: 6" [style.background-color]="$odd ? '#f2f2f2' : '#ffffff'">
              <pdf-cell>{{ item }}</pdf-cell>
            </pdf-row>
          }
        </pdf-table>
        <pdf-text>{{ day() | date: 'shortDate' }}</pdf-text>
        <pdf-text>{{ greeting }}</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
class TestDocument {
  readonly columns = ['2fr', '1fr'] as ('2fr' | '1fr')[];
  readonly items = () => ['a', 'b', 'c'];
  readonly day = () => new Date(2026, 9, 22);
  readonly greeting = inject(GREETING, { optional: true }) ?? 'none';

  constructor() {
    inject(DestroyRef).onDestroy(() => destroyed.push('test-document'));
  }
}

function find(node: PdfNode, tag: string): PdfNode[] {
  return [
    ...(node.tag === tag ? [node] : []),
    ...elementChildren(node).flatMap((child) => find(child, tag)),
  ];
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${String(index)}`);
  return item;
}

describe('renderTree', () => {
  let parent: EnvironmentInjector;

  beforeAll(async () => {
    parent = TestBed.inject(EnvironmentInjector);
    await TestBed.inject(ApplicationRef).whenStable();
  });

  it('builds document > page > table > rows with props', () => {
    const result = renderTree(TestDocument, parent);
    const documents = find(result.root, 'pdf-document');
    expect(documents).toHaveLength(1);
    const document = at(documents, 0);
    expect(propsOf(document)['title']).toBe('Report');
    expect(elementChildren(document).map((n) => n.tag)).toEqual(['pdf-page']);
    const tables = find(result.root, 'pdf-table');
    expect(tables).toHaveLength(1);
    const table = at(tables, 0);
    expect(propsOf(table)['columns']).toEqual(['2fr', '1fr']);
    const rows = elementChildren(table);
    expect(rows.map((n) => n.tag)).toEqual(['pdf-row', 'pdf-row', 'pdf-row', 'pdf-row']);
    expect(propsOf(at(rows, 0))['header']).toBe(true);
    expect(propsOf(at(rows, 1))['header']).toBe(false);
    result.destroy();
  });

  it('applies static and bound styles', () => {
    const result = renderTree(TestDocument, parent);
    const rows = elementChildren(at(find(result.root, 'pdf-table'), 0));
    expect(at(rows, 1).rawStyle['background-color']).toBe('#ffffff');
    expect(at(rows, 2).rawStyle['background-color']).toBe('#f2f2f2');
    expect(at(rows, 1).rawStyle['padding']).toBe('6');
    result.destroy();
  });

  it('formats dates through pipes with the component locale', () => {
    const result = renderTree(TestDocument, parent);
    expect(textContent(at(find(result.root, 'pdf-text'), 0))).toBe('22/10/2026');
    result.destroy();
  });

  it('resolves services from the parent injector', () => {
    const withGreeting = createEnvironmentInjector(
      [{ provide: GREETING, useValue: 'hello' }],
      parent,
    );
    const result = renderTree(TestDocument, withGreeting);
    expect(textContent(at(find(result.root, 'pdf-text'), 1))).toBe('hello');
    result.destroy();
  });

  it('runs DestroyRef callbacks on destroy', () => {
    destroyed.length = 0;
    const result = renderTree(TestDocument, parent);
    expect(destroyed).toEqual([]);
    result.destroy();
    expect(destroyed).toEqual(['test-document']);
  });
});
