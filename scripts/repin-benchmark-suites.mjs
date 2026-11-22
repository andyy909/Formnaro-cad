#!/usr/bin/env node
// Bindet die Benchmark-Suiten nach einer Änderung an einer gepinnten Datei neu.
//
// Die Basis-, Aufbau- und Vormachen-Manifeste halten unter
// `dependencies` den SHA-256 jeder Datei fest, die Ablauf oder Prüfung berührt.
// Weicht eine Datei ab, verweigert verifySuite() den Benchmark. Dieses Skript
// übernimmt die neuen Hashes, erhöht die Patch-Version der betroffenen Suite,
// setzt `revisionReason` und gleicht die Versionsangaben im Test an.
//
// Aufgaben (`cases`, `taskHash`), Grenzen (`limits`) und der Kalibrierbeleg
// (`calibration`) werden nie verändert. Ändert sich ein Prüfer fachlich, ist
// eine neue native Kalibrierung nötig – das leistet dieses Skript nicht.
//
//   node scripts/repin-benchmark-suites.mjs --check
//   node scripts/repin-benchmark-suites.mjs --reason "Kurze Begründung auf Englisch"

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SUITES = [
  ['core', 'ai/benchmark-core-v1.json'],
  ['advanced', 'ai/benchmark-advanced-v2.json'],
  ['guided', 'ai/benchmark-guided-v1.json'],
];
const VERSION_TESTS = ['tests/ai-advanced-benchmark.test.cjs'];

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const bumpPatch = version => {
  const parts = String(version).split('.');
  if (parts.length !== 3 || parts.some(p => !/^\d+$/.test(p))) throw Error('Unerwartete Suite-Version: ' + version);
  return [parts[0], parts[1], Number(parts[2]) + 1].join('.');
};

// Ermittelt je Suite, welche gepinnten Hashes nicht mehr stimmen. Verändert nichts.
export function inspectSuites(root) {
  return SUITES.map(([, relative]) => {
    const file = path.join(root, relative), suite = JSON.parse(fs.readFileSync(file, 'utf8')), changed = [];
    for (const dependency of suite.dependencies ?? []) {
      const target = path.join(root, dependency.path);
      if (!fs.existsSync(target)) throw Error('Gepinnte Datei fehlt: ' + dependency.path);
      const current = sha256(target);
      if (current !== dependency.sha256) changed.push({ path: dependency.path, from: dependency.sha256, to: current });
    }
    return { relative, file, suite, changed };
  });
}

// Schreibt neue Hashes, Version und Begründung. Gibt die Änderungen je Suite zurück.
export function repinSuites(root, reason) {
  if (typeof reason !== 'string' || reason.trim().length < 10) throw Error('--reason mit einer kurzen Begründung angeben (mindestens 10 Zeichen).');
  const results = [];
  for (const { relative, file, suite, changed } of inspectSuites(root)) {
    if (!changed.length) { results.push({ relative, changed: [], version: suite.version }); continue; }
    const before = { cases: JSON.stringify(suite.cases), limits: JSON.stringify(suite.limits) };
    const previous = suite.version, next = bumpPatch(previous);
    for (const change of changed) suite.dependencies.find(d => d.path === change.path).sha256 = change.to;
    suite.version = next;
    suite.revisionReason = reason.trim();
    if (JSON.stringify(suite.cases) !== before.cases || JSON.stringify(suite.limits) !== before.limits) throw Error('Aufgaben oder Grenzen wären verändert worden.');
    fs.writeFileSync(file, JSON.stringify(suite, null, 2) + '\n');
    for (const test of VERSION_TESTS) {
      const target = path.join(root, test);
      if (!fs.existsSync(target)) continue;
      const text = fs.readFileSync(target, 'utf8'), updated = text.split("'" + previous + "'").join("'" + next + "'");
      if (updated !== text) fs.writeFileSync(target, updated);
    }
    results.push({ relative, changed, previous, version: next });
  }
  return results;
}

// Prüft mit dem echten Laborcode alle Suiten.
export function verifySuites(root) {
  const benchmark = createRequire(path.join(root, 'package.json'))('./backend/ai-lab-benchmark.cjs');
  return SUITES.map(([id]) => { const s = benchmark.verifySuite(root, id); return { suiteId: s.suiteId, suiteVersion: s.suiteVersion }; });
}

function main() {
  const args = process.argv.slice(2), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reasonIndex = args.indexOf('--reason'), reason = reasonIndex >= 0 ? args[reasonIndex + 1] : undefined;
  if (args.includes('--check')) {
    const open = inspectSuites(root).filter(s => s.changed.length);
    if (!open.length) { console.log('Alle gepinnten Dateien stimmen. Nichts zu tun.'); return; }
    for (const s of open) console.log(s.relative + ': geändert → ' + s.changed.map(c => c.path).join(', '));
    console.log('Neu binden mit: node scripts/repin-benchmark-suites.mjs --reason "…"');
    process.exitCode = 1;
    return;
  }
  const results = repinSuites(root, reason);
  for (const r of results) console.log(r.changed.length ? r.relative + ': ' + r.previous + ' → ' + r.version + ' (' + r.changed.map(c => c.path).join(', ') + ')' : r.relative + ': unverändert (' + r.version + ')');
  for (const s of verifySuites(root)) console.log('Geprüft: ' + s.suiteId + ' ' + s.suiteVersion);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
