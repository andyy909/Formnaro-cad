'use strict';
// Prüft den ausgelagerten Start-/Verify-Parser (P3-4b) ohne Electron.
// argv wird in der Form eines echten Electron-Starts gebaut:
// [Programm, App-Pfad, ...Argumente]. env, cwd, app und IPC-Fähigkeit werden
// injiziert; das Produkt übergibt dieselben Werte aus electron.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const { parseStartupOptions } = require('../backend/startup-options.cjs');

const launchArgv = [process.execPath, path.join(repo, 'electron.cjs')];
const argvWith = (...flags) => [...launchArgv, ...flags];

function fakeApp(options = {}) {
  const switches = [];
  return {
    switches,
    isPackaged: options.packaged === true,
    getPath(name) {
      assert.equal(name, 'temp');
      return options.temp || path.join(os.tmpdir(), 'formnaro-startup-options-test');
    },
    commandLine: {
      appendSwitch(key, value) {
        switches.push(value === undefined ? [key] : [key, value]);
      },
    },
  };
}

function parse(argv, options = {}) {
  return parseStartupOptions({
    argv,
    env: options.env || {},
    cwd: options.cwd || repo,
    app: options.app || fakeApp(),
    baseDirectory: options.baseDirectory || repo,
    hasIpc: options.hasIpc === true,
  });
}

// Reihenfolge des Vorrangs im Parser (erster Treffer gewinnt).
const VERIFY_PRECEDENCE = [
  '--verify-maintenance=',
  '--verify-fusion=',
  '--verify-context-menu=',
  '--verify-solid=',
  '--verify-speech=',
  '--verify-reconstruction=',
  '--verify-modeling-context=',
  '--verify-python=',
  '--verify-auto-dimensions=',
  '--verify-fnpack=',
  '--verify-assembly-display=',
  '--verify-joints=',
  '--verify-sketch-constraints=',
  '--verify-linked-contours=',
  '--verify-project-parameters=',
  '--verify-drawings=',
  '--verify-modeling=',
  '--verify-rotation-ring=',
  '--verify-move-dimensions=',
  '--verify-sketch-upgrade=',
  '--verify-number-display=',
  '--verify-hole-groups=',
  '--verify-mesh-import=',
  '--verify-view-toolbar=',
  '--verify-step-thickness=',
  '--verify-model-placement=',
  '--verify-inspection=',
  '--verify-mesh-sculpt=',
  '--verify-cad-mini-performance=',
  '--verify-creation-domain=',
  '--verify-easy-performance=',
  '--verify-mesh-features=',
  '--verify-mesh-display=',
  '--verify-all-functions=',
  '--verify-ai-result-checks=',
  '--verify-mesh-hollow=',
  '--verify-mesh-make-solid=',
  '--verify-mesh-erase-fill=',
  '--verify-mesh-smooth=',
  '--verify-mesh-remesh=',
  '--verify-mesh-reduce=',
  '--verify-mesh-connectors=',
  '--verify-mesh-partition=',
  '--verify-easy-complete=',
  '--verify-easy-auto-repair=',
  '--verify-easy-domain=',
  '--verify-workbench=',
  '--verify-mesh-hole-fill=',
  '--verify-mesh-simple-repair=',
  '--verify-mesh-inspector=',
  '--verify-mesh-selection=',
  '--verify-release-workflow=',
  '--verify-unified-workflows=',
  '--verify-mesh-to-cad=',
  '--verify-cad-mesh-copy=',
  '--verify-shared-ai=',
  '--verify-converter-workspace=',
  '--verify-tools=',
  '--verify-workspace=',
  '--verify-mesh=',
  '--verify-mixed=',
  '--verify-stl-integration=',
  '--verify-local=',
];

test('Ohne Flags bleiben Produktstart, Diagnose und Übungsmodus aus', () => {
  const options = parse(argvWith());
  assert.equal(options.verifyPath, undefined);
  assert.equal(options.maintenanceVerifyArg, undefined);
  assert.equal(options.verifyInput, undefined);
  assert.equal(options.workingSpeedVerifyArg, undefined);
  assert.equal(options.diagnosticHost, false);
  assert.equal(options.diagnosticChild, false);
  assert.equal(options.practiceChild, false);
  assert.equal(options.practiceDirectory, null);
  assert.equal(options.allFunctionsPhase, 'interactions');
  assert.equal(options.fnpackPhase, 'main');
});

test('Verify-Ziel wird absolut aufgelöst, absolute Pfade bleiben erhalten', () => {
  const absolute = path.join(repo, 'reports', 'maintenance.json');
  const direct = parse(argvWith(`--verify-maintenance=${absolute}`));
  assert.equal(direct.maintenanceVerifyArg, `--verify-maintenance=${absolute}`);
  assert.equal(direct.verifyPath, path.resolve(absolute));

  const cwd = path.join(repo, 'tmp', 'cwd');
  const relative = parse(argvWith('--verify-maintenance=berichte/lauf.json'), { cwd });
  assert.equal(relative.verifyPath, path.resolve(cwd, 'berichte/lauf.json'));

  const slash = parse(argvWith('--verify-drawings=berichte/drawing.json'), { cwd });
  assert.equal(slash.verifyPath, path.resolve(cwd, 'berichte', 'drawing.json'));
});

