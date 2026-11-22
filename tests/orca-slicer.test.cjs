const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { profiles, stageProfiles } = require('../backend/orca-profiles.cjs');
const { createOrcaSlicer, readSliceStatistics, sliceSchema } = require('../backend/orca-slicer.cjs');
const { startBridge, registerOrcaSlicer } = require('../backend/api-bridge.cjs');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'formnaro-orca-test-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), parent);
    fs.rmSync(root, { recursive: true, force: true });
  });
  function write(relative, value) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
  }
  return { root, write };
}

test('Discovers Orca defaults and stages inherited preset files without credentials or scripts', async t => {
  const { root, write } = fixture(t);
  const exe = write('Orca/Orca-slicer.exe', '');
  const userDirectory = path.join(root, 'Orca-Config');
  write('Orca-Config/OrcaSlicer.conf', JSON.stringify({ presets: { machine: 'Machine' } }) + '\n# generated');
  write('Orca-Config/system/Vendor.json', { name: 'Vendor' });
  write('Orca-Config/system/Vendor/machine/Machine.json', {
    name: 'Machine', type: 'machine', instantiation: 'true', default_print_profile: 'Process',
    default_filament_profile: ['PLA'], print_host: 'fixture', printhost_apikey: 'fixture',
  });
  write('Orca-Config/system/Vendor/process/Process.json', {
    name: 'Process', type: 'process', instantiation: 'true', inherits: 'Parent',
  });
  const parent = write('Orca-Config/system/Vendor/process/base/Parent.json', {
    name: 'Parent', type: 'process', instantiation: 'false', post_process: ['fixture'],
  });
  write('Orca-Config/system/Vendor/filament/PLA.json', { name: 'PLA', type: 'filament', instantiation: 'true' });
  const catalog = await profiles(exe, userDirectory);
  assert.deepEqual(Object.values(catalog.defaults).map(id => catalog.records.get(id)?.name), ['Machine', 'Process', 'PLA']);
  assert.deepEqual(catalog.choices.process.map(p => p.name), ['Process']);
  const staged = path.join(root, 'stage');
  const { paths: [machine, process] } = await stageProfiles(catalog, catalog.defaults, staged);
  assert.equal(JSON.parse(fs.readFileSync(process)).inherits, 'Parent');
  assert.equal(JSON.parse(fs.readFileSync(machine)).printhost_apikey, undefined);
  assert.equal(JSON.parse(fs.readFileSync(machine)).print_host, undefined);
  assert.equal(JSON.parse(fs.readFileSync(path.join(staged, 'system/Vendor/process/base/Parent.json'))).post_process, undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(parent)).post_process, ['fixture']);
});

test('Kobra 3 preserves four full-height exclusion strips in the isolated Orca profile', async t => {
  const { root, write } = fixture(t);
  const machineName = 'Anycubic Kobra 3 0.6 nozzle';
  const edges = [
    '0x0', '2.5x0', '2.5x255', '0x255', '0x255', '255x255', '255x252.5', '0x252.5',
    '255x255', '252.5x255', '252.5x0', '255x0', '0x0', '0x2.5', '255x2.5', '255x0',
  ];
  const executable = write('Orca/orca-slicer.exe', '');
  const source = write('Orca-Config/system/Anycubic/machine/Kobra.json', {
    type: 'machine', name: machineName, instantiation: 'true', bed_exclude_area: edges,
  });
  write('Orca-Config/OrcaSlicer.conf', JSON.stringify({ presets: { machine: machineName } }));
  const catalog = await profiles(executable, path.join(root, 'Orca-Config'));
  const staged = await stageProfiles(catalog, catalog.defaults, path.join(root, 'stage'));
  assert.equal(staged.migratedKobraBed, true);
  const converted = JSON.parse(fs.readFileSync(staged.paths[0]));
  assert.deepEqual(converted.bed_exclude_area, []);
  const areas = converted.bed_exclude_volumes.split('|').map(region => region.split(','));
  assert.equal(areas.length, 4);
  assert.deepEqual(areas.flat(), edges);
  assert.deepEqual(JSON.parse(fs.readFileSync(source)).bed_exclude_area, edges);
});

