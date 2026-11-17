import { easyExportIds } from './cad-easy-domain.js';
import { exportCadProjectSvg } from './cad-svg-export.js';

export function createCadExportWorkflow({
  project,
  activeEasyKind,
  getEasyDomainRevision,
  quality,
  controller,
  download,
  prepareDialog,
  modal,
  $,
  workflowSettings,
  getModalSequence,
  safe,
  selected,
  exportSvg = exportCadProjectSvg,
}) {
  async function exportModel(
    format,
    { ids, quality: exportQuality = quality.get().export, current = () => true } = {},
  ) {
    ids = easyExportIds(project(), activeEasyKind(), ids, format);
    const domainRevision = getEasyDomainRevision(),
      originalCurrent = current;
    current = () => domainRevision === getEasyDomainRevision() && originalCurrent();
    if (format === 'svg') {
      const result = await exportSvg(controller, { ids, quality: exportQuality });
      if (!current()) return { canceled: true };
      await download(result.svg, project().name + '.svg', 'image/svg+xml', { numbered: true });
      return result;
    }
    const result = await controller.exportModel({ format, ids, quality: exportQuality });
    if (!current()) return { canceled: true };
    await download(result.data, project().name + '.' + result.extension, result.mime, { numbered: true });
    return result;
  }

  function exportDialog() {
    prepareDialog();
    modal(
      'Modell exportieren',
      '<p>Exportiert werden dauerhaft sichtbare Teile. STL und OBJ enthalten CAD-Körper und Netzteile. 3MF, GLB und glTF enthalten zusätzlich Ansichtsvorlagen. STEP enthält native CAD-Körper. Lose Lochteile werden ausgelassen. Die Auswahlisolation begrenzt nur die Ansicht.</p><label class="dialog-label">Format<select id="export-format"><option value="stl">STL · 3D-Druck</option><option value="step">STEP · CAD-Körper</option><option value="obj">OBJ + MTL</option><option value="3mf">3MF · Farben</option><option value="glb">GLB · Darstellung in einer Datei</option><option value="gltf">glTF · Darstellung</option><option value="svg">SVG · CAD- und Netzprojektion</option></select></label><label class="dialog-label">Umfang<select id="export-scope"><option value="all">Sichtbare Teile</option><option value="selection">Ausgewählte Teile</option></select></label><label class="dialog-label">Export-Abweichung (mm)<input id="export-deflection" type="number" min="0.0000001" step="0.001"></label><label class="dialog-label">Export-Winkel (Grad)<input id="export-angle" type="number" min="0.01" max="90"></label><p id="export-status" role="status"></p><div class="modal-actions"><button id="export-confirm" class="primary">Exportieren</button></div>',
    );
    $('export-format').value = workflowSettings.get().export.format;
    $('export-scope').value = workflowSettings.get().export.scope;
    $('export-deflection').value = quality.get().export.deflection;
    $('export-angle').value = quality.get().export.angleDegrees;
    if (activeEasyKind()) {
      const mesh = activeEasyKind() === 'mesh';
      if (mesh) $('export-format').querySelector('[value=step]')?.remove();
      if (!$('export-format').value) $('export-format').value = 'stl';
      $('export-scope').querySelector('[value=all]').textContent = mesh ? 'Sichtbare Netzteile' : 'Sichtbare CAD-Teile';
      $('modal-body').querySelector('p').textContent = mesh
        ? 'Exportiert nur die sichtbaren Netzteile dieses Arbeitsbereichs.'
        : 'Exportiert nur die sichtbaren CAD-Teile dieses Arbeitsbereichs.';
    }
    const session = getModalSequence(),
      dialog = $('modal'),
      status = $('export-status');
    const current = () => session === getModalSequence() && status.isConnected && dialog.open;
    $('export-confirm').onclick = () =>
      safe(async () => {
        if (!current()) return;
        status.textContent = '';
        const ids =
          $('export-scope').value === 'selection' ? selected({ roots: true }).map((value) => value.node.id) : undefined;
        try {
          await exportModel($('export-format').value, {
            ids,
            quality: {
              deflection: Number($('export-deflection').value),
              angleDegrees: Number($('export-angle').value),
            },
            current,
          });
          if (current()) dialog.close();
        } catch (error) {
          if (!current()) return;
          if (['SVG_OPEN_MESH', 'SVG_INVALID_MESH'].includes(error.code)) {
            status.textContent = error.message;
            return;
          }
          throw error;
        }
      });
  }

  return { exportModel, exportDialog };
}
