import { CAD_PROJECT_LIMITS, cadProjectNeedsPackage, createCadWorkspaceSerializer } from '../cad-project.js';
import { hasGeometryRefs } from '../cad-geometry-ref.js';
import { cadWorkspaceStoredProjectVersion, validateCadWorkspace } from '../cad-workspace.js';

export function createWorkspaceIO({
  window,
  fetch,
  $,
  t,
  controller,
  project,
  getSelection,
  quality,
  assemblyDisplay,
  packFiles,
  readyForFile,
  confirmProjectChange,
  cacheWelcomePackageThumbnail,
  download,
  toast,
  updateState,
  scheduleRefresh,
  updateIsolation,
  setQuality,
  setPreferences,
  setMode,
  select,
  activeEasyKind,
  runtime,
}) {
  function workspace() {
    const explosion = runtime.partPropertiesUI?.storedExplosion() ?? null,
      loadSet = assemblyDisplay.ids(project()),
      common = project().version >= 8 || loadSet !== null || explosion !== null,
      section = common ? (runtime.inspectionUI?.storedSection() ?? runtime.meshExtras?.storedSection()) : null,
      meshSelection = common ? runtime.meshSelectionUI?.snapshot() : null;
    return {
      version: explosion !== null ? 6 : loadSet !== null ? 5 : common ? (meshSelection ? 4 : section ? 3 : 2) : 1,
      ...(explosion !== null ? { explosion } : {}),
      ...(loadSet !== null || explosion !== null ? { loadSet } : {}),
      ...(common
        ? {
            tree: runtime.ui?.getTreeState() ?? { expanded: [] },
            ...(section ? { section } : {}),
            ...(meshSelection ? { meshSelection } : {}),
          }
        : {}),
      view: runtime.view.viewState(),
      selection: getSelection(),
      mode: runtime.view.getMode(),
      snap: runtime.preferences.snap,
      quality: quality.get(),
      layout: runtime.layoutUI.state(),
    };
  }

  function workspaceSignature(state = workspace()) {
    const checked = validateCadWorkspace(state);
    // OrbitControls can change idle camera coordinates at floating-point precision.
    // Ignore sub-nanometre view noise only for dirty detection; files retain full precision.
    for (const field of ['position', 'target', 'up'])
      checked.view[field] = checked.view[field].map((value) => Number(value.toFixed(9)));
    checked.view.zoom = Number(checked.view.zoom.toPrecision(14));
    return JSON.stringify(checked);
  }

  function serializeWorkspace(state = workspace()) {
    return controller.serializeWorkspace(state);
  }

  async function saveProjectOnDesktop(args) {
    const desktop = window.offlinecadDesktop;
    if (!desktop.saveProjectReply) return desktop.saveProject(args);
    const reply = await desktop.saveProjectReply(args);
    if (!reply?.ok)
      throw Object.assign(Error(reply?.error ?? 'Projekt nicht gespeichert.'), {
        code: reply?.code ?? 'PROJECT_SAVE_FAILED',
        feedback: reply?.feedback,
      });
    return reply.value;
  }

  async function save({
    saveAs = false,
    format,
    automation = false,
    expectedRevision,
    filename: requestedFilename,
  } = {}) {
    readyForFile();
    const release = automation
      ? controller.holdRevision(expectedRevision, { message: 'Projekt wird gespeichert.' })
      : () => {};
    runtime.fileBusy = true;
    try {
      const revision = controller.revision(),
        state = workspace(),
        signature = workspaceSignature(state),
        pack =
          format === 'fnpack' ||
          (format === undefined && (runtime.preferredProjectFormat === 'fnpack' || cadProjectNeedsPackage(project()))),
        base = (project().name.trim() || 'Unbenanntes Modell').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
      let result, storedVersion;
      if (pack) {
        if (!packFiles.available()) throw Error('Geometriepakete in der portablen Anwendung speichern.');
        const encoded = packFiles.encode(project(), state);
        storedVersion = encoded.project.version;
        result = await saveProjectOnDesktop({
          filename: requestedFilename ?? base + '.fnpack',
          automation,
          ...encoded,
          id: runtime.activeProjectFile?.id,
          saveAs: saveAs || !!requestedFilename || runtime.preferredProjectFormat !== 'fnpack',
        });
      } else {
        storedVersion = cadWorkspaceStoredProjectVersion(project().version, state);
        const encoded = hasGeometryRefs(project())
            ? createCadWorkspaceSerializer(await controller.materialize())(state)
            : serializeWorkspace(state),
          filename = requestedFilename ?? base + '.ocad';
        result = window.offlinecadDesktop?.saveProject
          ? await saveProjectOnDesktop({
              filename,
              automation,
              bytes: new TextEncoder().encode(encoded),
              id: runtime.activeProjectFile?.id,
              saveAs:
                saveAs ||
                !!requestedFilename ||
                runtime.preferredProjectFormat === 'fnpack' ||
                (storedVersion >= 8 &&
                  (runtime.activeProjectFile?.projectVersion ?? project().version) < storedVersion),
            })
          : await download(encoded, filename, 'application/json');
      }
      if (result?.saved) {
        packFiles.register(result.fnpack);
        runtime.preferredProjectFormat = pack ? 'fnpack' : 'ocad';
        runtime.savedRevision = revision;
        runtime.cleanRevision = revision;
        runtime.recoveredProject = false;
        runtime.savedWorkspaceSignature = signature;
        runtime.cleanWorkspaceSignature = signature;
        runtime.activeProjectFile = result.file ? { ...result.file, projectVersion: storedVersion } : null;
        toast(result.warning ?? 'Projekt gespeichert.');
        if (pack && result.file) cacheWelcomePackageThumbnail(result.file);
      }
      updateState();
      return result;
    } finally {
      runtime.fileBusy = false;
      release();
    }
  }

  async function saveFromAutomation(request) {
    const extension = request.filename?.split('.').at(-1).toLowerCase(),
      format = request.format ?? extension;
    if (extension && request.format && extension !== request.format)
      throw Error('Dateiendung und Projektformat stimmen nicht überein.');
    const result = await save({
      automation: true,
      expectedRevision: request.revision,
      filename: request.filename,
      format,
    });
    return {
      saved: result?.saved === true,
      revision: request.revision,
      currentRevision: controller.revision(),
      ...(result?.file
        ? {
            path: result.file.path,
            format: result.file.path.toLowerCase().endsWith('.fnpack') ? 'fnpack' : 'ocad',
            bytes: result.file.size,
          }
        : {}),
      ...(result?.warning ? { warning: result.warning } : {}),
    };
  }

  async function restoreWorkspace(state) {
    runtime.partPropertiesUI?.restoreExplosion(null);
    const previousSet = assemblyDisplay.ids(project());
    assemblyDisplay.restore(state?.loadSet ?? null, project());
    if (JSON.stringify(previousSet) !== JSON.stringify(assemblyDisplay.ids(project()))) {
      controller.invalidateDisplayView();
      runtime.lastDisplayed = null;
      runtime.preparedDisplay = null;
      await scheduleRefresh();
    }
    if (!state) {
      await runtime.meshSelectionUI?.restore(null);
      runtime.ui?.restoreTreeState({ expanded: [] });
      select([]);
      runtime.view.fit();
      return;
    }
    await setQuality(state.quality);
    setPreferences({ ...runtime.preferences, snap: state.snap });
    await runtime.layoutUI.restore(state.layout);
    setMode(state.mode);
    runtime.ui?.restoreTreeState(state.tree ?? { expanded: [] });
    runtime.view.restoreView(state.view);
    $('projection').textContent = t(state.view.projection === 'perspective' ? 'Perspektive' : 'Orthografisch');
    select(state.selection);
    await runtime.meshExtras?.restoreSection(state.section);
    await runtime.meshSelectionUI?.restore(state.meshSelection ?? null);
    runtime.partPropertiesUI?.restoreExplosion(state.explosion ?? null);
  }

  async function openEncoded(encoded, file = null, { allowCatalog = false } = {}) {
    runtime.partPropertiesUI?.close();
    runtime.partPropertiesUI?.suspendExplosion();
    const prepared = await controller.readProject(encoded),
      checked = prepared.project,
      state = checked.workspace;
    if (hasGeometryRefs(checked) && !allowCatalog)
      throw Error('Geometrieverweise benötigen ein vollständiges .fnpack-Paket.');
    delete checked.workspace;
    const oldLoadSet = assemblyDisplay.ids(project());
    runtime.assemblyOpening = true;
    assemblyDisplay.restore(state?.loadSet ?? null, checked);
    const assemblySetChanged = JSON.stringify(oldLoadSet) !== JSON.stringify(assemblyDisplay.ids(checked));
    if (assemblySetChanged) controller.invalidateDisplayView();
    try {
      await controller.open(checked);
    } catch (error) {
      assemblyDisplay.restore(oldLoadSet, project());
      throw error;
    } finally {
      runtime.assemblyOpening = false;
    }
    runtime.assemblyScope = controller.projectScope();
    runtime.assemblyKnownIds = new Set(project().nodes.map((n) => n.id));
    runtime.nextImportIndex = 0;
    runtime.isolation.end();
    updateIsolation();
    if (assemblySetChanged) {
      runtime.lastDisplayed = null;
      await scheduleRefresh();
    } else await runtime.refreshTask;
    runtime.activeProjectFile = prepared.migration ? null : file ? { ...file, projectVersion: checked.version } : null;
    if (prepared.warnings.length) toast(prepared.warnings.join(' '));
    runtime.savedRevision = controller.revision();
    runtime.cleanRevision = runtime.savedRevision;
    runtime.recoveredProject = false;
    await restoreWorkspace(state);
    runtime.savedWorkspaceSignature = workspaceSignature();
    runtime.cleanWorkspaceSignature = runtime.savedWorkspaceSignature;
    updateState();
  }

  async function openFile(file) {
    if (file.name.toLowerCase().endsWith('.fnpack'))
      throw Error('Geometriepakete über Projekt öffnen in der portablen Anwendung laden.');
    if (file.size > CAD_PROJECT_LIMITS.bytes) throw Error('Projektdatei ist größer als 50 MB.');
    await openEncoded(new Uint8Array(await file.arrayBuffer()));
  }

  async function openProject(id) {
    readyForFile();
    if (!(await confirmProjectChange())) return;

    if (!window.offlinecadDesktop?.openProject) {
      $('modal').close();
      $('open-file').click();
      return;
    }

    runtime.fileBusy = true;
    try {
      const result = await window.offlinecadDesktop.openProject(id ? { id } : {});
      if (result.opened) {
        packFiles.register(result.fnpack);
        const beforeFormat = runtime.preferredProjectFormat;
        try {
          await openEncoded(result.bytes ?? result.project, result.file, { allowCatalog: !!result.fnpack });
          runtime.preferredProjectFormat = result.fnpack ? 'fnpack' : 'ocad';
        } catch (error) {
          runtime.preferredProjectFormat = beforeFormat;
          throw error;
        }
        $('modal').close();
        if (result.warning) toast(result.warning);
        if (result.fnpack) cacheWelcomePackageThumbnail(result.file);
        return true;
      }
    } finally {
      runtime.fileBusy = false;
    }
  }

  async function openWelcomeExample(example) {
    readyForFile();
    if (!(await confirmProjectChange())) return false;
    if (activeEasyKind()) runtime.workbenchUI.setMode('normal');
    runtime.fileBusy = true;
    try {
      const response = await fetch(example.url);
      if (!response.ok) throw Error('Beispielprojekt konnte nicht geladen werden.');
      const encoded = await response.text();
      await openEncoded(encoded);
      runtime.preferredProjectFormat = 'ocad';
      runtime.view.fit();
      toast('Beispiel geladen. Änderungen als eigenes Projekt speichern.');
      return true;
    } finally {
      runtime.fileBusy = false;
    }
  }

  return {
    workspace,
    workspaceSignature,
    serializeWorkspace,
    save,
    saveFromAutomation,
    openEncoded,
    openFile,
    openProject,
    openWelcomeExample,
  };
}
