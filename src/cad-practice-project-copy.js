import {taskCandidateNodeKey,validateTaskCandidate} from './cad-ai-task-candidate.js';
import {flags} from './organization.js';
import {cadProjectRevision} from './cad-project.js';

const projectSections={
  bed:'Arbeitsfläche',workplane:'Arbeitsebene',coordinateMode:'Koordinatensystem',ruler:'Lineal',
  drawings:'Zeichnungen',projectParameters:'Projektparameter',contourLinks:'Konturverknüpfungen',
  joints:'Gelenke und Kopplungen',photos:'Fotos',featureReferences:'Merkmalsbezüge',
  linkedPatterns:'Verknüpfte Muster',inspection:'Prüfungen'
};

export function inspectCadPracticeResult({project:baseline,selection}, value, expectedRevision) {
  const {project}=validateTaskCandidate(value);
  if(cadProjectRevision(project)!==expectedRevision)throw Error('Übungsergebnis gehört zu einem anderen Modellstand.');
  const permitted=new Set(selection.map(target=>target.rootId));
  const prior=new Map(baseline.nodes.map(node=>[node.id,node]));
  const next=new Map(project.nodes.map(node=>[node.id,node]));
  const parts=[];
  const containsLock=node=>node.locked||node.children?.some(containsLock);
  for(const node of baseline.nodes){
    const updated=next.get(node.id);
    if(updated&&taskCandidateNodeKey(node)===taskCandidateNodeKey(updated))continue;
    if(!permitted.has(node.id)||flags(node,baseline).locked||containsLock(node)){
      throw Error('Die Übung hat ein unbeteiligtes oder gesperrtes Teil verändert: '+node.name);
    }
    parts.push({id:node.id,name:updated?.name??node.name,status:updated?'changed':'removed'});
  }
  for(const node of project.nodes){
    if(!prior.has(node.id))parts.push({id:node.id,name:node.name,status:'added'});
  }
  const sections=[];
  for(const key of new Set([...Object.keys(baseline),...Object.keys(project)])){
    if(['nodes','version'].includes(key)||JSON.stringify(baseline[key])===JSON.stringify(project[key]))continue;
    if(!Object.hasOwn(projectSections,key))throw Error('Die Übung hat geschützte Projektdaten verändert: '+key);
    sections.push(projectSections[key]);
  }
  return {project,parts,sections};
}

// The planner gets only selected child aliases. Internal joint IDs, frames
// and the complete drive graph remain in the local exercise project.
function practiceMotion(project,selection){
  const aliases=new Map(selection.map(({rootId},index)=>[rootId,'existing-'+(index+1)]));
  const selected=(project.joints?.joints??[]).filter(joint=>joint.kind!=='fixed'&&aliases.has(joint.childId));
  if(!selected.length)return undefined;
  const byJoint=new Map(selected.map(joint=>[joint.id,aliases.get(joint.childId)]));
  const joints=selected.map(({childId,name,kind,value,limits})=>({
    child:aliases.get(childId),name:name.slice(0,120),kind,value,limits:structuredClone(limits)
  }));
  const screws=(project.joints.drives??[]).filter(drive=>drive.kind==='screw'&&(byJoint.has(drive.rotary)||byJoint.has(drive.linear)))
    .map(({rotary,linear,lead,direction})=>({rotary:byJoint.get(rotary)??null,linear:byJoint.get(linear)??null,lead,direction}));
  return {joints,screws};
}

export async function captureCadPracticeCopy(controller, getSelection, {allowEmpty=false,draft}={}) {
  const scope = controller.projectScope();
  const revision = controller.revision();
  const initialSelection = structuredClone(getSelection());
  const selection = draft ? (draft.data.target ? [structuredClone(draft.data.target)] : []) : initialSelection;
  if ((!allowEmpty&&!draft&&!selection.length) || selection.length > 8 || selection.some(target => target.path.length)) {
    throw Error('Für die Projektübung bitte ein bis acht vollständige Bauteile im Modellbaum auswählen.');
  }
  const assertBase = () => {
    if (scope !== controller.projectScope() || revision !== controller.revision()) {
      throw Object.assign(Error('Das Ausgangsprojekt wurde geändert. Übung auf dem aktuellen Stand neu starten.'), {code:'STALE_REVISION'});
    }
    draft?.assertCurrent();
  };
  const assertCurrent = () => {
    assertBase();
    if (JSON.stringify(initialSelection) !== JSON.stringify(getSelection())) {
      throw Object.assign(Error('Projekt oder Auswahl seit Beginn der Übung geändert.'), {code: 'STALE_REVISION'});
    }
  };
  const project = await controller.transactions.materialize();
  assertCurrent();
  const objects = selection.map(({rootId}, index) => {
    const node = project.nodes.find(node => node.id === rootId);
    if (!node) throw Error('Ausgewähltes Bauteil fehlt in der Projektkopie.');
    return {alias: 'existing-' + (index + 1), name: node.name.slice(0, 120), kind: node.kind};
  });
  const motion=draft?undefined:practiceMotion(project,selection);
  return {
    projectCopy: {revision, project, selection, ...(draft?{sketchDraft:structuredClone(draft.data)}:{})},
    objects, assertCurrent, assertBase, ...(draft?{sketchFeedback:draft.feedback}:{}), ...(motion?{motion}:{})
  };
}
