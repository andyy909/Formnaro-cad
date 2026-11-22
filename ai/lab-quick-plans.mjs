import development from './lab-development-check.json' with { type: 'json' };
import practice from './practice-function-tests.json' with { type: 'json' };
import {lookupToolReference} from './formnaro-tool-reference.mjs';

export const developmentCaseIds = Object.freeze([...development.caseIds]);
const exercises = practice.map(task => task.id);

export const developmentGroupingTasks = Object.freeze({
  'advanced-01':'Platte 60×40×10 mm mit drei asymmetrischen Bohrungen',
  'advanced-03':'Zylinder Ø10×12 mm mit Ø4-Bohrung und acht Hülsen auf einem Kreis',
});

function groupingContext(caseIds){
  const tasks=Object.entries(developmentGroupingTasks).filter(([id])=>caseIds.includes(id)).map(([,task])=>task);
  if(!tasks.length)return '';
  const {tool}=lookupToolReference({tool:'tool:group'},{practice:true});
  return [
    'Zusätzliche Werkzeugauskunft nur für diese Modellieraufträge: '+tasks.join('; ')+'.',
    JSON.stringify(tool),
  ].join('\n');
}

export const quickPlans = Object.freeze([
  {id:'basic', label:'Grundcheck', caseIds:['drill','sketch','assembly']},
  {id:'development', label:'Entwicklungscheck', caseIds:developmentCaseIds},
  {id:'practice', label:'Übungsfunktionen', caseIds:exercises},
  {id:'full', label:'Volltest', caseIds:[...developmentCaseIds,...exercises]},
]);

export function quickPlan(id, modeler, effort='low', caseIds){
  const definition=quickPlans.find(plan=>plan.id===id);
  if(!definition)throw new Error('Unbekannter Laborplan.');
  const cases=caseIds??definition.caseIds;
  return {
    ...structuredClone(development),
    name:definition.label,
    caseIds:[...cases],
    customContext:groupingContext(cases),
    efforts:[effort],
    roles:{...development.roles,modeler:{...modeler,effort:'series'}},
  };
}
