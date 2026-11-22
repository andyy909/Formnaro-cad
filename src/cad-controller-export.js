import { hasCurrentPartSurfaceGroups } from './cad-part-properties.js';
import { meshColorsEnabled } from './mesh-appearance.js';
import { flags } from './organization.js';
import { assertCadDrillSourcesReady } from './cad-drill-source-data.js';
import { assertCadLinkedPatternExportReady } from './cad-linked-pattern-data.js';
import { cadProjectParameterExportProblems } from './cad-project-parameters-export.js';
import { cadContourLinkProblems } from './cad-linked-contours-data.js';

export function createCadControllerExport({ alive, store, worker, meshWorker, onBusy, progress }) {
  async function exportModel(options) {
    alive();
    assertExportReady(options);
    const project = store.readSnapshot(),
      revision = store.revision();
    onBusy(true);
    try {
      let meshColorParts;
      if (['obj', '3mf', 'gltf', 'glb'].includes(options.format)) {
        const ids = project.nodes
          .filter(
            (n) =>
              n.kind === 'mesh' &&
              !hasCurrentPartSurfaceGroups(n) &&
              meshColorsEnabled(n) &&
              n.meshRole !== 'hole' &&
              !flags(n, project).hidden &&
              (!options.ids || options.ids.includes(n.id)),
          )
          .map((n) => n.id);
        if (ids.length)
          meshColorParts = await meshWorker.run(
            { job: 'toolsQuery', kind: 'colors', ids, project },
            { revision, progress },
          );
      }
      if (store.revision() !== revision)
        throw Object.assign(Error('Projekt während des Exports geändert.'), { code: 'STALE_REVISION' });
      const result = await worker.run(
        { job: 'exportModel', project, options: { ...options, meshColorParts } },
        { revision, progress },
      );
      if (store.revision() !== revision)
        throw Object.assign(Error('Projekt während des Exports geändert. Erneut exportieren.'), {
          code: 'STALE_REVISION',
        });
      return result;
    } finally {
      onBusy(store.state().busy);
    }
  }
  function assertExportReady(options = {}) {
    alive();
    const current = store.readSnapshot();
    assertCadDrillSourcesReady(current, options);
    assertCadLinkedPatternExportReady(current, options);
    const problems = cadProjectParameterExportProblems(current, options);
    if (problems.length)
      throw Object.assign(
        Error(
          'Betroffene Projektparameter oder Varianten zuerst aktualisieren oder den verlorenen Bezug ausdrücklich lösen. ' +
            problems[0].message,
        ),
        { code: 'PARAMETERS_UPDATE_REQUIRED', problems },
      );
    const contours = cadContourLinkProblems(current, current.contourLinks, options);
    if (contours.length)
      throw Object.assign(
        Error(
          'Betroffene Konturverknüpfungen zuerst aktualisieren, neu zuordnen oder ausdrücklich lösen. ' +
            contours[0].message,
        ),
        { code: 'CONTOUR_UPDATE_REQUIRED', problems: contours },
      );
    return true;
  }
  return { exportModel, assertExportReady };
}
