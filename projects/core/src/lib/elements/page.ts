import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-page',
  template: '<ng-content />',
})
export class PdfPage {
  readonly size = input<'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | [number, number]>('A4');
  readonly orientation = input<'portrait' | 'landscape'>('portrait');

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { size: this.size(), orientation: this.orientation() };
  }
}
