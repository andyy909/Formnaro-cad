const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const HOST = '127.0.0.1';
const PORT = '8765';
const URL = `http://${HOST}:${PORT}`;
const STARTUP_TIMEOUT_MS = 90000;

async function probeCutout() {
  try {
    const response = await fetch(`${URL}/openapi.json`, { redirect: 'error', signal: AbortSignal.timeout(1000) });
    if (response.ok) {
      const api = await response.json();
      if (api.info?.title === 'Formnaro Cutout' && api.paths?.['/api/system']?.get) return 'ready';
    }
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return 'absent';
  }
  return 'occupied';
}

async function cutoutPython(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) return null;
  const executable = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
  const python = path.join(directory, '.venv', ...executable);
  try {
    for (const file of [python, path.join(directory, 'backend/app/main.py'), path.join(directory, 'frontend/index.html')])
      if (!(await fs.stat(file)).isFile()) return null;
    return python;
  } catch {
    return null;
  }
}

function installPhotoCutout(win, { directory, ipcMain, dialog, shell, probe = probeCutout, launch = spawn }) {
  const settings = path.join(directory, 'photo-cutout.json');
  let pending;

  async function open() {
    const service = await probe();
    if (service === 'occupied') throw Error(`Port ${PORT} antwortet nicht als Formnaro Cutout.`);
    if (service === 'absent') {
      let installation;
      try {
        installation = JSON.parse(await fs.readFile(settings, 'utf8')).installation;
      } catch {
        // The companion is optional and has no settings until first use.
      }
      let python = await cutoutPython(installation);
      const select = !python;
      if (select) {
        const choice = await dialog.showOpenDialog(win, {
          title: 'Ordner der eingerichteten Formnaro-Cutout-Installation auswählen',
          buttonLabel: 'Cutout-Ordner wählen',
          properties: ['openDirectory'],
        });
        if (choice.canceled) return { opened: false };
        [installation] = choice.filePaths;
        python = await cutoutPython(installation);
        if (!python) throw Error('In diesem Ordner fehlt eine eingerichtete Formnaro-Cutout-Installation mit Python-Umgebung.');
      }

      const child = launch(python, ['-E', '-s', '-m', 'uvicorn', 'backend.app.main:app', '--host', HOST, '--port', PORT], {
        cwd: installation,
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      });
      let stopped = false;
      child.once('error', () => { stopped = true; });
      child.once('exit', () => { stopped = true; });
      child.unref();
      try {
        const deadline = Date.now() + STARTUP_TIMEOUT_MS;
        while (true) {
          const state = await probe();
          if (state === 'ready') break;
          if (state === 'occupied' || stopped || Date.now() >= deadline)
            throw Error('Formnaro Cutout ist nicht gestartet. Prüfe die lokale Installation und Port 8765.');
          await delay(250);
        }
      } catch (error) {
        if (!stopped) child.kill();
        throw error;
      }
      if (select) {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(settings, JSON.stringify({ installation }), 'utf8');
      }
    }
    if (win.isDestroyed()) return { opened: false };
    await shell.openExternal(URL);
    return { opened: true };
  }

  ipcMain.handle('cad-photo:open-cutout', async (event, payload) => {
    if (win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || payload !== undefined)
      return { ok: false, error: 'Ungültige Cutout-Anfrage.' };
    pending ??= open().then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error: error.message }),
    ).finally(() => { pending = undefined; });
    return pending;
  });
}

module.exports = { installPhotoCutout };
