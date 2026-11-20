const fs = require('node:fs');
const bundled = require('./ai-provider-rates.json');

const providerHosts = {
  'api.openai.com': ['developers.openai.com', 'openai.com'],
  'api.mistral.ai': ['docs.mistral.ai', 'mistral.ai'],
  'api.deepseek.com': ['api-docs.deepseek.com'],
};
const extras = ['cached', 'write5', 'write60', 'peakMultiplier'];
const validModel = (name) => /^[a-zA-Z0-9][\w.-]{0,149}$/.test(name);
const validPrice = (value) => Number.isFinite(value) && value >= 0 && value <= 10000;
const day = /^\d{4}-\d{2}-\d{2}$/;
let local = {};

function validateRates(value, today) {
  if (value?.version !== 1 || !value.providers || typeof value.providers !== 'object')
    throw Error('Ungültige Tarifdatei.');
  for (const [host, entry] of Object.entries(value.providers)) {
    const source = new URL(entry.source);
    if (
      !Object.hasOwn(providerHosts, host) ||
      !providerHosts[host].includes(source.hostname) ||
      source.protocol !== 'https:' ||
      source.username ||
      source.password ||
      source.port ||
      !day.test(entry.verified) ||
      !Number.isFinite(Date.parse(entry.verified)) ||
      new Date(entry.verified).toISOString().slice(0, 10) !== entry.verified ||
      entry.verified > today ||
      entry.verified < bundled.providers[host].verified ||
      !entry.models ||
      typeof entry.models !== 'object'
    )
      throw Error('Unbekannter Anbieter, ungültige Quelle oder älterer Tarifstand.');
    for (const [name, row] of Object.entries(entry.models)) {
      if (!validModel(name)) throw Error('Ungültige Modellkennung.');
      if (typeof row === 'string') {
        if (!Object.hasOwn(entry.models, row) || typeof entry.models[row] !== 'object' || !entry.models[row])
          throw Error('Tarifalias muss auf einen eigenen Modelleintrag zeigen.');
        continue;
      }
      if (
        !row ||
        !validPrice(row.input) ||
        !validPrice(row.output) ||
        Object.keys(row).some((key) => !['input', 'output', ...extras].includes(key) || !validPrice(row[key])) ||
        (row.peakMultiplier !== undefined && row.peakMultiplier < 1)
      )
        throw Error('Ungültiger Tokenpreis.');
    }
  }
  return value.providers;
}

function loadLocalRates(file, today = new Date().toISOString().slice(0, 10)) {
  local = {};
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 128 * 1024) return false;
    local = validateRates(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), today);
    return true;
  } catch {
    return false;
  }
}
function catalogRate(host, model) {
  for (const entry of [local[host], bundled.providers[host]]) {
    if (!entry || !Object.hasOwn(entry.models, model)) continue;
    const row = entry.models[model];
    const rate = typeof row === 'string' ? entry.models[row] : row;
    return { ...rate, source: entry.source, rateDate: entry.verified };
  }
  return null;
}

module.exports = { catalogRate, loadLocalRates, validateRates };
