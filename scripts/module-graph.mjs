import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

const scriptRoot = fileURLToPath(new URL('../', import.meta.url));
const codeFile = /\.[cm]?js$/;
const unique = (items) => [...new Set(items)].sort();

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

function literal(node) {
  if (typeof node?.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
  return null;
}

export function moduleReferences(source, file) {
  const references = [], dynamic = [], strings = [];
  const ast = parseAst(source, { sourceType: file.endsWith('.cjs') ? 'script' : 'module' }, file);
  walk(ast, (node) => {
    const value = literal(node);
    if (value !== null) strings.push(value);
    let argument, kind;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) {
      argument = node.source; kind = 'import';
    } else if (node.type === 'ImportExpression') {
      argument = node.source; kind = 'dynamic-import';
    } else if (node.type === 'CallExpression' && node.callee?.name === 'require') {
      argument = node.arguments[0]; kind = 'require';
    } else if (node.type === 'NewExpression' && node.callee?.name === 'URL'
        && source.slice(node.arguments[1]?.start, node.arguments[1]?.end).replace(/\s/g, '') === 'import.meta.url') {
      argument = node.arguments[0]; kind = 'url';
    }
    if (!argument) return;
    const specifier = literal(argument);
    const line = source.slice(0, node.start).split('\n').length;
    if (specifier === null) dynamic.push({ file, line, kind, expression: source.slice(argument.start, argument.end) });
    else if (specifier.startsWith('.')) references.push({ specifier, kind, line });
  });
  return { references, dynamic, strings: unique(strings) };
}

export function resolveRelative(file, specifier) {
  return posix.normalize(posix.join(posix.dirname(file), specifier.split(/[?#]/)[0]));
}

export function reachable(entry, edges) {
  const seen = new Set(), pending = [entry];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file) || !edges.has(file)) continue;
    seen.add(file);
    pending.push(...edges.get(file));
  }
  return seen;
}

export function buildGraph(files, read) {
  const modules = files.filter((file) => file.startsWith('src/') && /\.m?js$/.test(file)).sort();
  const moduleSet = new Set(modules), fileSet = new Set(files);
  const consumers = files.filter((file) => /^(?:src\/|tests\/|backend\/|mini\/|mini-cad\/|scripts\/|electron\.cjs$|preload\.cjs$)/.test(file)
    && /\.(?:[cm]?js|json|html|py|ps1|sh)$/.test(file)).sort();
  const edges = new Map(), uses = new Map(modules.map((file) => [file, []]));
  const mentions = new Map(modules.map((file) => [file, []]));
  const unresolved = [], dynamic = [];
  for (const file of consumers) {
    const source = read(file);
    if (!file.startsWith('src/')) {
      for (const module of modules) if (source.includes(posix.basename(module))) mentions.get(module).push(file);
    }
    if (!codeFile.test(file)) continue;
    const parsed = moduleReferences(source, file);
    dynamic.push(...parsed.dynamic);
    const dependencies = [];
    for (const ref of parsed.references) {
      const target = resolveRelative(file, ref.specifier);
      if (!fileSet.has(target)) unresolved.push({ file, ...ref, target });
      if (!moduleSet.has(target)) continue;
      dependencies.push(target);
      uses.get(target).push({ file, kind: ref.kind, line: ref.line });
    }
    // File I/O and embedded test programs also use literal paths. These are
    // conservative review candidates, separate from executable import edges.
    for (const value of parsed.strings) {
      const target = value.startsWith('.') ? resolveRelative(file, value) : value.replace(/^\//, '');
      if (moduleSet.has(target) && !dependencies.includes(target)) uses.get(target).push({ file, kind: 'path-literal' });
    }
    edges.set(file, unique(dependencies));
  }
  const cad = reachable('src/cad-main.js', edges), legacy = reachable('src/main.js', edges);
  return {
    schemaVersion: 1,
    entrypoints: { current: 'src/cad-main.js', legacy: 'src/main.js' },
    method: 'Parsed imports/exports, literal dynamic imports, require and import.meta.url URLs; exact relative paths including query stripping. Mentions and path literals require manual review, never imply an import. Computed paths are reported, not assumed absent.',
    summary: { modules: modules.length, current: cad.size, legacyOnly: modules.filter((file) => legacy.has(file) && !cad.has(file)).length },
    unresolved, dynamic,
    modules: modules.map((file) => ({
      file, current: cad.has(file), legacyOnly: legacy.has(file) && !cad.has(file),
      imports: edges.get(file) ?? [], consumers: uses.get(file), mentionedBy: mentions.get(file),
    })),
  };
}

export function writeGraph(root = scriptRoot) {
  const files = unique(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));
  const graph = buildGraph(files, (file) => readFileSync(resolve(root, file), 'utf8'));
  const { modules, ...header } = graph;
  const output = JSON.stringify(header, null, 2).slice(0, -2) + ',\n  "modules": [\n'
    + modules.map((row) => '    ' + JSON.stringify(row)).join(',\n') + '\n  ]\n}\n';
  writeFileSync(resolve(root, 'docs/MODULGRAPH.json'), output);
  console.log(JSON.stringify(graph.summary));
  return graph;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeGraph();
