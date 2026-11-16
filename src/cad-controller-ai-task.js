// The controller's AI task state: exactly one workspace, converter lock map,
// bound revision and running-analysis owner set per controller instance.
import { createAIWorkspace } from './cad-ai-workspace.js';
import { aiFeedback } from './ai-feedback.js';
import { taskConversionKey, validateAITaskRuntime } from './cad-ai-task-runtime.js';
import { cadProjectRevision } from './cad-project.js';
import { runCadAIScript } from './cad-ai-sandbox.js';
import { runCadPython } from './cad-python.js';
import { runModelConversion } from './cad-ai-local-tools.js';

export function createCadControllerAITask({
  store,
  alive,
  runScript = runCadAIScript,
  runPython = runCadPython,
  convertModel: runConvertModel = runModelConversion,
} = {}) {
  const aiWorkspace = createAIWorkspace(),
    blockedConversions = new Map(),
    runningAnalyses = new Set();
  let workspaceRevision;

  const busy = () => runningAnalyses.size > 0;
  // The preview start gate only mirrors the running-analysis part. Store busy,
  // writability and revision remain the controller's preceding checks.
  const allowsPreview = (owner) => !runningAnalyses.size || (runningAnalyses.size === 1 && runningAnalyses.has(owner));
  const owns = (owner) => runningAnalyses.has(owner);
  const track = (owner) => runningAnalyses.add(owner);
  const untrack = (owner) => runningAnalyses.delete(owner);
  const abortAll = () => {
    for (const abort of runningAnalyses) abort.abort();
  };
  // No store-busy, alive or writability guard: the transaction build callback
  // reaches this path while the store is busy.
  function begin() {
    if (runningAnalyses.size) throw Object.assign(Error('Eine lokale Berechnung läuft bereits.'), { code: 'BUSY' });
    aiWorkspace.clear();
    blockedConversions.clear();
    workspaceRevision = store.revision();
    return { revision: workspaceRevision };
  }
  function ensureCurrent() {
    if (workspaceRevision !== store.revision()) begin();
    return workspaceRevision;
  }
  function capture() {
    alive();
    if (runningAnalyses.size || store.state().busy)
      throw Object.assign(Error('Eine lokale Berechnung läuft noch.'), { code: 'BUSY' });
    if (workspaceRevision !== store.revision())
      throw Object.assign(Error('Der KI-Arbeitsbereich gehört zu einer anderen Modellrevision.'), {
        code: 'STALE_REVISION',
      });
    const snapshot = {
      version: 1,
      revision: workspaceRevision,
      files: aiWorkspace.request({ action: 'snapshot' }),
      blockedConversions: [...blockedConversions].map(([key, error]) => ({ key, error: aiFeedback(error) })),
    };
    validateAITaskRuntime(snapshot, store.revision());
    return snapshot;
  }
  function restore(snapshot) {
    alive();
    if (runningAnalyses.size || store.state().busy)
      throw Object.assign(Error('Eine lokale Berechnung läuft noch.'), { code: 'BUSY' });
    // Validate the incoming snapshot against the current store revision before
    // any live state changes. A current valid snapshot may replace a workspace
    // that was still bound to an older revision.
    const checked = validateAITaskRuntime(snapshot, store.revision());
    aiWorkspace.request({ action: 'replace', files: checked.workspace.request({ action: 'snapshot' }) });
    blockedConversions.clear();
    for (const [key, error] of checked.blocked) blockedConversions.set(key, error);
    workspaceRevision = store.revision();
    return {
      revision: workspaceRevision,
      files: Object.keys(snapshot.files).length,
      blockedConversions: blockedConversions.size,
    };
  }
  async function workspaceQuery(kind, options) {
    ensureCurrent();
    if (kind === 'files') {
      if (
        options?.action === 'replace' ||
        (['write', 'remove'].includes(options?.action) &&
          /^(analysis-programs|analysis-results)(\/|$)/.test(options.path ?? ''))
      )
        throw Object.assign(
          Error(
            'Gespeicherte Analyseprogramme und Messergebnisse sind Anwendungsbelege und bleiben unverändert. Eigene Dateien in einem anderen relativen Ordner speichern.',
          ),
          { code: 'AI_WORKSPACE_READONLY', feedback: { retryable: false } },
        );
      return aiWorkspace.request(options);
    }
    if (kind === 'tools') {
      if (typeof globalThis.offlinecadDesktop?.aiToolLibrary !== 'function')
        throw Object.assign(Error('Die dauerhafte Werkzeugbibliothek benötigt Formnaro Desktop.'), {
          code: 'AI_TOOL_LIBRARY_UNAVAILABLE',
        });
      if (globalThis.offlinecadDesktop.aiToolLibraryReply) {
        const reply = await globalThis.offlinecadDesktop.aiToolLibraryReply(options);
        if (!reply?.ok)
          throw Object.assign(Error(reply?.error ?? 'Werkzeugbibliothek nicht verfügbar.'), {
            code: reply?.code ?? 'AI_TOOL_LIBRARY_UNAVAILABLE',
            feedback: reply?.feedback,
          });
        return reply.value;
      }
      return globalThis.offlinecadDesktop.aiToolLibrary(options);
    }
    throw Error('Unbekanntes Arbeitswerkzeug.');
  }
  async function runIsolated(language, args) {
    if (typeof globalThis.offlinecadDesktop?.aiToolLibrary === 'function')
      await workspaceQuery('tools', {
        action: 'save',
        tool: {
          name: (args.name || 'KI-' + language + '-Berechnung').slice(0, 160),
          language,
          code: args.code,
          ...(args.modules ? { modules: args.modules } : {}),
          description: 'Vollständiger Quelltext aus einer lokalen Berechnung. Für neue Teile erneut prüfen.',
          tags: ['Berechnungsverlauf'],
        },
      });
    const runner = language === 'python' ? runPython : runScript;
    return runner(args);
  }
  async function convertModel(args) {
    const key = taskConversionKey(cadProjectRevision(args.project), args.target);
    // Reading the cache belongs to the explicit converter route only. Writing
    // covers every caught converter-only failure, including action=analyze.
    if (args.action === 'convert' && blockedConversions.has(key)) throw blockedConversions.get(key);
    try {
      return await runConvertModel(args);
    } catch (error) {
      if (error.feedback?.toolFailure?.scope === 'converter-only') blockedConversions.set(key, error);
      throw error;
    }
  }
  function archiveArtifacts(artifacts) {
    aiWorkspace.request({ action: 'replace', files: { ...aiWorkspace.request({ action: 'snapshot' }), ...artifacts } });
  }
  // Analysis owners stay registered until their own finally releases them.
  function dispose() {
    abortAll();
  }
  return {
    begin,
    ensureCurrent,
    capture,
    restore,
    workspaceQuery,
    runIsolated,
    convertModel,
    archiveArtifacts,
    busy,
    allowsPreview,
    owns,
    track,
    untrack,
    abortAll,
    dispose,
  };
}
