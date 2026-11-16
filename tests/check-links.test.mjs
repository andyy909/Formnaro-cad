import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinks, extractLinks, renderReport, scanDocuments } from '../scripts/check-links.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'checklinks-'));
  for (const [file, content] of Object.entries(files)) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '-A']);
  return root;
}

const document = [
  '# Testdokument',
  '',
  '[gut](gut.md)',
  '[mit Leerzeichen](Ordner/mit leer.md)',
  '[kodiert](Ordner/mit%20leer.md)',
  '[spitz](<Ordner/mit leer.md>)',
  '[fragment an Datei](gut.md#abschnitt)',
  '[titel](gut.md "Beschreibung")',
  '[referenz][ziel]',
  '![bild](bild.png)',
  '[ordner](Ordner/)',
  '[extern](https://example.com/fehlt.md)',
  '[fragment](#nur-fragment)',
  '`[code](fehlt.md)`',
  '',
  '```text',
  '[im Codeblock](fehlt.md)',
  '```',
  '',
  '[fehlt](fehlt.md)',
  '[falsche Schreibung](GUT.md)',
  '',
  '[ziel]: referenz.md',
].join('\n');

test('prüft relative Ziele mit Leerzeichen, Kodierung, Fragmenten, Referenzen und ignoriert Code', () => {
  const root = fixture({
    'doc.md': document,
    'gut.md': '# Gut\n',
    'Ordner/mit leer.md': '# Leerzeichen\n',
    'referenz.md': '# Referenz\n',
    'bild.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  try {
    const reports = checkLinks(root, ['doc.md']);
    const links = reports[0].links;
    assert.deepEqual(
      links.map((link) => [link.target, link.reason]),
      [
        ['fehlt.md', 'nicht vorhanden'],
        ['GUT.md', 'Groß-/Kleinschreibung weicht ab'],
      ],
    );
    const line = extractLinks(document).find((entry) => entry.target === 'fehlt.md');
    assert.equal(links[0].line, line.line);
    const reference = extractLinks(document).find((entry) => entry.kind === 'reference');
    assert.equal(reference.target, 'referenz.md');
    // Codeblock und Codespan erzeugen keine Fehlmeldung; externe Ziele und reine Fragmente zählen nicht.
    assert.ok(!links.some((link) => link.target.includes('im Codeblock') || link.target === 'code'));
    const report = renderReport(reports);
    assert.match(report, /doc\.md/);
    assert.match(report, /Zeile \d+: fehlt\.md -> fehlt\.md \(nicht vorhanden\)/);
    assert.match(report, /2 kaputte relative Linkziele\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('erkennt Kurz-, zusammengefasste und Vollreferenzen sowie Titel- und Klammervarianten', () => {
  const source = [
    '# Kurzreferenzen',
    '',
    '[kurz]',
    '[kurz][]',
    '[voll][ziel]',
    '![bild](bild.png)',
    '[![bild](bild.png)](fehlt-badge.md)',
    '[klammerntitel](fehlt-titel.md "Titel (mit Klammern)")',
    '[rundtitel](fehlt-rund.md (Titel))',
    '[spitz](<fehlt-spitz.md> "Titel")',
    '\\[escaped](fehlt-escape.md)',
    '[ohne definition]',
    '[^fussnote]',
    '`[code](fehlt-code.md)`',
    '',
    '[kurz]: fehlt-kurz.md',
    '[ziel]: fehlt-ziel.md',
    '[^fussnote]: Fussnotentext',
  ].join('\n');
  const root = fixture({
    'doc.md': source,
    'bild.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  try {
    const reports = checkLinks(root, ['doc.md']);
    assert.deepEqual(
      reports[0].links.map((link) => link.target),
      [
        'fehlt-kurz.md',
        'fehlt-kurz.md',
        'fehlt-ziel.md',
        'fehlt-badge.md',
        'fehlt-titel.md',
        'fehlt-rund.md',
        'fehlt-spitz.md',
      ],
    );
    const links = extractLinks(source);
    const kinds = new Set(links.map((link) => link.kind));
    assert.ok(kinds.has('shortcut'));
    assert.ok(kinds.has('collapsed'));
    assert.ok(kinds.has('reference'));
    assert.ok(kinds.has('inline'));
    // Fussnote, escapte Klammer, Definitionszeilen und unbekannte Kurzreferenzen sind keine Links.
    assert.ok(!links.some((link) => link.target === 'fehlt-escape.md'));
    assert.ok(!links.some((link) => link.target === 'Fussnotentext'));
    assert.ok(!links.some((link) => link.target === 'fehlt-code.md'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('wertet maskierte Klammern in Linktexten und Dateinamen aus', () => {
  const source = [
    '[Titel\\] mit Klammer](fehlt.md)',
    '[vorhanden](Beispiel\\(1\\).md)',
    '[fehlender Dateiname](Beispiel\\(2\\).md)',
  ].join('\n');
  const root = fixture({ 'doc.md': source, 'Beispiel(1).md': '# Projektbeispiel\n' });
  try {
    const [{ links }] = checkLinks(root, ['doc.md']);
    assert.deepEqual(
      links.map(({ path }) => path),
      ['fehlt.md', 'Beispiel(2).md'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('erfasst die README- und docs-Dateien des Repos ohne Absturz', () => {
  const documents = scanDocuments(repoRoot);
  assert.ok(documents.includes('README.md'), 'README.md fehlt in der Auswahl');
  assert.ok(documents.includes('README.de.md'), 'README.de.md fehlt in der Auswahl');
  assert.ok(documents.includes('docs/PROJEKTKONTEXT.md'), 'docs-Datei fehlt in der Auswahl');
  assert.ok(
    documents.every((file) => /^(?:[^/]+\.md|docs\/[^/]+\.md)$/.test(file)),
    'Scan ist nicht auf Stamm und docs/ begrenzt',
  );
  const reports = checkLinks(repoRoot);
  assert.equal(reports.length, documents.length);
  for (const report of reports) {
    for (const link of report.links) {
      assert.ok(link.path.length > 0);
      assert.ok(['nicht vorhanden', 'Groß-/Kleinschreibung weicht ab'].includes(link.reason));
    }
  }
  assert.match(renderReport(reports), /\d+ Dokumente geprüft, \d+ kaputte relative Linkziele\./);
});
