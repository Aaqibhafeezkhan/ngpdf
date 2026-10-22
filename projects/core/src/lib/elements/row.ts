import { Component, ElementRef, booleanAttribute, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-row',
  template: '<ng-content />',
})
export class PdfRow {
  readonly header = input(false, { transform: booleanAttribute });

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { header: this.header() };
  }
}
