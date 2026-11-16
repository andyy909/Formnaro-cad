import { createProgramStorageAsync } from '../program-storage.js';

const startupLabels = {
  'load-data': ['Lokale Daten werden geladen …', 'Loading local data …'],
  'mount-ui': ['Arbeitsfläche wird vorbereitet …', 'Preparing the workspace …'],
  'read-recovery': ['Autosicherung wird gelesen …', 'Reading autosave …'],
  'validate-project': ['Projekt wird geprüft …', 'Validating project …'],
  'build-view': ['Geometrie und Anzeige werden aufgebaut …', 'Preparing geometry and display …'],
  'restore-workspace': ['Arbeitsbereich wird wiederhergestellt …', 'Restoring workspace …'],
};

export function createStartup({ document, window, performance }) {
  const startupPhases = [];
  let startupPhase = null;

  function setStartupPhase(name, message) {
    const now = performance.now();
    if (startupPhase) {
      startupPhases.push({ ...startupPhase, finishedMs: now, durationMs: now - startupPhase.startedMs });
    }
    startupPhase = name === 'ready' ? null : { name, startedMs: now };
    const status = document.getElementById('startup-phase');
    status.dataset.phase = name;
    status.hidden = name === 'ready';
    status.textContent = message ?? startupLabels[name]?.[document.documentElement.lang === 'en' ? 1 : 0] ?? '';
  }

  async function openStorage() {
    setStartupPhase('load-data');
    let storage;
    try {
      storage = await createProgramStorageAsync(window.localStorage, window.offlinecadDesktop, { cadOnly: true });
    } catch (error) {
      window.__cadError = error.message;
      setStartupPhase('failed', 'Start fehlgeschlagen: ' + error.message);
      document.getElementById('status').textContent = 'Start fehlgeschlagen: ' + error.message;
      throw error;
    }
    setStartupPhase('mount-ui');
    return storage;
  }

  return { setStartupPhase, openStorage, startupPhases: () => startupPhases.map((phase) => ({ ...phase })) };
}
