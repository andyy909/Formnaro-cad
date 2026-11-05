// This envelope is application data from the initiating renderer. It is
// separate from the provider-authored plan and never part of its schema.
const maximumBytes = 256 * 1024 * 1024;

function validatePracticeResultProject(project) {
  if (project?.format !== 'OfflineCAD' || !Array.isArray(project.nodes) ||
      Buffer.byteLength(JSON.stringify(project)) > maximumBytes) {
    throw Error('Ungültiges Übungsergebnis oder Ergebnis größer als 256 MiB.');
  }
  return project;
}

function validatePracticeProjectCopy(value) {
  if (value === undefined) return undefined;
  const valid = value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => ['revision', 'project', 'selection', 'sketchDraft'].includes(key)) &&
    typeof value.revision === 'string' && /^[0-9a-f]{16}$/.test(value.revision) &&
    value.project?.format === 'OfflineCAD' && Array.isArray(value.project.nodes) &&
    Array.isArray(value.selection) && value.selection.length <= 8 &&
    value.selection.every(target => target && Object.keys(target).length === 2 &&
      typeof target.rootId === 'string' && Array.isArray(target.path) &&
      target.path.length === 0) &&
    new Set(value.selection.map(target => target.rootId)).size === value.selection.length &&
    value.selection.every(target => value.project.nodes.some(node => node?.id === target.rootId));
  if (!valid) throw Error('Ungültige Projektkopie für die Übung.');
  const draft=value.sketchDraft;
  if (draft!==undefined) {
    const sketch=draft?.sketch, target=draft?.target;
    const source=target&&value.project.nodes.find(node=>node.id===target.rootId);
    const validTarget=target===undefined ? value.selection.length===0 :
      target && value.selection.length===1 && Object.keys(target).length===2 &&
      value.selection[0].rootId===target.rootId && Array.isArray(target.path) && !target.path.length &&
      source?.kind==='cad' && source.recipe?.type==='sketch' && !source.locked;
    if (!draft || Object.keys(draft).some(key=>!['sketch','target'].includes(key)) || !validTarget ||
        sketch?.kind!=='profile' || ![2,3,4].includes(sketch.version) ||
        !Array.isArray(sketch.elements) || sketch.elements.length>128 ||
        !Array.isArray(sketch.loops) || sketch.loops.length>64 ||
        sketch.loops.some(loop=>!Array.isArray(loop?.elements)||loop.elements.length>128) ||
        !Array.isArray(sketch.variables) || sketch.variables.length>40 ||
        Buffer.byteLength(JSON.stringify(draft))>256*1024) {
      throw Error('Ungültiger Skizzenentwurf für die Übung.');
    }
  }
  if (Buffer.byteLength(JSON.stringify(value)) > maximumBytes) {
    throw Error('Die Projektkopie für die Übung ist größer als 256 MiB.');
  }
  return structuredClone(value);
}

module.exports = {validatePracticeProjectCopy,validatePracticeResultProject};
