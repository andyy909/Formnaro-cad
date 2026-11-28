// Shared UI operations; application-specific lifecycle remains with the caller.
export function createUiHelpers({
  $,
  t,
  errorReporter,
  beforeModal,
  getBusy,
  setBusyState,
  updateState,
  progress,
  document,
  window,
}) {
  let busyTimer;
  const browserExportCounts = new Map();
  function toast(message) {
    $('toast').textContent = t(message);
    $('toast').style.display = 'block';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($('toast').style.display = 'none'), 6000);
  }

  function safe(fn) {
    try {
      const result = fn();
      return result?.catch
        ? result.catch((error) => {
            if (error.name !== 'AbortError') {
              errorReporter.report(error);
              console.error(error);
              toast(error.message);
            }
            return undefined;
          })
        : result;
    } catch (error) {
      if (error.name !== 'AbortError') {
        errorReporter.report(error);
        console.error(error);
        toast(error.message);
      }
      return undefined;
    }
  }

  function modal(title, content, { modeless = false } = {}) {
    beforeModal();
    const dialog = $('modal');
    if (dialog.open && dialog.matches(':modal') === modeless) dialog.close();
    dialog.classList.remove(
      'ai-modal',
      'projects-modal',
      'stl-workbench-modal',
      'stl-project-preview',
      'freecad-document-modal',
      'freecad-document-preview',
      'freecad-document-review',
    );
    $('modal-title').textContent = t(title);
    $('modal-body').innerHTML = content;
    if (!dialog.open) {
      if (modeless) dialog.show();
      else dialog.showModal();
    }
  }

  async function download(data, filename, mime = 'application/octet-stream', { numbered = false, signal } = {}) {
    const canceled = () => ({ saved: false, canceled: true });
    if (signal?.aborted) return canceled();
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime }),
      safeName = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    if (window.offlinecadDesktop?.saveFile) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (signal?.aborted) return canceled();
      const operationId = signal ? crypto.randomUUID() : undefined,
        abort = () => {
          if (operationId) void window.offlinecadDesktop.cancelFileSave?.({ operationId }).catch(() => {});
        };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        return await window.offlinecadDesktop.saveFile({
          filename: safeName,
          language: document.documentElement?.lang,
          ...(numbered ? { numbered: true } : {}),
          ...(operationId ? { operationId } : {}),
          bytes,
        });
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    }
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    const count = numbered ? (browserExportCounts.get(safeName) ?? 0) : 0;
    link.download = count ? safeName.replace(/(\.[^.]+)?$/, (_, ext) => count + 1 + (ext ?? '')) : safeName;
    document.body.append(link);
    if (signal?.aborted) {
      link.remove();
      URL.revokeObjectURL(url);
      return canceled();
    }
    link.click();
    link.remove();
    if (numbered) browserExportCounts.set(safeName, count + 1);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { saved: true };
  }

  function setBusy(value) {
    const wasBusy = getBusy();
    setBusyState(value);
    if (!value) {
      clearTimeout(busyTimer);
      progress.hidden = true;
    } else if (!wasBusy) {
      progress.textContent = 'Berechnung abbrechen';
      busyTimer = setTimeout(() => {
        if (getBusy()) progress.hidden = false;
      }, 200);
    }
    document.body.dataset.cadBusy = String(value);
    $('status').textContent = value
      ? 'Modell wird berechnet · Abbrechen oder Esc'
      : t('Linksklick: auswählen · Umschalt: Mehrfachauswahl · Rechts ziehen: Ansicht drehen');
    updateState();
  }

  return { toast, safe, modal, download, setBusy };
}
