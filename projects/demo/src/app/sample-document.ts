import { Component, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/** A placeholder document; the real demo documents come later. */
@Component({
  selector: 'app-sample-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Sample">
      <pdf-page>
        <pdf-text>Hello from ngpdf</pdf-text>
        @for (line of lines(); track $index) {
          <pdf-text>{{ line }}</pdf-text>
        }
      </pdf-page>
    </pdf-document>
  `,
})
export class SampleDocument {
  readonly lines = input<string[]>([]);
}