test('Mehrere Flags bleiben getrennt und Phasen werden gelesen', () => {
  const options = parse(
    argvWith(
      '--verify-drawings=reports/drawings.json',
      '--verify-python=reports/python.json',
      '--verify-mesh=reports/mesh.json',
      '--verify-all-functions=reports/all.json',
      '--verify-all-phase=release',
      '--verify-fnpack=reports/fnpack.json',
      '--verify-fnpack-phase=close',
    ),
  );
  assert.equal(options.drawingsVerifyArg, '--verify-drawings=reports/drawings.json');
  assert.equal(options.pythonVerifyArg, '--verify-python=reports/python.json');
  assert.equal(options.meshVerifyArg, '--verify-mesh=reports/mesh.json');
  assert.equal(options.allFunctionsVerifyArg, '--verify-all-functions=reports/all.json');
  assert.equal(options.fnpackVerifyArg, '--verify-fnpack=reports/fnpack.json');
  assert.equal(options.allFunctionsPhase, 'release');
  assert.equal(options.fnpackPhase, 'close');
  // Python steht in der Vorrangliste vor Zeichnungen und bestimmt den Bericht.
  assert.equal(options.verifyPath, path.resolve(repo, 'reports', 'python.json'));
});

test('Vorrang: in jeder Paarung gewinnt das frühere Flag', () => {
  assert.equal(VERIFY_PRECEDENCE.length, 63);
  for (let index = 0; index < VERIFY_PRECEDENCE.length - 1; index++) {
    const first = VERIFY_PRECEDENCE[index];
    const second = VERIFY_PRECEDENCE[index + 1];
    const options = parse(argvWith(`${first}reports/first-${index}.json`, `${second}reports/second-${index}.json`));
    assert.equal(
      options.verifyPath,
      path.resolve(repo, 'reports', `first-${index}.json`),
      `${first} muss ${second} schlagen`,
    );
  }
});

test('Arbeitsgeschwindigkeit schlägt die gesamte Verify-Kette', () => {
  const options = parse(
    argvWith('--verify-maintenance=reports/maintenance.json', '--verify-working-speed=reports/speed.json'),
  );
  assert.equal(options.workingSpeedVerifyArg, '--verify-working-speed=reports/speed.json');
  assert.equal(options.verifyPath, path.resolve(repo, 'reports', 'speed.json'));
  assert.equal(options.maintenanceVerifyArg, '--verify-maintenance=reports/maintenance.json');
});

test('Doppeltes Flag: der erste Treffer bleibt maßgeblich', () => {
  const options = parse(
    argvWith('--verify-drawings=reports/first.json', '--verify-drawings=reports/second.json'),
  );
  assert.equal(options.drawingsVerifyArg, '--verify-drawings=reports/first.json');
  assert.equal(options.verifyPath, path.resolve(repo, 'reports', 'first.json'));
});

test('Ähnliche Flags greifen nicht ineinander', () => {
  const options = parse(
    argvWith('--verify-mesh-features=reports/features.json', '--verify-mesh=reports/mesh.json'),
  );
  assert.equal(options.meshFeaturesVerifyArg, '--verify-mesh-features=reports/features.json');
  assert.equal(options.meshVerifyArg, '--verify-mesh=reports/mesh.json');
  assert.equal(options.verifyPath, path.resolve(repo, 'reports', 'features.json'));

  const unrelated = parse(argvWith('--verify-drawings-extra=reports/extra.json'));
  assert.equal(unrelated.drawingsVerifyArg, undefined);
  assert.equal(unrelated.verifyPath, undefined);
});

test('Kurze Mesh-Flags erzeugen je Aufruf einen neuen temporären Berichtspfad', () => {
  const first = parse(argvWith('--verify-mesh-inspector', '--verify-mesh-selection', '--verify-shared-ai'));
  const second = parse(argvWith('--verify-mesh-inspector', '--verify-mesh-selection', '--verify-shared-ai'));
  for (const [options, marker] of [
    [first, 'formnaro-mesh-inspector-'],
    [first, 'formnaro-mesh-selection-'],
    [first, 'formnaro-shared-ai-'],
    [second, 'formnaro-mesh-inspector-'],
  ]) {
    const generated = options.verifyPath ? [options.meshInspectorVerifyArg, options.meshSelectionVerifyArg, options.sharedAIVerifyArg] : [];
    const match = generated.find(value => value && value.includes(marker));
    assert.ok(match, marker);
    assert.match(match, new RegExp(`^--verify-[a-z-]+=.*${marker}[0-9a-f-]+[\\\\/]result\\.json$`));
  }
  assert.notEqual(first.meshInspectorVerifyArg, second.meshInspectorVerifyArg);
  assert.notEqual(first.meshSelectionVerifyArg, second.meshSelectionVerifyArg);
  assert.notEqual(first.sharedAIVerifyArg, second.sharedAIVerifyArg);
  assert.equal(first.verifyPath, path.resolve(first.meshInspectorVerifyArg.slice('--verify-mesh-inspector='.length)));
});

