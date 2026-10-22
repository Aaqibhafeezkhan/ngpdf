import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-page-number',
  template: '<ng-content />',
})
export class PdfPageNumber {
  readonly format = input('{page} / {total}');

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { format: this.format() };
  }
}
