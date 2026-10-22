import { PdfCell } from './cell';
import { PdfDocument } from './document';
import { PdfImage } from './image';
import { PdfPage } from './page';
import { PdfPageNumber } from './page-number';
import { PdfRow } from './row';
import { PdfTable } from './table';
import { PdfText } from './text';
import { PdfView } from './view';

export {
  PdfCell,
  PdfDocument,
  PdfImage,
  PdfPage,
  PdfPageNumber,
  PdfRow,
  PdfTable,
  PdfText,
  PdfView,
};
export type { TableColumn } from './table';

/** Every pdf-* element, for `imports: [PDF_ELEMENTS]`. */
export const PDF_ELEMENTS = [
  PdfDocument,
  PdfPage,
  PdfView,
  PdfText,
  PdfImage,
  PdfTable,
  PdfRow,
  PdfCell,
  PdfPageNumber,
] as const;
