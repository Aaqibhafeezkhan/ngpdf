// End-to-end check: builds the demo in development mode (it exposes window.ngpdfDemo there),
// renders the three documents in headless Chrome, extracts their text with pdftotext and compares
// it with e2e/expected/<name>.txt. `--update` rewrites the expected files; `--skip-build` reuses
// dist/demo.
//
// Runs on the host: needs node, /usr/bin/google-chrome and pdftotext (poppler-utils). When
// pdftotext is not installed it runs in a Docker image that has poppler-utils.
/* global window */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = join(ROOT, 'dist/demo/browser');
const OUT = join(ROOT, 'e2e/out');
const EXPECTED = join(ROOT, 'e2e/expected');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const PDFTOTEXT = '/usr/bin/pdftotext';

// Page counts follow from the row geometry: see the report of task 12.
const DOCUMENTS = [
  { name: 'capture-report', pages: 1, contains: ['Gerado em 22/10/2026 14:30'] },
  {
    name: 'communicators-list',
    pages: 5,
    contains: ['Página 5 de 5', 'pessoa140@example.com', 'Página 1 de 5'],
  },
  { name: 'licences-list', pages: 3, contains: ['Página 3 de 3', 'R$'] },
];

const update = process.argv.includes('--update');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
};

function serve() {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
    const file = resolve(SITE, `.${path === sep || path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(SITE + sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

function extractText(pdfPath) {
  if (existsSync(PDFTOTEXT)) {
    return execFileSync(PDFTOTEXT, ['-layout', pdfPath, '-'], { encoding: 'utf8' });
  }
  return execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${ROOT}:/w:ro`,
      '-w',
      '/w',
      'node:24-bookworm-slim',
      'sh',
      '-c',
      `apt-get -qq update && apt-get -qq install -y poppler-utils >/dev/null && pdftotext -layout ${pdfPath.replace(ROOT, '/w')} -`,
    ],
    { encoding: 'utf8' },
  );
}

const normalizeText = (text) =>
  text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trimEnd() + '\n';

/** A short line diff for the failure message. */
function diff(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const lines = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i])
      lines.push(`  line ${i + 1}\n    - ${a[i] ?? '(missing)'}\n    + ${b[i] ?? '(missing)'}`);
    if (lines.length >= 5) break;
  }
  return lines.join('\n');
}

if (!process.argv.includes('--skip-build')) {
  const build = ['ng', 'build', 'demo', '--configuration', 'development'];
  // Locally the toolchain is in Docker; in CI Node is already on the runner.
  if (process.env.CI) execFileSync('npx', build, { cwd: ROOT, stdio: 'inherit' });
  else execFileSync(join(ROOT, 'scripts/dev'), ['npx', ...build], { cwd: ROOT, stdio: 'inherit' });
}
mkdirSync(OUT, { recursive: true });
mkdirSync(EXPECTED, { recursive: true });

const server = await serve();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});
let failed = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error('page error:', error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ngpdfDemo !== undefined);

  for (const document of DOCUMENTS) {
    const base64 = await page.evaluate((name) => window.ngpdfDemo.render(name), document.name);
    const pdfPath = join(OUT, `${document.name}.pdf`);
    writeFileSync(pdfPath, Buffer.from(base64, 'base64'));
    const raw = extractText(pdfPath);
    const text = normalizeText(raw);
    const expectedPath = join(EXPECTED, `${document.name}.txt`);

    const problems = [];
    // pdftotext ends each page with a form feed.
    const pageCount = (raw.match(/\f/g) ?? []).length;
    if (pageCount !== document.pages)
      problems.push(`expected ${document.pages} pages, got ${pageCount}`);
    for (const needle of document.contains) {
      if (!text.includes(needle)) problems.push(`text does not contain "${needle}"`);
    }
    if (update) {
      writeFileSync(expectedPath, text);
    } else if (!existsSync(expectedPath)) {
      problems.push(`${expectedPath} is missing; run with --update`);
    } else {
      const expected = readFileSync(expectedPath, 'utf8');
      if (expected !== text)
        problems.push(`text differs from ${expectedPath}\n${diff(expected, text)}`);
    }

    if (problems.length > 0) {
      failed = true;
      console.error(`FAIL ${document.name}\n  ${problems.join('\n  ')}`);
    } else {
      console.log(
        `OK ${document.name} (${pageCount} page${pageCount === 1 ? '' : 's'})${update ? ' [updated]' : ''}`,
      );
    }
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) process.exit(1);
