import { describe, expect, it, vi } from 'vitest';
import { fontFor, toWinAnsi } from './fonts';

describe('fontFor', () => {
  it('maps family, weight and style to a standard font', () => {
    expect(fontFor({ fontFamily: 'Times', fontWeight: 'bold', fontStyle: 'italic' })).toBe(
      'Times-BoldItalic',
    );
    expect(fontFor({ fontFamily: 'Helvetica', fontWeight: 'normal', fontStyle: 'normal' })).toBe(
      'Helvetica',
    );
    expect(fontFor({ fontFamily: 'Times', fontWeight: 'normal', fontStyle: 'normal' })).toBe(
      'Times-Roman',
    );
    expect(fontFor({ fontFamily: 'Courier', fontWeight: 'bold', fontStyle: 'normal' })).toBe(
      'Courier-Bold',
    );
    expect(fontFor({ fontFamily: 'Courier', fontWeight: 'normal', fontStyle: 'italic' })).toBe(
      'Courier-Oblique',
    );
    expect(fontFor({ fontFamily: 'Helvetica', fontWeight: 'bold', fontStyle: 'italic' })).toBe(
      'Helvetica-BoldOblique',
    );
  });
});

describe('toWinAnsi', () => {
  it('replaces characters outside WinAnsi with ? and warns once with them', () => {
    const warn = vi.fn();
    expect(toWinAnsi('Olá € 😀 ő', warn)).toBe('Olá € ? ?');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(['😀', 'ő']);
  });

  it('does not warn when everything is supported', () => {
    const warn = vi.fn();
    expect(toWinAnsi('plain “quotes” — ÿ', warn)).toBe('plain “quotes” — ÿ');
    expect(warn).not.toHaveBeenCalled();
  });

  it('lists each unsupported character once and replaces CJK', () => {
    const warn = vi.fn();
    expect(toWinAnsi('漢ő漢', warn)).toBe('???');
    expect(warn).toHaveBeenCalledWith(['漢', 'ő']);
  });

  it('keeps tab and newline out of the replacement', () => {
    const warn = vi.fn();
    expect(toWinAnsi('a\tb\nc', warn)).toBe('a\tb\nc');
    expect(warn).not.toHaveBeenCalled();
  });
});
