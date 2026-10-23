import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-document',
  template: '<ng-content />',
})
export class PdfDocument {
  readonly title = input<string>();
  readonly author = input<string>();
  readonly subject = input<string>();
  readonly keywords = input<readonly string[]>();
  readonly creationDate = input<Date>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return {
      title: this.title(),
      author: this.author(),
      subject: this.subject(),
      keywords: this.keywords(),
      creationDate: this.creationDate(),
    };
  }
}
