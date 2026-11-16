// The controller's AI task state: exactly one workspace, converter lock map,
// bound revision and running-analysis owner set per controller instance.
import { createAIWorkspace } from './cad-ai-workspace.js';
import { aiFeedback } from './ai-feedback.js';
import { taskConversionKey, validateAITaskRuntime } from './cad-ai-task-runtime.js';
import { cadProjectRevision, cadProjectSnapshot } from './cad-project.js';
import { runCadAIScript } from './cad-ai-sandbox.js';
import { runCadPython } from './cad-python.js';
import { runModelConversion, queryProgramResources } from './cad-ai-local-tools.js';
import { cadScopedScene } from './cad-scoped-scene.js';
import { AI_PROGRAM_TOOLS } from './cad-ai-program.js';
import { validateAIAnalysis, compactAIAnalysisResult, localAIAnalysisResult } from './cad-ai-analysis.js';

export function createCadControllerAITask({
  store,
  alive,
  runScript = runCadAIScript,
  runPython = runCadPython,
  convertModel: runConvertModel = runModelConversion,
  analysis: {
    resolveGeometry,
    getFonts,
    getProgramResources,
    onBusy,
    freecadOperation,
    query,
    modelComparison,
    meshQuery,
    checkJointCollision,
    checkMotionRange,
    describe,
    assertPreviewStart,
  } = {},
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
  async function analyze(requests, { reportBudget = 14000, signal } = {}) {
    if (busy()) throw Object.assign(Error('Eine lokale Berechnung läuft bereits.'), { code: 'BUSY' });
    ensureCurrent();
    if (!Number.isInteger(reportBudget) || reportBudget < 2000 || reportBudget > 32000)
      throw Object.assign(
        Error(
          'Messberichtbudget muss zwischen 2000 und 32000 Zeichen liegen. Bei kleinem Restbudget vorhandene Seiten verwenden.',
        ),
        { code: 'AI_ANALYSIS_INVALID' },
      );
    const revision = store.revision(),
      results = [],
      validated = validateAIAnalysis(requests),
      localAbort = new AbortController();
    signal = signal ? AbortSignal.any([signal, localAbort.signal]) : localAbort.signal;
    track(localAbort);
    onBusy(true);
    try {
      for (const q of validated) {
        if (signal.aborted) throw Object.assign(Error('Lokale Berechnung abgebrochen.'), { code: 'ABORTED' });
        const options = q.options ?? {};
        let value;
        if (q.engine === 'workspace') value = await workspaceQuery(q.kind, options);
        else if (['python', 'javascript'].includes(q.engine)) {
          const project = await resolveGeometry(store.readSnapshot(), null, { signal });
          value = await runIsolated(q.engine === 'python' ? 'python' : 'javascript', {
            ...options,
            signal,
            timeoutMs: 300000,
            call: async (method, args) => {
              if (signal?.aborted) throw Object.assign(Error('Berechnung abgebrochen.'), { code: 'ABORTED' });
              if (store.revision() !== revision)
                throw Object.assign(Error('Modell während der Berechnung geändert.'), { code: 'STALE_REVISION' });
              if (method === 'model') {
                const snapshot = cadProjectSnapshot(project);
                return { ...snapshot, objects: snapshot.nodes };
              }
              if (
                method !== 'query' ||
                !args ||
                !Object.hasOwn(AI_PROGRAM_TOOLS.queries, args.engine) ||
                !AI_PROGRAM_TOOLS.queries[args.engine].includes(args.kind)
              )
                throw Object.assign(Error('Analyse darf nur messen; Modelländerungen gehören in eine Vorschau.'), {
                  code: 'AI_ANALYSIS_READ_ONLY',
                });
              const o = args.options ?? {};
              if (args.engine === 'workspace') return workspaceQuery(args.kind, o);
              if (args.engine === 'freecad') return freecadOperation(project, { ...o, kind: 'inspect' }, signal);
              if (args.engine === 'cad') return query(args.kind, o, { signal });
              if (args.engine === 'app' && args.kind === 'modelComparison')
                return modelComparison(o, { signal, project });
              if (args.engine === 'app' && ['jointCollision', 'motionRange'].includes(args.kind))
                throw Error('Gelenkkollision separat als Messauftrag ausführen.');
              if (args.engine === 'app')
                return queryProgramResources({
                  project,
                  kind: args.kind,
                  options: o,
                  getFonts,
                  getResources: getProgramResources,
                  signal,
                });
              if (args.engine === 'converter')
                return convertModel({
                  project,
                  action: 'analyze',
                  target: typeof o.target === 'string' ? { rootId: o.target, path: [] } : o.target,
                  options: o.options,
                  edits: o.edits,
                  commands: o.commands,
                  signal,
                });
              const target = o.id ?? o.nodeId ?? o.target,
                id = typeof target === 'string' ? target : target?.path?.length === 0 ? target.rootId : null;
              return meshQuery(
                ['inspectSolid', 'analyzeEdges'].includes(args.kind) ? args.kind : 'toolsQuery',
                {
                  ...o,
                  id,
                  ...(['inspectSolid', 'analyzeEdges'].includes(args.kind)
                    ? {}
                    : { kind: args.kind === 'toolsQuery' ? o.kind : args.kind }),
                },
                { signal },
              );
            },
          });
        } else if (q.engine === 'freecad')
          value = await freecadOperation(store.readSnapshot(), { ...options, kind: 'inspect' }, signal);
        else if (q.engine === 'cad') value = await query(q.kind, options, { signal });
        else if (q.engine === 'app' && q.kind === 'sceneScope') {
          if (!Object.keys(options).length) throw Error('Gezielte Szene: ids, targets oder rootsOnly angeben.');
          const project = store.readSnapshot();
          value = cadScopedScene(await describe(project), project, options);
        } else if (q.engine === 'app' && q.kind === 'modelComparison')
          value = await modelComparison(options, { signal });
        else if (q.engine === 'app' && q.kind === 'jointCollision')
          value = await checkJointCollision(options, { revision, signal, analysisOwner: localAbort });
        else if (q.engine === 'app' && q.kind === 'motionRange')
          value = await checkMotionRange(options, { revision, signal, analysisOwner: localAbort });
        else if (q.engine === 'app')
          value = await queryProgramResources({
            project: store.readSnapshot(),
            kind: q.kind,
            options,
            getFonts,
            getResources: getProgramResources,
            signal,
          });
        else {
          const target = options.id ?? options.nodeId ?? options.target,
            id =
              typeof target === 'string'
                ? target
                : Array.isArray(target?.path) && !target.path.length
                  ? target.rootId
                  : null;
          if (typeof id !== 'string') throw Error('Ein vollständiges Netzteil für die Messung wählen.');
          value = await meshQuery(
            q.kind === 'inspectSolid' ? 'inspectSolid' : 'toolsQuery',
            { id, ...(q.kind === 'inspectSolid' ? {} : { kind: q.kind, options: options.options }) },
            { signal },
          );
        }
        if (store.revision() !== revision)
          throw Object.assign(Error('Modell während der Messung geändert.'), { code: 'STALE_REVISION' });
        const computation = ['python', 'javascript'].includes(q.engine) || (q.engine === 'freecad' && !!options.script),
          token = crypto.randomUUID(),
          artifacts = {};
        let program;
        if (computation) {
          const path = 'analysis-programs/' + token + (q.engine === 'javascript' ? '.js' : '.py'),
            bundlePath = 'analysis-programs/' + token + '.program.json';
          artifacts[path] = options.script?.code ?? options.code;
          artifacts[bundlePath] = JSON.stringify({ version: 1, engine: q.engine, kind: q.kind, options });
          program = {
            name: options.script?.name ?? options.name ?? q.id,
            language: q.engine === 'freecad' ? 'freecad-python' : q.engine,
            path,
            bundlePath,
          };
        }
        const reported = localAIAnalysisResult(value, {
          report: q.report,
          budget: Math.floor((reportBudget - 1200) / validated.length),
          atomic: computation,
          save: (text) => {
            const path = 'analysis-results/' + token + '.json';
            artifacts[path] = text;
            return path;
          },
        });
        if (Object.keys(artifacts).length) archiveArtifacts(artifacts);
        results.push({ id: q.id, engine: q.engine, kind: q.kind, ...(program ? { program } : {}), value: reported });
      }
      return compactAIAnalysisResult({ revision, results });
    } finally {
      untrack(localAbort);
      onBusy(store.state().busy);
    }
  }
  async function motionQuery(revision, signal, owner, run) {
    assertPreviewStart(revision, owner);
    const owned = !owns(owner),
      abort = owned ? new AbortController() : owner;
    if (owned) {
      track(abort);
      onBusy(true);
    }
    const activeSignal = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
    try {
      if (activeSignal.aborted)
        throw Object.assign(Error('Messauftrag abgebrochen.'), { name: 'AbortError', code: 'ABORTED' });
      return await run(activeSignal, abort);
    } finally {
      if (owned) {
        untrack(abort);
        onBusy(store.state().busy || busy());
      }
    }
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
    analyze,
    motionQuery,
    busy,
    allowsPreview,
    owns,
    track,
    untrack,
    abortAll,
    dispose,
  };
}
