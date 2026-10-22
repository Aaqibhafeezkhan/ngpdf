import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

@Component({
  selector: 'app-capture-report',
  imports: [PDF_ELEMENTS, DatePipe],
  template: `
    <pdf-document [title]="title()" author="ngpdf demo" [creationDate]="capturedAt()">
      <pdf-page size="A4" orientation="landscape" style="padding: 36">
        <pdf-text style="font-size: 20; font-weight: bold">{{ title() }}</pdf-text>
        <pdf-text style="font-size: 10; color: #555555; margin-top: 4; margin-bottom: 14">
          {{ 'Gerado em ' + (capturedAt() | date: 'dd/MM/yyyy HH:mm') }}
        </pdf-text>
        <pdf-image [src]="image()" style="width: 100%; height: 469; object-fit: contain" />
      </pdf-page>
    </pdf-document>
  `,
})
export class CaptureReport {
  readonly title = input.required<string>();
  readonly capturedAt = input.required<Date>();
  readonly image = input.required<Blob>();
}
