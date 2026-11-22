import { compactLadders } from './cad-lab-compact-plan.js';

export const fittingKind = 'cad-fitting-skill';
export const fittingLabel = 'CAD-Passung · Skill-Vergleich';
export const fittingSkill = Object.freeze({
  id: 'formnaro-messen-und-einpassen',
  version: 1,
  instructions:
    'Use the current scene to find the actual source IDs for the faces defining the fit. For axis-aligned faces, measure the relevant sources together using options.targets. Read their individual world min/max from byId, derive the clear opening from the inner faces, then subtract the specified play on each side. Place the underside at the measured support face plus bottom clearance. Preview and check the fit and retained parts.',
});

const slide = compactLadders.get('Plattengrenze').tasks.find(({ id }) => id === 'fixture-2');
const pocket = {
  id: 'fitting-pocket',
  check: 'fitting-pocket',
  label: 'Einsatz in eine versetzte Tasche einpassen',
  seconds: 125,
  requests: 2,
};
const tasks = [[slide, 'control'], [slide, 'skill'], [pocket, 'skill'], [pocket, 'control']].map(([task, fittingVariant]) => ({
  ...task,
  id: task.id + '-' + fittingVariant,
  label: task.label + (fittingVariant === 'skill' ? ' · B mit Skill' : ' · A heutiger Kontext'),
  fittingVariant,
}));
export const fittingLimits = {
  label: fittingLabel,
  version: 1,
  minutes: 9,
  requests: 8,
  maxModelRequests: 12,
  attempts: 1,
  photos: false,
};
export const fittingLadders = new Map([['Plattengrenze', { label: fittingLabel, tasks }]]);
