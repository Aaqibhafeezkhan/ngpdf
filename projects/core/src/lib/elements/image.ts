import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-image',
  template: '<ng-content />',
})
export class PdfImage {
  readonly src = input.required<string | Blob | ArrayBuffer>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { src: this.src() };
  }
}
