const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installPhotoCutout } = require('../backend/photo-cutout.cjs');

async function fixture(t, states, choice) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formnaro-cutout-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const directory = path.join(dir, 'settings');
  const calls = { choose: 0, launch: [], open: [] };
  const win = { webContents: { mainFrame: {} }, isDestroyed: () => false };
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  let request;
  installPhotoCutout(win, {
    directory,
    ipcMain: { handle(channel, handler) { assert.equal(channel, 'cad-photo:open-cutout'); request = handler; } },
    dialog: { async showOpenDialog() { calls.choose++; return choice?.(dir) ?? { canceled: true }; } },
    shell: { async openExternal(url) { calls.open.push(url); } },
    async probe() { assert.ok(states.length, 'unexpected probe'); return states.shift(); },
    launch(file, args, options) {
      calls.launch.push({ file, args, options });
      return Object.assign(new EventEmitter(), { unref() {}, kill() {} });
    },
  });
  return { dir, directory, calls, request: (...args) => request(...args), event };
}

test('an existing local Cutout opens once for concurrent clicks and cannot be redirected by the renderer', async (t) => {
  const { request, event, calls } = await fixture(t, ['ready']);
  assert.equal((await request({ ...event, senderFrame: {} })).ok, false);
  assert.equal((await request(event, 'https://example.invalid')).ok, false);
  const replies = await Promise.all([request(event), request(event)]);
  assert.deepEqual(replies, [{ ok: true, value: { opened: true } }, { ok: true, value: { opened: true } }]);
  assert.deepEqual(calls, { choose: 0, launch: [], open: ['http://127.0.0.1:8765'] });
});

test('a chosen Cutout installation starts on loopback and is remembered after readiness', async (t) => {
  const { dir, directory, request, event, calls } = await fixture(t, ['absent', 'ready', 'absent', 'ready'],
    root => ({ canceled: false, filePaths: [root] }));
  const python = path.join(dir, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
  for (const file of [python, path.join(dir, 'backend/app/main.py'), path.join(dir, 'frontend/index.html')]) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'fixture');
  }
  assert.deepEqual(await request(event), { ok: true, value: { opened: true } });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'photo-cutout.json'), 'utf8')), { installation: dir });
  assert.deepEqual(await request(event), { ok: true, value: { opened: true } });
  assert.equal(calls.choose, 1);
  assert.equal(calls.launch.length, 2);
  assert.deepEqual(calls.launch[0], {
    file: python,
    args: ['-E', '-s', '-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8765'],
    options: { cwd: dir, detached: true, windowsHide: true, stdio: 'ignore' },
  });
});

test('cancel, invalid installation and port conflict leave CAD usable without opening Cutout', async (t) => {
  const cases = [
    { state: 'absent', reply: { ok: true, value: { opened: false } }, chooses: 1 },
    { state: 'absent', choice: dir => ({ canceled: false, filePaths: [dir] }), error: /Python-Umgebung/, chooses: 1 },
    { state: 'occupied', error: /Port 8765/, chooses: 0 },
  ];
  for (const row of cases) {
    const { request, event, calls } = await fixture(t, [row.state], row.choice);
    const result = await request(event);
    if (row.reply) assert.deepEqual(result, row.reply);
    else { assert.equal(result.ok, false); assert.match(result.error, row.error); }
    assert.deepEqual(calls, { choose: row.chooses, launch: [], open: [] });
  }
});
