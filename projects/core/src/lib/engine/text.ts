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
  let current = '';
  let currentWidth = 0; // sum of the parts, an upper bound of the kerned width
  let pendingSpace = false;

  const flush = (): void => {
    if (current === '') return;
    lines.push({ text: current, width: widthOf(current), y: lines.length * lineHeight });
    current = '';
    currentWidth = 0;
    pendingSpace = false;
  };

  for (const { word, space } of collapsed === '' ? [] : pieces(collapsed)) {
    const wordWidth = widthOf(word);
    const gap = pendingSpace ? spaceWidth : 0;
    if (current !== '' && currentWidth + gap + wordWidth > maxWidth) flush();
    if (current === '' && wordWidth > maxWidth) {
      // Split mid-word: fill the line with characters until the next one would overflow.
      let chunk = '';
      let chunkWidth = 0;
      for (const char of word) {
        const charWidth = widthOf(char);
        if (chunk !== '' && chunkWidth + charWidth > maxWidth) {
          current = chunk;
          flush();
          chunk = '';
          chunkWidth = 0;
        }
        chunk += char;
        chunkWidth += charWidth;
      }
      current = chunk;
      currentWidth = chunkWidth;
    } else {
      const onLine = current !== '';
      current += (onLine && pendingSpace ? ' ' : '') + word;
      currentWidth += (onLine ? gap : 0) + wordWidth;
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
