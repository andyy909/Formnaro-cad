import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prüft relative Markdown-Links in README*.md und in den direkt unter docs/
 * liegenden .md-Dateien. Externe Ziele, reine Fragmente und absolute Pfade
 * werden ausgelassen. Geprüft wird vom Verzeichnis des jeweiligen Dokuments
 * aus; Zielfragmente und Query-Teile werden abgetrennt, URL-kodierte Pfade
 * dekodiert. Fenced-Codeblöcke und Inline-Codespans enthalten keine Links.
 *
 * Erkannt werden Inline-Ziele (auch in spitzen Klammern und mit Titel in
 * Anführungszeichen oder Klammern), Voll-, Kurz- und zusammengefasste
 * Referenzen (`[a][b]`, `[a][]`, `[a]`) sowie verschachtelte Links in
 * Linktexten (z. B. Badges). Fussnoten (`[^1]`) sind keine Linkziele.
 * HTML-Ziele (`<a href=...>`) sind nicht Teil dieser Prüfung.
 */

const scriptRoot = fileURLToPath(new URL('../', import.meta.url));

export const SCAN_GLOBS = ['README*.md', 'docs/*.md'];

export function splitLines(source) {
  return source.split(/\r?\n/);
}

/** Ersetzt fenced code blocks und Inline-Codespans durch Leerzeichen, Zeilen bleiben erhalten. */
export function maskCode(source) {
  const lines = splitLines(source);
  const masked = [];
  let fence = null;
  for (const line of lines) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      masked.push(' '.repeat(line.length));
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      masked.push(' '.repeat(line.length));
      continue;
    }
    masked.push(line.replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length)));
  }
  return masked;
}

/** Findet die passende schließende Klammer ab `start` (Index der öffnenden Klammer). */
function closingBracket(text, start, open, close) {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (character === '\n') return -1;
    if (character === '\\') {
      index++;
      continue;
    }
    if (character === open) depth++;
    else if (character === close) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Liest ein Inline-Ziel ab der öffnenden Klammer. Klammern in spitzen
 * Klammern und in Titeln zählen nicht als Begrenzer. `start` zeigt auf "(".
 */
function balancedDestination(text, start) {
  let depth = 0;
  let angle = false;
  let quote = null;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (character === '\n') return null;
    if (quote) {
      if (character === quote && text[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === '\\') {
      index++;
      continue;
    }
    if (angle) {
      if (character === '>') angle = false;
      continue;
    }
    if (character === '<') {
      angle = true;
      continue;
    }
    if ((character === '"' || character === "'") && /\s/.test(text[index - 1] ?? '')) {
      quote = character;
      continue;
    }
    if (character === '(') depth++;
    else if (character === ')') {
      depth--;
      if (depth === 0) return { raw: text.slice(start + 1, index), end: index };
    }
  }
  return null;
}

function isTitle(value) {
  return (
    /^"(?:[^"\\]|\\.)*"$/.test(value) ||
    /^'(?:[^'\\]|\\.)*'$/.test(value) ||
    /^\((?:[^()\\]|\\.|\([^()]*\))*\)$/.test(value)
  );
}

/** Zerlegt ein Ziel in den Pfad und entfernt spitze Klammern und optionale Titel. */
function cleanDestination(raw) {
  const destination = raw.trim();
  if (destination.startsWith('<')) {
    const close = destination.indexOf('>');
    if (close < 0) return null;
    const inside = destination.slice(1, close).trim();
    const rest = destination.slice(close + 1).trim();
    if (rest && !isTitle(rest)) return null;
    return inside;
  }
  const title = /\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.|\([^()]*\))*\))\s*$/.exec(destination);
  if (title) return destination.slice(0, title.index).trim();
  return destination;
}

/** Normalisiert Referenznamen wie Markdown: getrimmt, Leerraum zusammengefasst, ohne Groß-/Kleinschreibung. */
function normalizeLabel(label) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function referenceDefinitions(maskedLines) {
  const definitions = new Map();
  for (const line of maskedLines) {
    const match = /^\s{0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)/.exec(line);
    if (!match) continue;
    const label = normalizeLabel(match[1]);
    if (!label || label.startsWith('^')) continue; // Fussnoten sind keine Linkziele
    const target = cleanDestination(match[2]);
    if (target) definitions.set(label, target);
  }
  return definitions;
}