test('Reads only real per-plate Orca statistics and rejects an empty or incomplete result', () => {
  const plate = n => strToU8(JSON.stringify({ generator: 'OrcaSlicer 2.5.1',
    summary: { time: 83, weight: 2, layer_count: n, filaments: [{ support: { weight: 0.2 } }] } }));
  const complete = zipSync({ 'Metadata/plate_2.statistics.json': plate(17), 'Metadata/plate_1.statistics.json': plate(20),
    'Metadata/project_settings.config': strToU8('ignored') });
  assert.deepEqual(readSliceStatistics(complete).map(p => [p.plate, p.layers, p.supportGrams]), [[1, 20, 0.2], [2, 17, 0.2]]);
  assert.throws(() => readSliceStatistics(zipSync({ model: strToU8('not sliced') })), { code: 'ORCA_STATISTICS' });
  assert.throws(() => readSliceStatistics(zipSync({ 'Metadata/plate_1.statistics.json': plate(0) })), { code: 'ORCA_STATISTICS' });
});

test('The authenticated Formnaro API advertises Orca on the registered profile and routes requests locally', async t => {
  const { root } = fixture(t);
  const seen = [];
  const service = { available: () => true, agentRequest: async (args, { rpc }) => {
    seen.push(args);
    return rpc('export', { format: '3mf', revision: args.revision });
  } };
  const unregister = registerOrcaSlicer(root, service, sliceSchema);
  const bridge = await startBridge({ directory: root, rpc: async (method, args) =>
    method === 'context' ? { requestSchema: {} } : { receipt: args } });
  t.after(async () => { unregister(); await bridge.close(); });
  const call = (route, body, authorized = true) => fetch(bridge.descriptor.url + '/v1/' + route, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer ' + bridge.descriptor.token } : {}) },
    body: body && JSON.stringify(body),
  });
  assert.deepEqual((await (await call('context')).json()).orcaSlicerSchema, sliceSchema);
  const args = { action: 'slice', revision: '1234567890abcdef' };
  assert.equal((await call('orca', args, false)).status, 401);
  assert.deepEqual(await (await call('orca', args)).json(), { receipt: { format: '3mf', revision: args.revision } });
  assert.deepEqual(seen, [args]);
  unregister();
  assert.equal((await call('orca', args)).status, 404);
  assert.equal((await (await call('context')).json()).orcaSlicerSchema, undefined);
});

test('Orca MCP rejects arbitrary host actions and malformed print settings before model export', async () => {
  const service = createOrcaSlicer({ dataDirectory: path.join(os.tmpdir(), 'formnaro-orca-test-absent') });
  await assert.rejects(service.agentRequest({ action: 'openModel', path: 'unsafe' }), { code: 'ORCA_INPUT' });
  await assert.rejects(service.agentRequest({ action: 'slice', revision: 'stale', ids: [] }), { code: 'ORCA_INPUT' });
  await assert.rejects(service.agentRequest({ action: 'slice', revision: '1234567890abcdef', executable: 'unsafe' }), { code: 'ORCA_INPUT' });
});

test('Shared chat authenticates and can use another bridge operation while starting the agent', async t => {
  const { root } = fixture(t);
  let bridge;
  bridge = await startBridge({ directory: root, rpc: async (method, args) => {
    if (method === 'scene') return { revision: 'fedcba9876543210' };
    assert.equal(method, 'agent_chat');
    assert.deepEqual(args, { action: 'state' });
    const response = await fetch(bridge.descriptor.url + '/v1/scene', {
      headers: { Authorization: 'Bearer ' + bridge.descriptor.token },
      signal: AbortSignal.timeout(2500),
    });
    assert.equal(response.status, 200);
    return { scene: await response.json() };
  } });
  t.after(() => bridge.close());
  const submit = headers => fetch(bridge.descriptor.url + '/v1/agent-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'state' }),
    signal: AbortSignal.timeout(4000),
  });
  assert.equal((await submit({})).status, 401);
  const authorized = { Authorization: 'Bearer ' + bridge.descriptor.token };
  assert.equal((await submit({ ...authorized, Origin: 'http://localhost' })).status, 403);
  const accepted = await submit(authorized);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { scene: { revision: 'fedcba9876543210' } });
});

