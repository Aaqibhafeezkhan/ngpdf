import fc from 'fast-check';
import { beforeAll, describe, it } from 'vitest';
import { toWinAnsi } from './fonts';
import { ROOT_TEXT_STYLE } from './style';
import { layoutText } from './text';
import { createPdfkitWriter, type PdfWriter } from './writer';

const noWhitespace = (text: string): string => text.replace(/\s/g, '');

describe('layoutText properties', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });

  const wordish = fc.oneof(
    fc.string({ unit: 'grapheme', maxLength: 40 }),
    fc
      .array(fc.constantFrom('ab', 'WW', ' ', '  ', '\n', '\t', '-', '/', '.', 'x'), {
        maxLength: 60,
      })
      .map((parts) => parts.join('')),
  );

  // A box of at least 12pt holds any single WinAnsi character at 10pt.
  const property = (): fc.IPropertyWithHooks<[string, number]> =>
    fc.property(wordish, fc.double({ min: 12, max: 300, noNaN: true }), (text, maxWidth) => {
      const style = { ...ROOT_TEXT_STYLE, fontSize: 10 };
      const block = layoutText(text, style, maxWidth, writer);
      for (const line of block.lines) {
        if (line.text === '' || line.text.startsWith(' ') || line.text.endsWith(' ')) return false;
        if (line.width > maxWidth || writer.widthOf(line.text, 'Helvetica', 10) > maxWidth) {
          return false;
        }
      }
      const joined = block.lines.map((line) => line.text).join('');
      return noWhitespace(joined) === noWhitespace(toWinAnsi(text, () => undefined));
    });

  it('keeps every line within maxWidth and loses no non-whitespace character', () => {
    fc.assert(property());
  });

  it('holds for the seed that once found a kerning overflow', () => {
    fc.assert(property(), { seed: -1214594155 });
  });
});
