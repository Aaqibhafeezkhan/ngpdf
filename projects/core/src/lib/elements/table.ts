import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';
import type { TableColumn } from '../tree/table-column';

export type { TableColumn };

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
