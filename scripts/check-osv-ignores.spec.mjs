import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkOsvIgnores } from './check-osv-ignores.mjs';

const TODAY = new Date('2026-10-22T12:00:00Z');
const entry = (lines) => `[[IgnoredVulns]]\n${lines.join('\n')}\n`;
const id = 'id = "GHSA-aaaa-bbbb-cccc"';
const reason = 'reason = "Unreachable: ngpdf never calls the parser."';

describe('checkOsvIgnores', () => {
  it('accepts a file with no entries, and the repository file', () => {
    expect(checkOsvIgnores('# nothing ignored\n', TODAY)).toEqual([]);
    expect(checkOsvIgnores(readFileSync('osv-scanner.toml', 'utf8'), TODAY)).toEqual([]);
  });

  it('accepts an entry with a reason that expires within 90 days', () => {
    const toml = entry([id, 'ignoreUntil = 2027-01-20', reason]);
    expect(checkOsvIgnores(toml, TODAY)).toEqual([]);
  });

  it('accepts exactly 90 days ahead, quoted dates and datetimes', () => {
    expect(checkOsvIgnores(entry([id, 'ignoreUntil = 2027-01-20', reason]), TODAY)).toEqual([]);
    expect(checkOsvIgnores(entry([id, 'ignoreUntil = "2027-01-20"', reason]), TODAY)).toEqual([]);
    expect(
      checkOsvIgnores(entry([id, 'ignoreUntil = 2027-01-20T00:00:00Z', reason]), TODAY),
    ).toEqual([]);
  });

  it('fails an entry without ignoreUntil', () => {
    const problems = checkOsvIgnores(entry([id, reason]), TODAY);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('missing ignoreUntil');
  });

  it('fails an ignoreUntil more than 90 days ahead', () => {
    const problems = checkOsvIgnores(entry([id, 'ignoreUntil = 2027-01-21', reason]), TODAY);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('more than 90 days ahead');
  });

  it('fails an entry without a reason or with a blank one', () => {
    expect(checkOsvIgnores(entry([id, 'ignoreUntil = 2026-12-01']), TODAY)[0]).toContain(
      'missing reason',
    );
    expect(
      checkOsvIgnores(entry([id, 'ignoreUntil = 2026-12-01', 'reason = "  "']), TODAY)[0],
    ).toContain('missing reason');
  });

  it('fails an entry without an id and a date that is not a date', () => {
    expect(checkOsvIgnores(entry(['ignoreUntil = 2026-12-01', reason]), TODAY)[0]).toContain(
      'missing id',
    );
    expect(checkOsvIgnores(entry([id, 'ignoreUntil = soon', reason]), TODAY)[0]).toContain(
      'not a YYYY-MM-DD date',
    );
  });

  it('checks every entry and ignores other tables', () => {
    const toml = [
      entry([id, 'ignoreUntil = 2026-12-01', reason]),
      '[[PackageOverrides]]\nname = "x"\n',
      entry(['id = "CVE-2026-1"', reason]),
    ].join('\n');
    const problems = checkOsvIgnores(toml, TODAY);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('#2');
  });

  it('checks an entry whose header has a comment or extra spaces', () => {
    for (const header of [
      '[[IgnoredVulns]] # note',
      '[[ IgnoredVulns ]]',
      '  [[IgnoredVulns]]#x',
    ]) {
      const toml = `${header}\n${id}\n${reason}\n`;
      const problems = checkOsvIgnores(toml, TODAY);
      expect(problems, header).toHaveLength(1);
      expect(problems[0], header).toContain('missing ignoreUntil');
    }
  });

  it('reads quoted keys', () => {
    expect(
      checkOsvIgnores(
        entry(['"id" = "GHSA-x"', "'reason' = 'why'", '"ignoreUntil" = 2026-12-01']),
        TODAY,
      ),
    ).toEqual([]);
    expect(
      checkOsvIgnores(entry(['"id" = "GHSA-x"', '"ignoreUntil" = 2026-12-01']), TODAY)[0],
    ).toContain('missing reason');
  });

  it('reads a multi-line reason and rejects an unterminated one', () => {
    const ok = entry([
      id,
      'ignoreUntil = 2026-12-01',
      'reason = """',
      'Unreachable because',
      'ngpdf never calls it.',
      '"""',
    ]);
    expect(checkOsvIgnores(ok, TODAY)).toEqual([]);
    const blank = entry([id, 'ignoreUntil = 2026-12-01', 'reason = """', '"""']);
    expect(checkOsvIgnores(blank, TODAY)[0]).toContain('missing reason');
    const open = entry([id, 'ignoreUntil = 2026-12-01', 'reason = """', 'never closed']);
    expect(() => checkOsvIgnores(open, TODAY)).toThrow('unterminated multi-line string');
  });
});