export function extractLinks(source) {
  const masked = maskCode(source);
  const definitions = referenceDefinitions(masked);
  const links = [];
  masked.forEach((line, index) => {
    const skip = new Set();
    for (let start = line.indexOf('['); start >= 0; start = line.indexOf('[', start + 1)) {
      if (skip.has(start)) continue;
      let backslashes = 0;
      for (let before = start - 1; before >= 0 && line[before] === '\\'; before--) backslashes++;
      if (backslashes % 2 === 1) continue; // escaptes "\[" ist kein Link
      const close = closingBracket(line, start, '[', ']');
      if (close < 0) continue;
      if (line[close + 1] === ':') continue; // Referenzdefinition, kein Link
      const text = line.slice(start + 1, close);
      const next = close + 1;
      if (line[next] === '(') {
        const parsed = balancedDestination(line, next);
        if (!parsed) continue;
        const target = cleanDestination(parsed.raw);
        if (target) links.push({ line: index + 1, target, kind: 'inline' });
        continue;
      }
      if (line[next] === '[') {
        const labelClose = line.indexOf(']', next + 1);
        if (labelClose < 0) continue;
        const rawLabel = line.slice(next + 1, labelClose);
        skip.add(next);
        const label = normalizeLabel(rawLabel || text);
        const target = label ? definitions.get(label) : undefined;
        if (target) links.push({ line: index + 1, target, kind: rawLabel ? 'reference' : 'collapsed' });
        continue;
      }
      const label = normalizeLabel(text);
      const target = label ? definitions.get(label) : undefined;
      if (target) links.push({ line: index + 1, target, kind: 'shortcut' });
    }
  });
  return links;
}

export function isSkipped(target) {
  if (!target || target.startsWith('#')) return 'Fragment';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(target)) return 'extern/absolut';
  return null;
}

export function decodeTarget(target) {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

export function inventory(root) {
  const output = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' });
  const files = new Set(output.split('\0').filter(Boolean));
  const directories = new Set();
  for (const file of files) {
    let directory = posix.dirname(file);
    while (directory && directory !== '.' && !directories.has(directory)) {
      directories.add(directory);
      directory = posix.dirname(directory);
    }
  }
  const lower = new Map();
  for (const file of files) if (!lower.has(file.toLowerCase())) lower.set(file.toLowerCase(), file);
  return { files, directories, lower };
}

export function resolveLink(document, target) {
  let path = target;
  const hash = path.indexOf('#');
  if (hash >= 0) path = path.slice(0, hash);
  const query = path.indexOf('?');
  if (query >= 0) path = path.slice(0, query);
  path = decodeTarget(path.replace(/\\([()\\])/g, '$1'));
  if (!path) return null; // reines Fragment nach Abtrennung
  const normalized = posix.normalize(posix.join(posix.dirname(document), path));
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

export function checkLinks(root, documents = scanDocuments(root)) {
  const index = inventory(root);
  const reports = [];
  for (const document of documents) {
    const source = readFileSync(resolve(root, document), 'utf8');
    const links = [];
    for (const link of extractLinks(source)) {
      if (isSkipped(link.target)) continue;
      const path = resolveLink(document, link.target);
      if (!path) continue;
      const directoryLink = /\/$/.test(link.target);
      const exists = directoryLink ? index.directories.has(path) || index.files.has(path) : index.files.has(path);
      if (exists) continue;
      const lower = index.lower.get(path.toLowerCase());
      let reason = 'nicht vorhanden';
      if (lower) reason = 'Groß-/Kleinschreibung weicht ab';
      else if (index.directories.has(path)) continue; // Verzeichnis ohne abschließenden Schrägstrich
      links.push({ ...link, path, reason });
    }
    reports.push({ document, links });
  }
  return reports;
}

export function scanDocuments(root) {
  const output = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...SCAN_GLOBS], { encoding: 'utf8' });
  return output
    .split('\0')
    .filter(Boolean)
    .filter((file) => /^[^/]+\.md$/.test(file) || /^docs\/[^/]+\.md$/.test(file))
    .sort();
}

export function renderReport(reports) {
  const broken = reports.reduce((count, report) => count + report.links.length, 0);
  const lines = [];
  for (const report of reports) {
    if (!report.links.length) continue;
    lines.push(`${report.document}`);
    for (const link of report.links) {
      lines.push(`  Zeile ${link.line}: ${link.target} -> ${link.path} (${link.reason})`);
    }
    lines.push('');
  }
  lines.push(`${reports.length} Dokumente geprüft, ${broken} kaputte relative Linkziele.`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { root: scriptRoot, json: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--repo') options.root = argv[++index];
    else throw new Error(`Unbekanntes Argument: ${argument}`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const root = options.root;
  const reports = checkLinks(root);
  if (options.json) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    console.log(renderReport(reports));
  }
  const broken = reports.reduce((count, report) => count + report.links.length, 0);
  process.exit(broken ? 1 : 0);
}
