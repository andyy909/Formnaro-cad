// Historical Formnaro catalog, 2026-11-04. Same three workflows, different
// practice profiles and app revisions. Runs without a model request are excluded.
const samples = {
  'mistral-vibe:mistral-large-4': { cad: [3, 3], photo: [1, 1] },
  'https://api.deepseek.com:deepseek-flash': { cad: [10, 15], photo: [3, 4] },
};

export function modelPracticeSample(provider, model, scope) {
  return samples[provider + ':' + model]?.[scope];
}
