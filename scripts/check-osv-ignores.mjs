// Checks the ignore list in osv-scanner.toml (docs/ENGINEERING.md, "Dependency vulnerabilities").
// Every `[[IgnoredVulns]]` entry needs an `id`, a `reason` and an `ignoreUntil` date that is at
// most 90 days ahead. Runs in CI before OSV-Scanner. Usage: node scripts/check-osv-ignores.mjs [file]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MAX_IGNORE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const IGNORED_VULNS_HEADER = /^\[\[\s*IgnoredVulns\s*\]\]$/;

/** Parses the `[[IgnoredVulns]]` tables. Reads only `key = value` lines; other tables are skipped. */
export function parseIgnoredVulns(toml) {
  const entries = [];
  let current = null;
  const lines = toml.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      // A table header holds no strings, so a comment can be cut at the first `#`.
      current = IGNORED_VULNS_HEADER.test(line.replace(/#.*$/, '').trim()) ? {} : null;
      if (current) entries.push(current);
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line
      .slice(0, eq)
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2');
    let value = line.slice(eq + 1).trim();
    const multiline = /^("""|''')/.exec(value);
    if (multiline) {
      // Multi-line string: read up to the closing delimiter.
      const delimiter = multiline[1];
      let text = value.slice(3);
      let end = text.indexOf(delimiter);
      while (end < 0 && index + 1 < lines.length) {
        index += 1;
        text += `\n${lines[index]}`;
        end = text.indexOf(delimiter);
      }
      if (end < 0) throw new Error(`osv-scanner.toml: unterminated multi-line string for "${key}"`);
      value = text.slice(0, end).trim();
    } else if (value[0] === '"' || value[0] === "'") {
      const end = value.indexOf(value[0], 1);
      value = end < 0 ? value.slice(1) : value.slice(1, end);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    current[key] = value;
  }
  return entries;
}

/** Returns one message per problem; an empty list means the file is acceptable. */
export function checkOsvIgnores(toml, today = new Date()) {
  const problems = [];
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  parseIgnoredVulns(toml).forEach((entry, index) => {
    const label = `IgnoredVulns #${String(index + 1)} (${entry.id || 'no id'})`;
    if (!entry.id) problems.push(`${label}: missing id`);
    if (!entry.reason?.trim()) problems.push(`${label}: missing reason`);
    if (!entry.ignoreUntil) {
      problems.push(`${label}: missing ignoreUntil`);
      return;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(entry.ignoreUntil);
    const until = match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) : Number.NaN;
    if (Number.isNaN(until)) {
      problems.push(`${label}: ignoreUntil "${entry.ignoreUntil}" is not a YYYY-MM-DD date`);
    } else if ((until - startOfToday) / DAY_MS > MAX_IGNORE_DAYS) {
      problems.push(
        `${label}: ignoreUntil ${entry.ignoreUntil} is more than ${String(MAX_IGNORE_DAYS)} days ahead`,
      );
    }
  });
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? 'osv-scanner.toml';
  let problems;
  try {
    problems = checkOsvIgnores(readFileSync(file, 'utf8'));
  } catch (error) {
    problems = [error instanceof Error ? error.message : String(error)];
  }
  for (const problem of problems) console.error(`${file}: ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(`${file}: ignore list ok`);
}
