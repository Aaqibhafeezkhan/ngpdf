import { Component, ElementRef, booleanAttribute, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-view',
  template: '<ng-content />',
})
export class PdfView {
  readonly breakBefore = input(false, { transform: booleanAttribute });

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { breakBefore: this.breakBefore() };
  }
}
