import type { TextStyle } from './style';
import type { StandardFont } from './writer';

const FONT_NAMES: Record<TextStyle['fontFamily'], readonly [string, string, string, string]> = {
  // normal, bold, italic, bold italic
  Helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
};

export function fontFor(
  style: Pick<TextStyle, 'fontFamily' | 'fontWeight' | 'fontStyle'>,
): StandardFont {
  const index = (style.fontWeight === 'bold' ? 1 : 0) + (style.fontStyle === 'italic' ? 2 : 0);
  return FONT_NAMES[style.fontFamily][index] as StandardFont;
}

// Code points that Windows-1252 (PDF WinAnsiEncoding) has in the 0x80-0x9F block.
const CP1252_EXTRAS = new Set<number>();
for (const char of '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ') CP1252_EXTRAS.add(char.codePointAt(0) ?? 0);

function isWinAnsi(codePoint: number): boolean {
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    CP1252_EXTRAS.has(codePoint)
  );
}

/** Replaces characters outside WinAnsi with `?` and reports each distinct one once. */
export function toWinAnsi(text: string, warn: (chars: string[]) => void): string {
  const unsupported = new Set<string>();
  let out = '';
  for (const char of text) {
    if (isWinAnsi(char.codePointAt(0) ?? 0)) {
      out += char;
    } else {
      unsupported.add(char);
      out += '?';
    }
  }
  if (unsupported.size > 0) warn([...unsupported]);
  return out;
}
