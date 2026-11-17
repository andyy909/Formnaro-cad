import development from './lab-development-check.json' with { type: 'json' };
import practice from './practice-function-tests.json' with { type: 'json' };

export const developmentCaseIds = Object.freeze([...development.caseIds]);
const exercises = practice.map(task => task.id);

export const quickPlans = Object.freeze([
  {id:'basic', label:'Grundcheck', caseIds:['drill','sketch','assembly']},
  {id:'development', label:'Entwicklungscheck', caseIds:developmentCaseIds},
  {id:'practice', label:'Übungsfunktionen', caseIds:exercises},
  {id:'full', label:'Volltest', caseIds:[...developmentCaseIds,...exercises]},
]);

export function quickPlan(id, modeler, effort='low'){
  const definition=quickPlans.find(plan=>plan.id===id);
  if(!definition)throw new Error('Unbekannter Laborplan.');
  return {
    ...structuredClone(development),
    name:definition.label,
    caseIds:[...definition.caseIds],
    efforts:[effort],
    roles:{...development.roles,modeler:{...modeler,effort:'series'}},
  };
}