test('Diagnosemodi und FORMNARO_DIAGNOSTIC_HOME', () => {
  const packaged = parse(argvWith('--formnaro-diagnostics'), { app: fakeApp({ packaged: true }) });
  assert.equal(packaged.diagnosticHost, true);
  assert.equal(packaged.diagnosticHome, path.join(path.dirname(process.execPath), 'Testprofil'));

  const baseDirectory = path.join(repo, 'tmp', 'diagnosebasis');
  const unpackaged = parse([], { baseDirectory });
  assert.equal(unpackaged.diagnosticHost, false);
  assert.equal(unpackaged.diagnosticHome, path.join(baseDirectory, 'Testprofil'));

  const fromEnv = parse([], { env: { FORMNARO_DIAGNOSTIC_HOME: path.join(repo, 'tmp', 'diagnose') } });
  assert.equal(fromEnv.diagnosticHome, path.resolve(repo, 'tmp', 'diagnose'));
});

test('Übungs- und Diagnosekind: Profilverzeichnis und IPC-Wächter', t => {
  const practiceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-startup-practice-'));
  t.after(() => fs.rmSync(practiceDirectory, { recursive: true, force: true }));

  const fromEnv = parse(argvWith('--formnaro-practice-child'), {
    hasIpc: true,
    env: { FORMNARO_PRACTICE_DIRECTORY: practiceDirectory },
  });
  assert.equal(fromEnv.practiceChild, true);
  assert.equal(fromEnv.diagnosticChild, false);
  assert.equal(fromEnv.practiceDirectory, practiceDirectory);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-startup-temp-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const diagnostic = parse(argvWith('--formnaro-diagnostic-child'), {
    hasIpc: true,
    app: fakeApp({ temp: tempRoot }),
  });
  assert.equal(diagnostic.diagnosticChild, true);
  assert.equal(diagnostic.practiceChild, true);
  assert.equal(path.dirname(diagnostic.practiceDirectory), tempRoot);
  assert.match(path.basename(diagnostic.practiceDirectory), /^formnaro-practice-/);
});

test('Sprachprüfung setzt Aufnahmegeräte relativ zum Bericht', () => {
  const app = fakeApp();
  const options = parse(argvWith(`--verify-speech=${path.join(repo, 'reports', 'speech.json')}`), { app });
  assert.equal(options.verifyPath, path.resolve(repo, 'reports', 'speech.json'));
  assert.deepEqual(app.switches, [
    ['use-fake-device-for-media-stream'],
    ['use-file-for-fake-audio-capture', path.join(path.resolve(repo, 'reports'), 'fixture.wav')],
  ]);
});

test('electron.cjs importiert den Parser und führt Weiche/Verify-Pfade unverändert weiter', () => {
  const electron = fs.readFileSync(path.join(repo, 'electron.cjs'), 'utf8');
  const module = fs.readFileSync(path.join(repo, 'backend', 'startup-options.cjs'), 'utf8');

  assert.ok(electron.includes("const {parseStartupOptions}=require('./backend/startup-options.cjs');"));
  assert.ok(electron.indexOf("require('./backend/startup-options.cjs')") < electron.indexOf('app.whenReady()'));
  assert.equal(electron.split("require('./backend/startup-options.cjs')").length - 1, 1);
  assert.equal(electron.includes("startsWith('--verify-"), false);
  assert.ok((module.match(/startsWith\('--verify-/g) || []).length >= 60);
  assert.ok(!/verification|fixture|^all-functions|^\./.test('startup-options.cjs'));
  assert.ok(electron.includes('backend/startup-options.cjs'));

  // Profil-, Fenster- und Verify-Weiche bleiben beim Aufrufer.
  assert.ok(electron.includes("path.join(path.dirname(verifyPath),'offlinecad-verification-profile')"));
  assert.ok(electron.includes('dataDirectory(app,{verificationPath:verifyPath,root:companion?profilePath:undefined})'));
  assert.ok(electron.includes("companion&&!verifyPath&&!diagnosticHost?path.join(profilePath,'Projekte')"));
  assert.ok(electron.includes('projectDirectory(app,{verificationPath:verifyPath})'));
  assert.ok(electron.includes('const layoutRoot=practiceChild?practiceDirectory:diagnosticHost?diagnosticHome:undefined;'));
  assert.ok(electron.includes('layoutDirectory(app,{root:layoutRoot,verificationPath:verifyPath})'));
  assert.ok(electron.includes('show:!verifyPath&&!diagnosticChild'));
  assert.ok(electron.includes('offscreen:!!verifyPath'));
  assert.ok(electron.includes("verifyPath?{query:{test:'1'}}"));
  assert.ok(electron.includes("app.getPath('userData')!==profilePath"));
  assert.ok(electron.includes('disposeVerification'));
  assert.ok(electron.includes("require('./backend/verification-report.cjs')"));
});
