#!/usr/bin/env node
// Explicit acceptance gate: write and read one foreign STEP sample with the
// locally installed FreeCAD, headless and without any user profile. The
// generated file is checked with Formnaro's reader and the analytic values of
// the FreeCAD script. FreeCAD and Formnaro share the OCCT algorithm family, so
// this is an independent application/binary/reader invocation, not a proof
// from an unrelated geometry algorithm.
//
// Usage:
//   node scripts/step-freecad-foreign-sample.mjs
//   node scripts/step-freecad-foreign-sample.mjs --install-fixture
//
// Larger intermediate files stay in work/step-freecad-foreign/. Pass
// --install-fixture only to refresh the small committed test fixture.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { importCadStepAssembly } from '../src/cad-step-io.js';

const root = fileURLToPath(new URL('..', import.meta.url)),
  work = path.join(root, 'work', 'step-freecad-foreign'),
  script = path.join(root, 'scripts', 'freecad-step-foreign-sample.py'),
  installFixture = process.argv.includes('--install-fixture'),
  near = (actual, expected, message) => {
    if (!(Math.abs(actual - expected) < 1e-4)) throw Error(`${message}: ${actual} != ${expected}`);
  };

function findFreeCad() {
  const candidates = [
    process.env.FORMNARO_FREECAD_CMD,
    path.join(root, 'freecad-runtime', 'runtime', 'FreeCADCmd.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'FreeCAD 1.1', 'bin', 'FreeCADCmd.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'FreeCAD', 'bin', 'FreeCADCmd.exe'),
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw Error('Kein FreeCADCmd gefunden. FORMNARO_FREECAD_CMD setzen.');
  return found;
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(command, args, { ...options, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => (output += chunk.toString()));
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve(output) : reject(Error(`FreeCAD-Prozess (${code}): ${output.slice(-4000)}`)),
    );
  });
}

const exe = findFreeCad(),
  profile = path.join(work, 'profile');
for (const child of ['user', 'data', 'temp']) await fs.mkdir(path.join(profile, child), { recursive: true });
const stepPath = path.join(work, 'foreign-plate.step'),
  expectedPath = path.join(work, 'foreign-plate.json'),
  logPath = path.join(work, 'freecad.log');

const env = {};
// Keep the ordinary Windows process context but never hand provider keys or
// unrelated application secrets to the foreign Python process.
for (const [key, value] of Object.entries(process.env))
  if (!/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i.test(key)) env[key] = value;
Object.assign(env, {
  APPDATA: path.join(profile, 'user'),
  FREECAD_USER_HOME: path.join(profile, 'user'),
  FREECAD_USER_DATA: path.join(profile, 'data'),
  FREECAD_USER_TEMP: path.join(profile, 'temp'),
  TEMP: path.join(profile, 'temp'),
  TMP: path.join(profile, 'temp'),
  PYTHONDONTWRITEBYTECODE: '1',
  QT_QPA_PLATFORM: 'offscreen',
});

const log = await run(exe, ['--user-cfg', path.join(profile, 'user.cfg'), '--system-cfg', path.join(profile, 'system.cfg'), '--log-file', logPath, script], { cwd: work, env: { ...env, FORMNARO_STEP_SAMPLE_STEP: stepPath, FORMNARO_STEP_SAMPLE_EXPECTED: expectedPath } });
const expected = JSON.parse(await fs.readFile(expectedPath, 'utf8')),
  bytes = await fs.readFile(stepPath),
  text = new TextDecoder().decode(bytes);
if (!/MANIFOLD_SOLID_BREP/.test(text)) throw Error('FreeCAD-Ausgabe enthält keinen Volumenkörper.');
if (/(TESSELLATED|TRIANGULATED)/.test(text)) throw Error('FreeCAD-Ausgabe enthält tessellierte Geometrie.');

const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });
let tree;
try {
  tree = importCadStepAssembly(oc, bytes);
} finally {
  // The kernel has no global shutdown; the process ends after the check.
}
const leaf = tree.length === 1 && tree[0].children?.length === 1 ? tree[0].children[0] : tree[0];
const measured = {
  names: tree.map((node) => node.name),
  bounds: leaf.stats?.bounds,
  volume: leaf.stats?.volume,
  solids: leaf.stats?.solids,
};
near(measured.volume, expected.volume, 'Volumen');
for (const key of ['min', 'max'])
  expected.bounds[key].forEach((value, index) => near(measured.bounds[key][index], value, `${key}[${index}]`));
if (measured.solids !== expected.solidCount) throw Error(`Körperzahl: ${measured.solids} != ${expected.solidCount}`);

const evidence = {
  generator: expected.generator,
  freeCadVersion: expected.freeCadVersion,
  occtVersion: expected.occtVersion,
  executable: exe,
  isolatedProfile: profile,
  stepBytes: bytes.length,
  expected,
  measured,
  checkedAt: new Date().toISOString(),
};
await fs.writeFile(path.join(work, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
if (installFixture) {
  const fixture = path.join(root, 'tests', 'fixtures', 'freecad-step-foreign-plate.step');
  await fs.copyFile(stepPath, fixture);
  await fs.writeFile(
    path.join(root, 'tests', 'fixtures', 'freecad-step-foreign-plate.json'),
    JSON.stringify(
      {
        ...expected,
        stepFile: 'freecad-step-foreign-plate.step',
        generatedBy: 'scripts/step-freecad-foreign-sample.mjs --install-fixture',
      },
      null,
      2,
    ) + '\n',
  );
}
console.log(
  JSON.stringify(
    { exe, freeCadVersion: expected.freeCadVersion, occtVersion: expected.occtVersion, volume: measured.volume, bounds: measured.bounds, installFixture },
    null,
    2,
  ),
);
console.log(log.slice(-1200));
