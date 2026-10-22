// The standalone build ships without types; it exports the same class as `pdfkit`.
declare module 'pdfkit/js/pdfkit.standalone.js' {
  const PDFDocument: typeof import('pdfkit');
  export default PDFDocument;
}
