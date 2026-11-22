import { defaultModelCheckConfig } from './ai-model-check-config.js';

export const stlChallengeKind = 'stl-challenge';
export const stlChallengeLabel = 'STL-Diagnose (v1)';
export const stlChallengeProfiles = {
  lab: 'Feste Laborprüfung',
  standard: 'Modellprüfungen · Standard',
  surface: 'Modellprüfungen · zusätzlich Oberfläche',
  freecad: 'Modellprüfungen · zusätzlich FreeCAD',
  volume: 'Modellprüfungen · zusätzlich Volumen',
};

export function stlChallengeModelChecks(profile) {
  if (!Object.hasOwn(stlChallengeProfiles, profile)) throw Error('Unbekannte Prüfkonfiguration.');
  if (profile === 'lab') return null;
  const config = { ...defaultModelCheckConfig(), visual: false, photo: false, maxCorrections: 1 };
  if (profile === 'surface') config.checks.surfaceDeviation = true;
  if (profile === 'freecad') config.freecad = true;
  if (profile === 'volume') config.checks.volume = true;
  return config;
}

export const stlChallengeTasks = [
  ['stl-single-seat', 'Einzelne Kegelsenkung außerhalb der Mitte', '01-Einzelne-Kegelsenkung.stl', 240],
  ['stl-rotated-key', 'Räumlich gedrehte Passplatte mit Stufe, Kerbe und Sackloch', '02-Gedrehte-Passplatte.stl', 285],
  ['stl-blind-junction', 'Zwei verbundene Sackbohrungen und ein getrenntes Sackloch', '03-Sackloch-T-Verbindung.stl', 285],
  ['stl-nested-pocket', 'Versetzte Tasche mit Rundung und zwei Bodenhöhen', '04-Versetzte-Stufentasche.stl', 270],
  ['stl-grooved-flange', 'Drehteil mit zwei Ringnuten, Senkung und Querbohrung', '05-Drehteil-mit-Ringnuten.stl', 300],
].map(([id, label, file, seconds]) => ({
  id, label, file, seconds, requests: 4, freeAnalysisRequests: 1, check: 'stl-challenge',
}));

export const stlChallengeLimits = {
  minutes: 48, requests: 40, maxModelRequests: 60, attempts: 2, version: 1, photos: false, label: stlChallengeLabel,
};
export const stlChallengeLadders = new Map([['STL-Grenze', { label: stlChallengeLabel, tasks: stlChallengeTasks }]]);
