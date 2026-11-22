const fs = require('node:fs');
const files = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const { unzipSync } = require('fflate');
const { categories, profiles, publicProfiles, stageProfiles } = require('./orca-profiles.cjs');

const portable = require('./orca-portable.cjs');
const execute = promisify(execFile);
const failure = (code, message) => Object.assign(Error(message), { code });
const keysOnly = (args, keys) => args && typeof args === 'object' && !Array.isArray(args) &&
  Object.keys(args).every(key => keys.includes(key));
const statFile = file => file && fs.statSync(file, { throwIfNoEntry: false })?.isFile();
const inputLimit = 128 * 1024 * 1024;

const printOptions = {
  layerHeight: { schema: { type: 'number', minimum: 0.05, maximum: 1 }, flag: 'layer-height' },
  wallLoops: { schema: { type: 'integer', minimum: 1, maximum: 12 }, flag: 'wall-loops' },
  infillPercent: { schema: { type: 'number', minimum: 0, maximum: 100 }, flag: 'sparse-infill-density' },
  supports: { schema: { type: 'boolean' }, flag: 'enable-support' },
};

const sliceSchema = {
  type: 'object', additionalProperties: false, required: ['action'],
  properties: {
    action: { enum: ['status', 'slice'] },
    revision: { type: 'string', pattern: '^[0-9a-f]{16}$' },
    ids: { type: 'array', minItems: 1, maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 200 } },
    ...Object.fromEntries(Object.entries(printOptions).map(([key, option]) => [key, option.schema])),
  },
};

function validateGeometry(args) {
  if (typeof args.revision !== 'string' || !/^[0-9a-f]{16}$/.test(args.revision) ||
      args.ids !== undefined && (!Array.isArray(args.ids) || !args.ids.length || args.ids.length > 500 ||
      args.ids.some(id => typeof id !== 'string' || !id.length || id.length > 200) ||
      new Set(args.ids).size !== args.ids.length)) {
    throw failure('ORCA_INPUT', 'Aktuelle CAD-Revision und gültige Teile für Orca auswählen.');
  }
}

function cliOverrides(args) {
  const flags = [];
  for (const [key, { schema, flag }] of Object.entries(printOptions)) {
    const value = args[key];
    if (value === undefined) continue;
    const valid = schema.type === 'boolean' ? typeof value === 'boolean' :
      Number.isFinite(value) && value >= schema.minimum && value <= schema.maximum &&
      (schema.type !== 'integer' || Number.isInteger(value));
    if (!valid) throw failure('ORCA_INPUT', 'Ungültige Druckeinstellung: ' + key);
    if (schema.type === 'boolean') flags.push('--' + flag + '=' + Number(value));
    else flags.push('--' + flag + '=' + (key === 'infillPercent' ? value + '%' : value));
  }
  return flags;
}

