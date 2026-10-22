import { Component, inject } from '@angular/core';
import { PdfRenderer } from '@ngpdf/core';
import { SampleDocument } from './sample-document';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly pdf = inject(PdfRenderer);

  download(): Promise<void> {
    return this.pdf.download(SampleDocument, {
      fileName: 'sample.pdf',
      inputs: { lines: ['A made-up line', 'Another made-up line'] },
    });
  }
}
