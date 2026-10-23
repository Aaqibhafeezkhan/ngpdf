# ngpdf

[![CI](https://github.com/ngpdf/ngpdf/actions/workflows/ci.yml/badge.svg)](https://github.com/ngpdf/ngpdf/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ngpdf/core)](https://www.npmjs.com/package/@ngpdf/core)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ngpdf/ngpdf/badge)](https://scorecard.dev/viewer/?uri=github.com/ngpdf/ngpdf)

Write PDFs as Angular components, for Angular. A document is a normal component whose template
uses the `pdf-*` elements; ngpdf lays it out, breaks it into pages and writes the PDF in the
browser. The layout and PDF engine is loaded on the first render, so importing `@ngpdf/core` adds
at most 15 KB gzipped to your initial bundle.

## Install

```sh
npm install @ngpdf/core
```

It needs `@angular/core` and `@angular/common` 22 or newer, and works zoneless and with zone.js.

## Example: a communicators list

```ts
import { DatePipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { PDF_ELEMENTS, PdfRenderer } from '@ngpdf/core';

@Component({
  selector: 'app-communicators-list',
  imports: [PDF_ELEMENTS, DatePipe],
  template: `
    <pdf-document title="Lista de comunicadores">
      <pdf-page style="padding: 36; font-size: 9">
        <pdf-table [columns]="[30, '2fr', '3fr', '1fr', '1fr']">
          <pdf-row
            header
            style="padding-top: 5; padding-bottom: 5; background-color: #dd0031; color: #ffffff"
          >
            <pdf-cell style="padding-left: 4"><pdf-text>#</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4"><pdf-text>Nome</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4"><pdf-text>E-mail</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4"><pdf-text>Telefone</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4"><pdf-text>Cadastro</pdf-text></pdf-cell>
          </pdf-row>
          @for (item of items(); track item.id) {
            <pdf-row
              style="padding-top: 4; padding-bottom: 4"
              [style.background-color]="$odd ? '#f2f2f2' : '#ffffff'"
            >
              <pdf-cell style="padding-left: 4"
                ><pdf-text>{{ item.id }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4"
                ><pdf-text>{{ item.name }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4"
                ><pdf-text>{{ item.email }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4"
                ><pdf-text>{{ item.phone }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4">
                <pdf-text>{{ item.registeredAt | date: 'dd/MM/yyyy' }}</pdf-text>
              </pdf-cell>
            </pdf-row>
          }
        </pdf-table>
        <pdf-page-number format="Página {page} de {total}" style="text-align: right" />
      </pdf-page>
    </pdf-document>
  `,
})
export class CommunicatorsList {
  readonly items = input.required<Communicator[]>();
}

// Anywhere with an injection context:
const pdf = inject(PdfRenderer);
await pdf.download(CommunicatorsList, { inputs: { items }, fileName: 'communicators.pdf' });
// or: const blob = await pdf.toBlob(CommunicatorsList, { inputs: { items } });
```

The header row repeats on every page, rows are never split, and the text stays selectable.

## v0.1 limits

- Standard PDF fonts only (WinAnsi). A character outside it is drawn as `?`, with a warning in
  development mode.
- `pdf-page-number` always sits at the bottom of the content area.
- Inside a `pdf-table`, horizontal padding, borders and margins on a row are ignored. Put
  horizontal padding on the `pdf-cell`s.
- A unit taller than a page (a row, or a `pdf-view` in a column) is clipped to its page.
- `border-radius` together with borders draws square border lines.

## Demo

The demo app in [`projects/demo`](projects/demo) builds three documents from made-up data: a
capture report, a communicators list and a licences list. Run it with `npm start`.

## License

MIT.

Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md). Security: see [SECURITY.md](SECURITY.md).
