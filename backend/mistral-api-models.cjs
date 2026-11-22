const { reasoningEfforts } = require('./ai-reasoning.cjs');

const MODEL_NAMES = {
  'mistral-large-4': 'Mistral Large 4',
  'mistral-large-4-0': 'Mistral Large 4',
  'mistral-large-2512': 'Mistral Large 3',
  'mistral-medium-3-5': 'Mistral Medium 3.5',
  'mistral-small-2603': 'Mistral Small 4',
  'codestral-2508': 'Codestral',
  'ministral-14b-2512': 'Ministral 3 14B',
  'ministral-8b-2512': 'Ministral 3 8B',
  'ministral-3b-2512': 'Ministral 3 3B',
  'deepseek-v4-1-flash-1017': 'DeepSeek V4.1 Flash 1017',
  'zai-glm-5-3': 'Z.ai GLM 5.3',
  'zai-glm-5-3-flash': 'Z.ai GLM 5.3 Flash',
  'glm-5-2': 'Z.ai GLM 5.2',
};

// Estimated Text-to-CAD suitability. The order is independent of the active model.
const CAD_ORDER = [
  'mistral-large-4', 'mistral-large-4-0', 'mistral-large-latest',
  'deepseek-v4-1-flash-1017',
  'zai-glm-5-3', 'zai-glm-5', 'zai-glm-latest',
  'mistral-medium-3-5', 'mistral-medium-3.5', 'mistral-medium-2604', 'mistral-medium-latest',
  'mistral-small-2603', 'mistral-small-latest',
  'zai-glm-5-3-flash',
  'glm-5-2', 'zai-glm-5-2',
  'mistral-large-2512',
  'codestral-2508', 'codestral-latest',
  'ministral-14b-2512', 'ministral-14b-latest',
  'ministral-8b-2512', 'ministral-8b-latest',
  'ministral-3b-2512', 'ministral-3b-latest',
];

function groupMistralModels(config, models) {
  const byId = new Map(models.map(model => [model.id, model]));
  const links = new Map([...byId.keys()].map(id => [id, new Set()]));
  for (const model of byId.values()) {
    for (const alias of model.aliases ?? []) {
      if (!byId.has(alias) || byId.get(alias).name !== model.name) continue;
      links.get(model.id).add(alias);
      links.get(alias).add(model.id);
    }
  }

  const groups = [];
  const seen = new Set();
  for (const id of byId.keys()) {
    if (seen.has(id)) continue;
    const members = new Set([id]);
    for (const member of members) {
      seen.add(member);
      for (const alias of links.get(member)) members.add(alias);
    }
    const rows = [...members].map(member => byId.get(member));
    const primary = rows.find(row => row.id === row.name && !row.id.endsWith('-latest'))
      ?? rows.find(row => Object.hasOwn(MODEL_NAMES, row.id))
      ?? rows.find(row => row.id === row.name)
      ?? rows[0];
    const routes = new Map();
    for (const row of [primary, ...rows.filter(row => row !== primary)]) {
      for (const effort of reasoningEfforts({ ...config, model: row.id }, row)) {
        if (!routes.has(effort)) routes.set(effort, row.id);
      }
    }
    groups.push({
      id: primary.id,
      name: Object.hasOwn(MODEL_NAMES, primary.id) ? MODEL_NAMES[primary.id] : primary.name ?? primary.id,
      input_modalities: primary.input_modalities,
      aliases: [...members].filter(member => member !== primary.id),
      supported_reasoning_levels: [...routes.keys()],
      reasoningModelIds: Object.fromEntries(routes),
    });
  }
  const rank = model => {
    const ids = new Set([model.id, ...model.aliases]);
    const index = CAD_ORDER.findIndex(id => ids.has(id));
    return index < 0 ? CAD_ORDER.length : index;
  };
  return groups.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function modelForReasoning(config, detail, effort) {
  if (!detail?.reasoningModelIds || config.authMode === 'mistral-vibe') return config;
  const model = effort ? detail.reasoningModelIds[effort] ?? config.model : detail.id;
  return model === config.model ? config : { ...config, model };
}

module.exports = { groupMistralModels, modelForReasoning };
