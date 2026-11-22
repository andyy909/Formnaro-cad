const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const categories = ['machine', 'process', 'filament'];
const first = value => Array.isArray(value) ? value[0] : value;

async function list(directory) {
  try { return await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function json(file) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.size > 2 * 1024 * 1024) return null;
  const text = await fs.readFile(file, 'utf8');
  // OrcaSlicer adds an optional generated-file comment after its own JSON.
  return JSON.parse(text.replace(/^\uFEFF/, '').replace(/\r?\n#[\s\S]*$/, ''));
}

async function profiles(executable, userDirectory, saved = {}) {
  const config = await json(path.join(userDirectory, 'OrcaSlicer.conf')).catch(() => null);
  const installed = path.join(path.dirname(executable), 'resources', 'profiles');
  const system = path.join(userDirectory, 'system');
  const user = path.join(userDirectory, 'user');
  const records = new Map();
  const manufacturers = new Map();
  const caches = new Map();

  async function readCategory(directory, group, category, source, relative = '') {
    const entries = await list(path.join(directory, relative));
    await Promise.all(entries.map(async entry => {
      const filename = path.join(relative, entry.name);
      if (entry.isDirectory() && !relative)
        return readCategory(directory, group, category, source, filename);
      if (!entry.isFile() || !filename.endsWith('.json')) return;
      const value = await json(path.join(directory, filename)).catch(() => null);
      if (!value) return;
      const id = createHash('sha256').update([source, group, category, filename].join('/')).digest('hex').slice(0, 20);
      records.set(id, { id, name: value.name, category, value, group, source, filename });
    }));
  }

  async function readGroup(directory, group, source) {
    for (const category of categories) {
      const categoryDirectory = path.join(directory, category);
      if ((await fs.lstat(categoryDirectory).catch(() => null))?.isDirectory())
        await readCategory(categoryDirectory, group, category, source);
    }
  }

  for (const root of [installed, system]) {
    const entries = await list(root);
    for (const item of entries) {
      if (item.isFile() && item.name.endsWith('.opc')) caches.set(item.name, path.join(root, item.name));
    }
    await Promise.all(entries.filter(item => item.isDirectory()).map(item => readGroup(path.join(root, item.name), item.name, 'system')));
    await Promise.all(entries.filter(item => item.isFile() && item.name.endsWith('.json')).map(async item => {
      const value = await json(path.join(root, item.name)).catch(() => null);
      if (value) manufacturers.set(item.name, value);
    }));
  }

  const account = config?.app?.user_id;
  const accountFolders = typeof account === 'string' && /^[\w-]{1,100}$/.test(account)
    ? ['default', account] : ['default'];
  for (const folder of new Set(accountFolders)) {
    const directory = path.join(user, folder);
    if ((await fs.lstat(directory).catch(() => null))?.isDirectory()) await readGroup(directory, folder, 'user');
  }

  // Orca 2.5 stores bundled presets in binary vendor caches. Let Orca resolve
  // those by name from its own cache, including any inherited settings.
  const configured = Array.isArray(config?.orca_presets) ? config.orca_presets : [config?.orca_presets ?? config?.presets];
  const known = new Set([...records.values()].map(r => r.category + '/' + r.name));
  const wanted = new Map();
  for (const row of configured) for (const category of categories) {
    const name = first(row?.[category]);
    if (typeof name === 'string' && name.trim() && name.length <= 250 && !known.has(category + '/' + name))
      wanted.set(category + '/' + name, { name, category });
  }
  // Vendor cache entries begin with two length-prefixed UTF-8 strings (name,
  // vendor-relative source path). Orca resolves inherited CLI presets by file identity.
  for (const [cache, file] of caches) {
    if (!wanted.size) break;
    const group = path.basename(cache, '.opc');
    if (manufacturers.has(group + '.json')) continue;
    const bytes = await fs.readFile(file);
    for (const [key, { name, category }] of wanted) {
      const query = Buffer.from(name);
      for (let start = bytes.indexOf(query); start >= 0; start = bytes.indexOf(query, start + 1)) {
        const next = start + query.length;
        if (start < 8 || next + 8 > bytes.length || bytes.readBigUInt64LE(start - 8) !== BigInt(query.length)) continue;
        const size = Number(bytes.readBigUInt64LE(next));
        if (size < 1 || size > 1024 || next + 8 + size > bytes.length) continue;
        const relative = bytes.toString('utf8', next + 8, next + 8 + size);
        const parts = relative.split('/');
        if (parts.shift() !== category || !relative.endsWith('.json') ||
            parts.some(part => !part || part === '.' || part === '..' || /[\\:<>|"*?\x00-\x1f]/.test(part))) continue;
        const id = createHash('sha256').update('cache/' + group + '/' + key).digest('hex').slice(0, 20);
        const value = { name, type: category, from: 'User', inherits: name, instantiation: 'true' };
        if (category !== 'machine') value.compatible_printers = configured.filter(row =>
          first(row?.[category]) === name && typeof row?.machine === 'string').map(row => row.machine);
        records.set(id, { id, name, value, category, source: 'cache', group, filename: path.join(...parts) });
        wanted.delete(key);
        break;
      }
    }
  }
  const all = [...records.values()];
  const choices = Object.fromEntries(categories.map(category => [category, all.filter(record =>
    record.category === category && typeof record.name === 'string' && record.name.trim() &&
    record.value.type === category && !path.dirname(record.filename).split(path.sep).includes('base') && (record.source === 'user' || record.value.instantiation === 'true' || record.value.instantiation === true))
    .sort((a, b) => Number(b.source === 'user') - Number(a.source === 'user') || a.name.localeCompare(b.name))]));
  const named = (category, name) => choices[category].find(record => record.name === name);
  const machine = choices.machine.find(record => record.id === saved.machine) ?? named('machine', config?.presets?.machine);
  const orcaDefaults = configured.find(row => row?.machine === machine?.name);
  const configuredMachine = machine?.name === (orcaDefaults?.machine || config?.presets?.machine);
  const process = named('process', configuredMachine ? orcaDefaults?.process : undefined) ??
    named('process', machine?.value.default_print_profile);
  const filament = named('filament', configuredMachine ? first(orcaDefaults?.filament) : undefined) ??
    named('filament', first(machine?.value.default_filament_profile));
  const defaults = { machine: machine?.id ?? '', process: process?.id ?? '', filament: filament?.id ?? '' };
  for (const category of ['process', 'filament']) {
    if (choices[category].some(record => record.id === saved[category])) defaults[category] = saved[category];
  }
  return { all, records, choices, defaults, manufacturers, caches };
}

function publicProfiles(snapshot) {
  return Object.fromEntries(categories.map(category => [category, snapshot.choices[category].map(
    ({ id, name, source, value }) => ({
      id, name, custom: source === 'user',
      ...(category === 'machine' ? {
        defaultProcess: first(value.default_print_profile), defaultFilament: first(value.default_filament_profile), parent: value.inherits,
      } : {
        machines: Array.isArray(value.compatible_printers) ? value.compatible_printers : [],
      }),
    }),
  )]));
}

function migrateKobraBed(record, profile) {
  const edge = profile.bed_exclude_area;
  if (record.source !== 'system' || record.group !== 'Anycubic' ||
      !/^Anycubic Kobra 3 0[.]\d+ nozzle$/.test(record.name) ||
      !Array.isArray(edge) || edge.length !== 16 || profile.bed_exclude_volumes ||
      (Array.isArray(profile.extruder_bed_exclude_volumes) && profile.extruder_bed_exclude_volumes.some(Boolean)) ||
      !edge.every(point => typeof point === 'string' && /^\d+(?:[.]\d+)?x\d+(?:[.]\d+)?$/.test(point))) return false;
  const strips = [0, 4, 8, 12].map(start => edge.slice(start, start + 4));
  const rectangles = strips.every(strip => {
    const coordinates = strip.map(point => point.split('x').map(Number));
    return new Set(coordinates.map(([x]) => x)).size === 2 &&
      new Set(coordinates.map(([, y]) => y)).size === 2 &&
      new Set(coordinates.map(point => point.join(','))).size === 4;
  });
  if (!rectangles) return false;
  // Orca 2.5.1 reads the legacy value as one polygon. Keep every rectangle
  // as a separate full-height collision volume in the isolated profile.
  profile.bed_exclude_volumes = strips.map(strip => strip.join(',')).join('|');
  profile.bed_exclude_area = [];
  return true;
}

async function stageProfiles(snapshot, selection, directory) {
  const system = path.join(directory, 'system');
  const user = path.join(directory, 'user', 'default');
  await fs.mkdir(system, { recursive: true });
  await Promise.all([...snapshot.manufacturers].map(([name, value]) => fs.writeFile(path.join(system, name), JSON.stringify(value))));
  for (const [name, file] of snapshot.caches) {
    if (!snapshot.manufacturers.has(name.slice(0,-4)+'.json')) await fs.copyFile(file,path.join(system,name));
  }
  const files = new Map();
  let migratedKobraBed = false;
  const selected = new Set(Object.values(selection));
  const profiles = [...snapshot.all].sort((a, b) => Number(selected.has(a.id)) - Number(selected.has(b.id)));
  for (const record of profiles) {
    const folder = record.source !== 'user'
      ? path.join(system, record.group, record.category) : path.join(user, record.category);
    const file = path.join(folder, record.filename);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Local post-processing scripts are deliberately excluded from print preparation.
    const value = Object.fromEntries(Object.entries(record.value).filter(([key]) =>
      key !== 'post_process' && !/^print_?host(?:_|$)/i.test(key)));
    if (record.id === selection.machine) migratedKobraBed = migrateKobraBed(record, value);
    await fs.writeFile(file, JSON.stringify(value));
    files.set(record.id, file);
  }
  return { paths: categories.map(category => files.get(selection[category])), migratedKobraBed };
}

module.exports = { categories, profiles, publicProfiles, stageProfiles };
