import { Component, ElementRef, inject, input, numberAttribute } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-cell',
  template: '<ng-content />',
})
export class PdfCell {
  readonly span = input(1, { transform: numberAttribute });

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { span: this.span() };
  }
}
