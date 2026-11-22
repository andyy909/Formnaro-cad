import { easyDomainAllows } from '../cad-easy-domain.js';

export function createIsolation({
  isolation,
  isolationNotice,
  view,
  project,
  activeEasyKind,
  readyForFile,
  getSelection,
  escape,
  getLiveSelection,
  getScene,
  refreshMarkerVisibility,
  refreshUi,
}) {
  function updateIsolation() {
    const kind = activeEasyKind();
    view.setIsolation(
      kind
        ? project()
            .nodes.filter((node) => easyDomainAllows(node, kind) && isolation.allows(node.id))
            .map((node) => node.id)
        : isolation.state(),
    );
    refreshMarkerVisibility();
    isolationNotice.hidden = !isolation.state();
  }

  function endIsolation() {
    escape();
    isolation.end();
    updateIsolation();
  }

  function isolateSelection() {
    readyForFile();
    const targets = getSelection();
    escape();
    isolation.start(project(), targets);
    updateIsolation();
    view.setSelection(getLiveSelection(), getScene());
    refreshUi();
  }

  return { updateIsolation, endIsolation, isolateSelection };
}