function sliceFailure(error, directory) {
  const details = String(error.stderr || error.stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const line = details.find(value => /exclusion area|too (?:large|tall)|outside|collision|invalid option|support|invalid config/i.test(value));
  const reason = line?.replaceAll(directory, 'Orca-Auftrag').slice(0, 480);
  return failure('ORCA_SLICE_FAILED', error.killed ? 'OrcaSlicer hat das Zeitlimit erreicht.' :
    'OrcaSlicer konnte nicht slicen (Exit ' + (Number.isInteger(error.code) ? error.code | 0 : 'unbekannt') + ').' +
    (reason ? ' ' + reason : ' Prüfe die Profile und öffne das Modell bei Bedarf in OrcaSlicer.'));
}

function readSliceStatistics(bytes) {
  const metadata = unzipSync(bytes, { filter: file =>
    /^Metadata\/plate_\d+\.statistics\.json$/.test(file.name) && file.originalSize <= 64 * 1024 * 1024 });
  const plates = Object.entries(metadata).map(([name, body]) => {
    const { generator, summary } = JSON.parse(Buffer.from(body).toString('utf8'));
    const values = {
      seconds: summary?.time, grams: summary?.weight, layers: summary?.layer_count,
      supportGrams: (summary?.filaments ?? []).reduce((sum, item) => sum + (item.support?.weight ?? 0), 0),
    };
    if (Object.values(values).some(value => !Number.isFinite(value) || value < 0) || !values.layers)
      throw failure('ORCA_STATISTICS', 'OrcaSlicer hat unvollständige Druckstatistiken geliefert.');
    return { plate: Number(name.match(/\d+/)[0]), generator: String(generator ?? '').slice(0, 100), ...values };
  }).sort((a, b) => a.plate - b.plate);
  if (!plates.length) throw failure('ORCA_STATISTICS', 'Keine Druckstatistik. Für diese Funktion wird OrcaSlicer 2.5 oder neuer benötigt.');
  return plates;
}

function createOrcaSlicer({ dataDirectory, bridgeDirectory, orcaConfigDirectory, portableRoot = path.join(path.dirname(process.execPath), 'tools', 'orca-slicer'), dialog, window, writeAtomic, run = execute }) {
  const settingsFile = path.join(dataDirectory, 'orca-slicer.json');
  const systemData = orcaConfigDirectory ?? path.join(process.env.APPDATA || os.homedir(), 'OrcaSlicer');
  let saved = {};
  try {
    const value = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  } catch { /* The first start uses the discovered installation. */ }
  let root, active, closed = false;
  const recent = new Map();

  let installation, installProgress = '', lastRelease;
  const contacts = new Map();
  const manifest = path.join(portableRoot, 'version.json');
  function portableVersion() {
    try {
      const value = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
      if (portable.versionPattern.test(value) && statFile(path.join(portableRoot, value, 'orca-slicer.exe'))) return value;
    } catch { /* No managed installation yet. */ }
    return null;
  }
  function mode() { return saved.mode ?? (systemExecutable() || !portableVersion() ? 'system' : 'portable'); }
  function profileDirectory(exe = executable()) {
    if (mode() === 'portable') return path.join(portableRoot, 'data_dir');
    const local = exe && path.join(path.dirname(exe), 'data_dir');
    return !orcaConfigDirectory && local && fs.statSync(local,{throwIfNoEntry:false})?.isDirectory() ? local : systemData;
  }
  function executable() {
    if (mode() === 'portable') {
      const version = portableVersion();
      return version && path.join(portableRoot, version, 'orca-slicer.exe');
    }
    return systemExecutable();
  }
  function systemExecutable() {
    if (process.platform !== 'win32') return undefined;
    return [saved.executable, process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'OrcaSlicer', 'orca-slicer.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'OrcaSlicer', 'orca-slicer.exe')]
      .find(file => typeof file === 'string' && path.isAbsolute(file) && path.basename(file).toLowerCase() === 'orca-slicer.exe' && statFile(file));
  }

  function installed() {
    const exe = executable();
    if (!exe) throw failure('ORCA_UNAVAILABLE', 'OrcaSlicer wurde nicht gefunden. Wähle orca-slicer.exe im 3D-Druck-Dialog.');
    return exe;
  }

  function persist(update) {
    const next = { ...saved, ...update };
    fs.mkdirSync(dataDirectory, { recursive: true });
    writeAtomic(settingsFile, JSON.stringify(next));
    saved = next;
  }

  async function catalog() {
    const exe = installed();
    return profiles(exe, profileDirectory(exe), saved.picks?.[profileKey()] ?? (mode() === 'system' && !saved.picks ? saved : {}));
  }

  function profileKey() {
    return mode() === 'portable' ? 'portable' : profileDirectory().toLowerCase();
  }
  function remember(choice) {
    persist({ picks: { ...saved.picks, [profileKey()]: choice } });
  }
  function changeMode(update) {
    const key = profileKey();
    const legacy = !saved.picks && mode() === 'system' ? Object.fromEntries(categories.map(k => [k, saved[k]])) : {};
    persist({ picks: saved.picks ?? { [key]: legacy }, ...update });
  }

  function selection(snapshot, pick) {
    if (pick !== undefined && !keysOnly(pick, categories))
      throw failure('ORCA_PROFILE', 'Ungültige Auswahl der Orca-Druckprofile.');
    const result = {};
    for (const category of categories) {
      const value = pick?.[category] ?? snapshot.defaults[category];
      const record = snapshot.choices[category].find(item => item.id === value);
      if (!record) throw failure('ORCA_PROFILE', 'Unter 3D-Druck ein Drucker-, Prozess- und Filamentprofil auswählen.');
      if (category !== 'machine' && Array.isArray(record.value.compatible_printers) &&
          record.value.compatible_printers.length &&
          ![snapshot.records.get(result.machine).name, snapshot.records.get(result.machine).value.inherits].some(name => record.value.compatible_printers.includes(name)))
        throw failure('ORCA_PROFILE', 'Das gewählte Prozess- oder Filamentprofil passt nicht zum Drucker.');
      result[category] = record.id;
    }
    return result;
  }

  function labels(snapshot, choice) {
    return Object.fromEntries(categories.map(category => [category, snapshot.records.get(choice[category])?.name ?? null]));
  }

  function cleanup(directory) {
    if (directory && root && path.dirname(directory) === root) fs.rmSync(directory, { recursive: true, force: true });
  }

  async function prepare(args, mode, exportModel, signal) {
    if (closed || active || installation) throw failure('ORCA_BUSY', 'Ein Orca-Auftrag läuft bereits.');
    validateGeometry(args);
    const exe = installed();
    const overrides = mode === 'slice' ? cliOverrides(args) : [];
    const controller = new AbortController();
    const localSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let directory;
    active = controller;
    try {
      localSignal.throwIfAborted();
      const snapshot = mode === 'slice' ? await catalog() : null;
      const choice = snapshot ? selection(snapshot, args.profiles) : null;
      if (args.profiles && choice) remember(choice);
      const model = await exportModel({ format: '3mf', revision: args.revision, ids: args.ids }, localSignal);
      localSignal.throwIfAborted();
      if (model?.revision !== args.revision || typeof model.dataBase64 !== 'string' ||
          model.dataBase64.length > Math.ceil(inputLimit * 4 / 3) + 4)
        throw failure('ORCA_MODEL', 'Das gewählte Formnaro-Modell kann nicht als 3MF übergeben werden.');
      const geometry = Buffer.from(model.dataBase64, 'base64');
      if (geometry.length < 4 || geometry.length > inputLimit || geometry.readUInt32LE(0) !== 0x04034b50)
        throw failure('ORCA_MODEL', 'Formnaro hat keine gültige 3MF-Geometrie exportiert.');
      root ??= fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'formnaro-orca-'));
      const id = randomUUID();
      directory = path.join(root, id);
      const input = path.join(directory, 'Formnaro.3mf');
      const output = path.join(directory, 'Orca-Druckprojekt.3mf');
      await files.mkdir(directory);
      await files.writeFile(input, geometry);
      localSignal.throwIfAborted();
      const receipt = { id, revision: args.revision, createdAt: new Date().toISOString(), ...(args.ids ? { ids: args.ids } : {}) };
      if (mode === 'openModel') {
        await open(exe, input, profileDirectory(exe));
        retain(id, { directory, file: input });
        return receipt;
      }
      const isolated = path.join(directory, 'profile');
      const staged = await stageProfiles(snapshot, choice, isolated);
      const [machine, process, filament] = staged.paths;
      localSignal.throwIfAborted();
      if ([machine, process, filament].some(file => file.includes(';')))
        throw failure('ORCA_PROFILE', 'Profilpfade mit Semikolon können nicht an OrcaSlicer übergeben werden.');
      const log = path.join(directory, 'slice.log');
      try {
        await run(exe, ['--datadir', isolated, '--debug', '3', '--logfile', log,
          '--load-settings', process + ';' + machine, '--load-filaments', filament, '--load-defaultfila',
          '--arrange', '1', '--allow-rotations=0', '--ensure-on-bed', '--slice', '0',
          '--export-statistics', '--outputdir', directory, '--export-3mf', path.basename(output), ...overrides, input],
        { cwd: directory, windowsHide: true, encoding: 'utf8', timeout: 300000, maxBuffer: 2 * 1024 * 1024, signal: localSignal });
      } catch (error) {
        localSignal.throwIfAborted();
        throw sliceFailure(error, directory);
      }
      localSignal.throwIfAborted();
      const info = await files.stat(output).catch(() => null);
      if (!info?.isFile() || info.size > inputLimit)
        throw failure('ORCA_OUTPUT', 'OrcaSlicer hat kein lesbares Druckprojekt erzeugt.');
      const plates = readSliceStatistics(await files.readFile(output));
      Object.assign(receipt, {
        profiles: labels(snapshot, choice),
        ...(staged.migratedKobraBed ? { profileNote: 'Vier Randstreifen des Kobra-3-Druckbetts wurden als getrennte Sperrvolumen übernommen.' } : {}),
        settings: Object.fromEntries(Object.keys(printOptions).filter(key => args[key] !== undefined).map(key => [key, args[key]])),
        plates,
      });
      retain(id, { directory, file: output, receipt, exe, profileDir: profileDirectory(exe) });
      return receipt;
    } catch (error) {
      cleanup(directory);
      throw error;
    } finally {
      active = null;
      if (closed) dispose();
    }
  }

  function retain(id, result) {
    recent.set(id, result);
    while (recent.size > 8) {
      const [oldId, old] = recent.entries().next().value;
      recent.delete(oldId);
      cleanup(old.directory);
    }
  }

  function open(exe, file, profileDir) {
    return new Promise((resolve, reject) => {
      const args = ['--datadir', profileDir];
      if (file) args.push(file);
      const child = spawn(exe, args, { cwd: path.dirname(exe), detached: true, stdio: 'ignore',
        env: bridgeDirectory ? { ...process.env, FORMNARO_ORCA_CONNECTION_FILE: path.join(bridgeDirectory, 'ai-bridge.json') } : process.env });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  }

  async function setup() {
    const exe = executable();
    const state = { available: !!exe, supported: process.platform === 'win32', busy: !!active || !!installation, mode: mode(), portableVersion: portableVersion(),
      version: mode() === 'portable' ? portableVersion() : await portable.systemVersion(exe),
      latestVersion: lastRelease?.version, updateAvailable: !!lastRelease && portable.isNewer(lastRelease.version, portableVersion()), executable: exe, profileDir: profileDirectory(exe),
      pluginPresent: statFile(path.join(profileDirectory(exe), 'orca_plugins/formnaro_chat/orca-formnaro-chat.py')) === true,
      connected: Date.now() - (contacts.get(mode()) ?? 0) < 6000,
      recent: [...recent.values()].reverse().flatMap(value => value.receipt ? [value.receipt] : []) };
    if (!exe) return state;
    const snapshot = await catalog();
    return { ...state, choices: publicProfiles(snapshot), defaults: snapshot.defaults };
  }

  async function agentRequest(args, { signal, rpc } = {}) {
    if (keysOnly(args, ['action']) && args.action === 'status') {
      const snapshot = await catalog();
      const selected = labels(snapshot, snapshot.defaults);
      let ready = true;
      try { selection(snapshot); } catch { ready = false; }
      return { available: true, mode: mode(), busy: !!active || !!installation, ready, profiles: selected };
    }
    if (keysOnly(args, Object.keys(sliceSchema.properties)) && args.action === 'slice') return prepare(args, 'slice', (exportArgs, exportSignal) => rpc('export', exportArgs, { signal: exportSignal }), signal);
    throw failure('ORCA_INPUT', 'Unbekannte Orca-Aktion.');
  }

  async function desktopRequest(args) {
    const fields = ['action', 'revision', 'ids', 'model'];
    if (keysOnly(args, ['action']) && args.action === 'setup') return setup();
    if (keysOnly(args,['action']) && args.action === 'launchInstance') {
      const exe = installed();
      await open(exe,null,profileDirectory(exe));
      return true;
    }
    if (keysOnly(args,['action']) && args.action === 'installProgress') return installProgress;
    if (keysOnly(args,['action']) && args.action === 'checkRelease') {
      lastRelease = await portable.latest(new AbortController().signal);
      return setup();
    }
    if (keysOnly(args,['action','mode']) && args.action === 'selectInstance' && ['system','portable'].includes(args.mode)) {
      if (active || installation) throw Error('Ein Orca-Auftrag läuft.');
      if (args.mode === 'portable' && !portableVersion()) throw Error('Portables Orca zuerst einrichten.');
      changeMode({mode: args.mode});
      return setup();
    }
    if (keysOnly(args,['action']) && args.action === 'installPortable' && process.platform === 'win32') {
      if (active || installation) throw Error('Ein Orca-Auftrag läuft.');
      installation = new AbortController();
      installProgress = 'Release wird geprüft …';
      try {
        const signal = installation.signal;
        lastRelease = await portable.latest(signal);
        const current = portableVersion();
        if (portable.isNewer(lastRelease.version, current)) {
          await portable.install(portableRoot,lastRelease,signal, value => { installProgress = value; });
        }
        await installChat(path.join(portableRoot,'data_dir'), 'portable');
        signal.throwIfAborted();
        if (portable.isNewer(lastRelease.version, current)) writeAtomic(manifest, JSON.stringify({version:lastRelease.version}));
        changeMode({mode:'portable'});
      } finally { installation = null; installProgress = ''; }
      return setup();
    }
    if (keysOnly(args, ['action']) && args.action === 'installChat') {
      installed();
      return installChat(profileDirectory(), mode());
    }
    async function installChat(directory, selectedMode) {
      const base = path.join(directory, 'orca_plugins');
      const folder = path.join(base, 'formnaro_chat');
      await files.mkdir(folder, { recursive: true });
      if ((await files.lstat(base)).isSymbolicLink() || (await files.lstat(folder)).isSymbolicLink())
        throw failure('ORCA_PLUGIN', 'Der Orca-Pluginordner ist eine Verknüpfung.');
      const source = await files.readFile(path.join(__dirname, '../ai/orca-formnaro-chat.py'), 'utf8');
      const plugin = Buffer.from(selectedMode === 'portable' ? source.replace('INSTANCE = "system"', 'INSTANCE = "portable"') : source);
      const target = path.join(folder, 'orca-formnaro-chat.py');
      try { await files.writeFile(target, plugin, { flag: 'wx' }); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (!(await files.lstat(target)).isFile()) throw Error('Ungültige Plugin-Datei.');
        const existing = await files.readFile(target);
        const normalized = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
        if (normalized(existing) === normalized(plugin)) return true;
        const previous = selectedMode === 'portable'
          ? ['317504c62a05c5230a2b0098a07ef403bc99c2c121c689281a8c378bc4f7a34e']
          : ['2539024188a29bfcf16bcae86b683b60b535d6fa15df2e27b56283edafe29404',
             'e2a47af9efdde0153f5634d7550403fa4cf544a29bf5b7f1e40e3ee0b06ef478'];
        const digest = require('node:crypto').createHash('sha256').update(normalized(existing)).digest('hex');
        if (!previous.includes(digest))
          throw failure('ORCA_PLUGIN', 'Im Orca-Pluginordner liegt eine andere Version. Bitte über Orcas Pluginverwaltung aktualisieren.');
        await require('./files.cjs').writeAtomic(target, plugin, {
          shouldCommit: async () => (await files.lstat(target)).isFile() && (await files.readFile(target)).equals(existing),
        });
      }
      return true;
    }
    if (keysOnly(args, ['action']) && args.action === 'chooseExecutable' && process.platform === 'win32') {
      if (active || installation) throw failure('ORCA_BUSY', 'Ein Orca-Auftrag läuft bereits.');
      const result = await dialog.showOpenDialog(window, { title: 'orca-slicer.exe auswählen',
        properties: ['openFile'], filters: [{ name: 'OrcaSlicer', extensions: ['exe'] }] });
      if (!result.canceled) {
        const file = result.filePaths[0];
        if (!statFile(file) || path.basename(file).toLowerCase() !== 'orca-slicer.exe')
          throw failure('ORCA_INPUT', 'Bitte die Datei orca-slicer.exe auswählen.');
        if (active || installation) throw Error('Ein Orca-Auftrag läuft.');
        const version = portableVersion();
        const location = path.relative(portableRoot, file).split(path.sep);
        if (location.length === 2 && portable.versionPattern.test(location[0])) {
          if (location[0].toLowerCase() !== version?.toLowerCase())
            throw Error('Bitte die aktuelle portable Orca-Installation auswählen.');
          changeMode({ mode: 'portable' });
        } else changeMode({ executable: file, mode: 'system' });
      }
      return setup();
    }
    if (keysOnly(args, ['action', 'profiles']) && args.action === 'configure') {
      if (active || installation) throw Error('Ein Orca-Auftrag läuft.');
      const key = profileKey();
      const selected = selection(await catalog(), args.profiles);
      if (key !== profileKey()) throw Error('Orca-Instanz wurde gewechselt.');
      remember(selected);
      return setup();
    }
    if (keysOnly(args, fields) && args.action === 'openModel') return prepare(args, 'openModel', () => args.model);
    if (keysOnly(args, [...fields, 'profiles', ...Object.keys(printOptions)]) && args.action === 'slice')
      return prepare(args, 'slice', () => args.model);
    if (keysOnly(args, ['action']) && args.action === 'cancel') {
      installation?.abort();
      active?.abort(failure('ORCA_CANCELLED', 'Slicing abgebrochen.'));
      return !!active || !!installation;
    }
    if (keysOnly(args, ['action', 'id']) && ['openResult', 'saveResult'].includes(args.action)) {
      const result = recent.get(args.id);
      if (!result?.receipt) throw failure('ORCA_OUTPUT', 'Dieses Orca-Projekt ist nicht mehr verfügbar.');
      if (args.action === 'openResult') {
        await open(result.exe, result.file, result.profileDir);
      } else {
        const target = await dialog.showSaveDialog(window, {
          title: 'Orca-Druckprojekt speichern', defaultPath: 'Formnaro-Druckprojekt.3mf',
          filters: [{ name: 'OrcaSlicer-Projekt', extensions: ['3mf'] }],
        });
        if (target.canceled) return false;
        await files.copyFile(result.file, target.filePath);
      }
      return true;
    }
    throw failure('ORCA_INPUT', 'Unbekannte Orca-Aktion.');
  }

  function dispose() {
    closed = true;
    installation?.abort();
    if (active) return active.abort(failure('ORCA_CANCELLED', 'Formnaro wurde geschlossen.'));
    if (root && path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('formnaro-orca-')) {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* A file may be open in OrcaSlicer. */ }
    }
    root = undefined;
    recent.clear();
  }

  function panelContact(instance) {
    if (installation) throw Error('Die portable Orca-Installation wird eingerichtet.');
    if (instance !== mode()) throw Error('In Formnaro unter 3D-Druck die passende Orca-Instanz auswählen.');
    contacts.set(instance,Date.now());
  }
  return { panelContact, available: () => !!executable(), desktopRequest, agentRequest, dispose };
}

function installOrcaSlicer(window, { ipcMain, dialog, dataDirectory, profileDirectory, writeAtomic }) {
  const service = createOrcaSlicer({ window, dialog, dataDirectory, bridgeDirectory: profileDirectory, writeAtomic });
  const unregister = require('./api-bridge.cjs').registerOrcaSlicer(profileDirectory, service, sliceSchema);
  ipcMain.handle('cad-orca:request', async (event, args) => {
    if (window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      return { ok: false, error: 'Ungültiges Formnaro-Fenster.' };
    try { return { ok: true, value: await service.desktopRequest(args) }; }
    catch (error) { return { ok: false, error: error.message, code: error.code }; }
  });
  window.once('closed', () => {
    ipcMain.removeHandler('cad-orca:request');
    unregister();
    service.dispose();
  });
}

module.exports = { createOrcaSlicer, installOrcaSlicer, sliceSchema, readSliceStatistics };