test('Each instance restores its own profile selection after a restart', { skip: process.platform !== 'win32' }, async t => {
  const { root, write } = fixture(t);
  const system = write('system/orca-slicer.exe', '');
  write('app/orca-slicer.json', { executable: system });
  write('portable/v2.5.1/orca-slicer.exe', '');
  write('portable/version.json', { version: 'v2.5.1' });
  for (const [folder, name] of [['system/data_dir', 'System'], ['portable/data_dir', 'Portable']]) {
    write(folder + '/OrcaSlicer.conf', { presets: { machine: name },
      orca_presets: [{ machine: name, process: 'Process', filament: 'PLA' }] });
    for (const [category, preset] of [['machine', name], ['process', 'Process'], ['filament', 'PLA']])
      write(folder + '/user/default/' + category + '/preset.json', { name: preset, type: category });
  }
  const options = { dataDirectory: path.join(root, 'app'), portableRoot: path.join(root, 'portable'), writeAtomic: fs.writeFileSync };
  const service = createOrcaSlicer(options);
  for (const [mode, name] of [['system', 'System'], ['portable', 'Portable']]) {
    const state = await service.desktopRequest({ action: 'selectInstance', mode });
    assert.equal(state.choices.machine.find(p => p.id === state.defaults.machine).name, name);
    assert.equal(state.profileDir, path.join(root, mode, 'data_dir'));
    await service.desktopRequest({ action: 'configure', profiles: state.defaults });
    assert.throws(() => service.panelContact(mode === 'system' ? 'portable' : 'system'));
    service.panelContact(mode);
  }
  service.dispose();
  const next = createOrcaSlicer({ ...options, dialog: { showOpenDialog: async () => ({
    filePaths: [path.join(root, 'portable/v2.5.1/orca-slicer.exe')], canceled: false }) } });
  assert.equal((await next.agentRequest({ action: 'status' })).profiles.machine, 'Portable');
  await next.desktopRequest({ action: 'selectInstance', mode: 'system' });
  assert.equal((await next.agentRequest({ action: 'status' })).profiles.machine, 'System');
  const picked = await next.desktopRequest({ action: 'chooseExecutable' });
  assert.equal(picked.mode, 'portable');
  assert.equal(picked.profileDir, path.join(root, 'portable/data_dir'));
  next.dispose();
});

test('Failed portable update leaves the previous binary, profile and version available', async t => {
  const { root, write } = fixture(t);
  const { install, isNewer } = require('../backend/orca-portable.cjs');
  write('v2.5.1/orca-slicer.exe', 'prior executable');
  const config = write('data_dir/OrcaSlicer.conf', 'profile');
  const pointer = write('version.json', { version: 'v2.5.1' });
  t.mock.method(global, 'fetch', async () => new Response('bad'));
  await assert.rejects(install(root, { version: 'v2.5.2', url: 'https://example.invalid/', size: 3,
    digest: '0'.repeat(64) }, new AbortController().signal, () => {}), /Download/);
  assert.equal(fs.readFileSync(config, 'utf8'), 'profile');
  assert.equal(JSON.parse(fs.readFileSync(pointer)).version, 'v2.5.1');
  assert.deepEqual(fs.readdirSync(root).sort(), ['data_dir', 'v2.5.1', 'version.json']);
  assert.equal(isNewer('v2.9.10', 'v2.10.0'), false);
  assert.equal(isNewer('v2.10.0', 'v2.9.10'), true);
});

test('A verified portable update retains user data across versions', { skip: process.platform !== 'win32' }, async t => {
  const { root, write } = fixture(t);
  const { install } = require('../backend/orca-portable.cjs');
  const config = write('data_dir/OrcaSlicer.conf', 'user settings');
  write('v2.5.1/orca-slicer.exe', 'previous');
  const zip = zipSync({ 'orca/orca-slicer.exe': strToU8('new'), 'orca/OrcaSlicer.dll': strToU8('dll'),
    'orca/resources/profiles/vendor.opc': strToU8('vendor') });
  const release = { version: 'v2.5.2', url: 'https://example.invalid/', size: zip.length,
    digest: require('node:crypto').createHash('sha256').update(zip).digest('hex') };
  t.mock.method(global, 'fetch', async () => new Response(zip));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(install(root, release, controller.signal, () => {}), { name: 'AbortError' });
  assert.equal(fs.existsSync(path.join(root, release.version)), false);
  const directory = await install(root, release, new AbortController().signal, () => {});
  assert.equal(fs.readFileSync(path.join(directory, 'orca-slicer.exe'), 'utf8'), 'new');
  assert.equal(fs.readFileSync(path.join(root, 'v2.5.1/orca-slicer.exe'), 'utf8'), 'previous');
  assert.equal(fs.readFileSync(config, 'utf8'), 'user settings');
});
