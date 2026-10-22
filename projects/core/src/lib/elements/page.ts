import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

export type PageSize = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | [number, number];
export type PageOrientation = 'portrait' | 'landscape';

@Component({
  selector: 'pdf-page',
  template: '<ng-content />',
})
export class PdfPage {
  readonly size = input<PageSize>('A4');
  readonly orientation = input<PageOrientation>('portrait');

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { size: this.size(), orientation: this.orientation() };
  }
}
