import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

export type TableColumn = number | `${number}fr` | `${number}%`;

@Component({
  selector: 'pdf-table',
  template: '<ng-content />',
})
export class PdfTable {
  readonly columns = input.required<TableColumn[]>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { columns: this.columns() };
  }
}
