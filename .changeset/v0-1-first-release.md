---
'@ngpdf/core': minor
---

First release. Write a PDF as an Angular component: a document is a normal component whose template uses the `pdf-document`, `pdf-page`, `pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row`, `pdf-cell` and `pdf-page-number` elements. A lazily loaded engine lays it out with Yoga, breaks it into pages and writes it with pdfkit, all in the browser. Importing `@ngpdf/core` adds at most 15 KB gzipped to the initial bundle.
