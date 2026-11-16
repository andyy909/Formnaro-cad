export function createRecoveryActions({
  window,
  controller,
  project,
  workspace,
  workspaceSignature,
  serializeWorkspace,
  recovery,
  recoveryEncoder,
  updateSaveState,
  safe,
  toast,
  errorReporter,
  isBusy,
  hasActiveTool,
  isMeshSelectionChecking,
  runtime,
}) {
  let recoveryWritten = null,
    recoveryPending = null,
    recoveryFailure = null;
  let closeRecoveryPending = false,
    recoveryTimer;

  function recoveryData(state = workspace()) {
    return recovery.packageMode() ? { ...project(), workspace: state } : serializeWorkspace(state);
  }

  let recoverySignature = '',
    recoveryChangedAt = 0;
  function recoveryIdentity(state) {
    const scope = controller.projectScope(),
      revision = controller.revision(),
      workspaceKey = workspaceSignature(state);
    const format = recovery.packageMode() ? 'fnpack' : 'ocad';
    return { scope, revision, workspaceKey, format, key: JSON.stringify([scope, revision, workspaceKey, format]) };
  }
  function submitRecovery(state, confirmedOnly = false) {
    const model = project();
    const version = model.version;
    if (!recoveryEncoder)
      return recovery.write(confirmedOnly ? controller.serialize() : recoveryData(state), { version });
    const storedWorkspace = confirmedOnly ? undefined : state;
    return recovery.write(model, {
      version,
      workspace: storedWorkspace,
      prepare: (format, snapshot) => recoveryEncoder.encode(format, snapshot, storedWorkspace),
    });
  }
  async function writeConfirmedRecovery(state, { confirmedOnly = false } = {}) {
    const identity = recoveryIdentity(state);
    const ticket = { ...identity };
    recoveryPending = ticket;
    recoveryFailure = null;
    updateSaveState(identity.workspaceKey);
    try {
      const saved = await submitRecovery(state, confirmedOnly);
      if (saved && !confirmedOnly && controller.projectScope() === ticket.scope) recoveryWritten = ticket;
      if (!saved && recovery.blocked()) throw Error('Autosicherung ist gesperrt. Projekt bitte manuell speichern.');
      return saved;
    } catch (error) {
      if (recoveryPending !== ticket || controller.projectScope() !== ticket.scope) return false;
      recoveryFailure = { ...ticket, message: error.message };
      throw error;
    } finally {
      if (recoveryPending === ticket) recoveryPending = null;
      updateSaveState();
    }
  }

  // Wait for one second of stable workspace state before writing.
  function startAutosave() {
    recoveryTimer = setInterval(() => {
      if (!window.__cadReady || isBusy() || closeRecoveryPending || hasActiveTool()) return;
      const state = workspace(),
        identity = recoveryIdentity(state);
      updateSaveState(identity.workspaceKey);
      if (
        !runtime.autosave ||
        runtime.startupRecoveryFailed ||
        recovery.blocked() ||
        controller.revision() === runtime.startupEmptyRevision
      )
        return;
      const { key } = identity;
      if (key !== recoverySignature) {
        recoverySignature = key;
        recoveryChangedAt = Date.now();
        return;
      }
      if (
        key === recoveryWritten?.key ||
        key === recoveryPending?.key ||
        key === recoveryFailure?.key ||
        Date.now() - recoveryChangedAt < 1000
      )
        return;
      void safe(() => writeConfirmedRecovery(state));
    }, 500);
  }

  async function flushOnClose() {
    if (!window.__cadReady || !runtime.autosave || controller.revision() === runtime.startupEmptyRevision) return true;
    if (runtime.startupRecoveryFailed || recovery.blocked()) {
      if ([runtime.cleanRevision, runtime.savedRevision].includes(controller.revision())) return true;
      toast('Die bisherige Autosicherung bleibt erhalten. Projekt bitte vor dem Schließen manuell speichern.');
      return false;
    }
    closeRecoveryPending = true;
    try {
      while (true) {
        const scope = controller.projectScope(),
          revision = controller.revision(),
          state = workspace(),
          signature = workspaceSignature(state);
        const confirmedOnly = !recovery.packageMode() && (controller.state().busy || isMeshSelectionChecking());
        const saved = await writeConfirmedRecovery(state, { confirmedOnly });
        if (
          scope !== controller.projectScope() ||
          revision !== controller.revision() ||
          signature !== workspaceSignature()
        )
          continue;
        if (!saved) throw Error('Autosicherung ist gesperrt. Projekt vor dem Schließen speichern.');
        return true;
      }
    } catch (error) {
      toast(error.message);
      errorReporter.report(error);
      closeRecoveryPending = false;
      return false;
    }
  }

  function stopAutosave() {
    clearInterval(recoveryTimer);
  }

  function saveOnUnload() {
    if (
      window.__cadReady &&
      controller.revision() !== runtime.startupEmptyRevision &&
      runtime.autosave &&
      !runtime.startupRecoveryFailed &&
      !window.offlinecadDesktop?.changeRecoveryData
    )
      void safe(() =>
        recovery.write(
          controller.state().busy || isMeshSelectionChecking() ? controller.serialize() : serializeWorkspace(),
          { version: project().version },
        ),
      );
  }

  function readStatus() {
    const scope = controller.projectScope(),
      pending = runtime.autosave && recoveryPending?.scope === scope,
      error = runtime.autosave
        ? recoveryFailure?.scope === scope
          ? recoveryFailure.message
          : recovery.blocked()
            ? 'Autosicherung ist gesperrt. Projekt bitte manuell speichern.'
            : null
        : null;
    return { pending, error };
  }

  return { readStatus, writeConfirmedRecovery, startAutosave, stopAutosave, flushOnClose, saveOnUnload };
}
