const fs = require('node:fs');
const path = require('node:path');
const { writeTaskAtomicSync } = require('./ai-task-atomic.cjs');

const isTempo = (percent) => Number.isInteger(percent) && percent >= 10 && percent <= 300;

function installPracticeTempo(win, { directory, ipcMain }) {
  const file = path.join(directory, 'Uebungstempo.json');
  function read() {
    try {
      if (fs.statSync(file).size > 16) return 50;
      const percent = JSON.parse(fs.readFileSync(file, 'utf8'));
      return isTempo(percent) ? percent : 50;
    } catch {
      return 50;
    }
  }

  ipcMain.handle('cad-practice:tempo', (event, percent) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || win.isDestroyed()) {
      return { ok: false, error: 'Ungültiges Übungsfenster.' };
    }
    if (percent === undefined) return { ok: true, value: read() };
    if (!isTempo(percent)) return { ok: false, error: 'Ungültiges Übungstempo.' };

    try {
      fs.mkdirSync(directory, { recursive: true });
      writeTaskAtomicSync(file, JSON.stringify(percent));
      return { ok: true, value: percent };
    } catch {
      return { ok: false, error: 'Das Übungstempo konnte nicht gespeichert werden.' };
    }
  });
}

module.exports = { installPracticeTempo };
