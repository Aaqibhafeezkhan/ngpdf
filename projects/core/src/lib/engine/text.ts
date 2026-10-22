import LineBreaker from 'linebreak';
import { fontFor, toWinAnsi } from './fonts';
import type { TextStyle } from './style';
import type { FontMetrics } from './writer';

export interface TextLine {
  readonly text: string;
  readonly width: number;
  /** Top of the line box. */
  readonly y: number;
}

export interface TextBlock {
  readonly lines: readonly TextLine[];
  readonly width: number;
  readonly height: number;
}

const MAX_TEXT_LENGTH = 1_048_576;
// yoga-layout's MeasureMode.Undefined: no width constraint.
const MEASURE_MODE_UNDEFINED = 0;

function assertTextSize(text: string): void {
  if (text.length > MAX_TEXT_LENGTH) throw new Error('ngpdf: text longer than 1 MB');
}

/** CSS `white-space: normal`: runs of space, tab and line breaks become one space; ends trimmed. */
function collapseWhitespace(text: string): string {
  return text.replace(/[ \t\r\n]+/g, ' ').trim();
}

/** A word and whether one collapsed space follows it. Breaks are allowed after each piece. */
function* pieces(text: string): Generator<{ word: string; space: boolean }> {
  const breaker = new LineBreaker(text);
  let start = 0;
  for (let next = breaker.nextBreak(); next; next = breaker.nextBreak()) {
    const piece = text.slice(start, next.position);
    start = next.position;
    const space = piece.endsWith(' ');
    yield { word: space ? piece.slice(0, -1) : piece, space };
  }
}

/**
 * Breaks `text` into lines no wider than `maxWidth`, at Unicode line break opportunities. A word
 * wider than `maxWidth` is split at the last character that fits (at least one per line).
 * Work is linear in the text length.
 */
export function layoutText(
  text: string,
  style: TextStyle,
  maxWidth: number,
  metrics: FontMetrics,
  warn: (chars: string[]) => void = () => undefined,
): TextBlock {
  assertTextSize(text);
  const collapsed = collapseWhitespace(toWinAnsi(text, warn));
  const font = fontFor(style);
  const size = style.fontSize;
  const lineHeight = size * style.lineHeight;
  const widthOf = (chunk: string): number => metrics.widthOf(chunk, font, size);
  const spaceWidth = widthOf(' ');

  const lines: TextLine[] = [];
  // The line being built: each part is a word and the separator (a space or nothing) before it.
  interface Part {
    readonly sep: string;
    readonly word: string;
    readonly width: number;
  }
  let parts: Part[] = [];
  // Sum of the part widths. Kerning makes the drawn width differ, so it only guides the fit;
  // `flush` checks the real width.
  let sum = 0;
  let pendingSpace = false;

  const add = (word: string, width: number): void => {
    const sep = parts.length > 0 && pendingSpace ? ' ' : '';
    parts.push({ sep, word, width });
    sum += (sep === '' ? 0 : spaceWidth) + width;
  };
  const textOf = (): string => parts.map((part) => part.sep + part.word).join('');

  /** Emits the line, moving trailing words to the next line while its drawn width overflows. */
  const flush = (): void => {
    if (parts.length === 0) return;
    let lineText = textOf();
    let lineWidth = widthOf(lineText);
    const carried: Part[] = [];
    while (lineWidth > maxWidth && parts.length > 1) {
      carried.unshift(...parts.splice(-1));
      lineText = textOf();
      lineWidth = widthOf(lineText);
    }
    lines.push({ text: lineText, width: lineWidth, y: lines.length * lineHeight });
    const spaceAfter = carried.length > 0 && pendingSpace;
    parts = [];
    sum = 0;
    pendingSpace = false;
    for (const part of carried) {
      pendingSpace = part.sep === ' ';
      add(part.word, part.width);
    }
    pendingSpace = spaceAfter;
  };

  for (const { word, space } of collapsed === '' ? [] : pieces(collapsed)) {
    const wordWidth = widthOf(word);
    const gap = pendingSpace ? spaceWidth : 0;
    if (parts.length > 0 && sum + gap + wordWidth > maxWidth) flush();
    if (parts.length === 0 && wordWidth > maxWidth) {
      // Split mid-word. Characters are added by their summed widths, then the chunk's drawn
      // width is checked and characters are given back until it fits.
      const chars = Array.from(word);
      let start = 0;
      while (start < chars.length) {
        // A piece can hold inner spaces (no break before some punctuation): a line never starts with one.
        while (chars[start] === ' ') start++;
        if (start >= chars.length) break;
        let end = start;
        let guess = 0;
        for (; end < chars.length; end++) {
          const charWidth = widthOf(String(chars[end]));
          if (end > start && guess + charWidth > maxWidth) break;
          guess += charWidth;
        }
        let chunk: string;
        let chunkWidth: number;
        for (;;) {
          while (end - start > 1 && chars[end - 1] === ' ') end--;
          chunk = chars.slice(start, end).join('');
          chunkWidth = widthOf(chunk);
          if (chunkWidth <= maxWidth || end - start <= 1) break;
          end--;
        }
        pendingSpace = false;
        add(chunk, chunkWidth);
        if (end < chars.length) flush();
        start = end;
      }
    } else {
      add(word, wordWidth);
    }
    pendingSpace = space;
  }
  flush();

  return {
    lines,
    width: lines.reduce((widest, line) => Math.max(widest, line.width), 0),
    height: lines.length * lineHeight,
  };
}

/** A Yoga measure function (`node.setMeasureFunc`) for the text. */
export function measureText(
  text: string,
  style: TextStyle,
  metrics: FontMetrics,
): (width: number, widthMode: number) => { width: number; height: number } {
  assertTextSize(text);
  return (width, widthMode) => {
    const maxWidth = widthMode === MEASURE_MODE_UNDEFINED ? Infinity : width;
    const { width: blockWidth, height } = layoutText(text, style, maxWidth, metrics);
    return { width: blockWidth, height };
  };
}
