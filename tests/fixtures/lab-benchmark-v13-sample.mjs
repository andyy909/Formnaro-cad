// Saved-report fixture rebuilt from docs/benchmarks/modellvergleich-v13.md.
// P solved, F failed, E error, O open, N never started (no saved stage).
export const sampleDomains = {
  Plattengrenze: ['fixture-3', 'fixture-5', 'fixture-1', 'fixture-6', 'bore-oblique', 'plate-drawing', 'fixture-2',
    'fixture-7', 'fixture-4', 'bore-final-fit', 'fixture-8', 'fixture-9'],
  'STL-Grenze': ['converter-selected', 'converter-find', 'converter-cone', 'stl-countersinks', 'stl-rim', 'stl-cross-drilled'],
  Zeichnungsgrenze: ['drawing-views', 'drawing-dimensions', 'drawing-section', 'drawing-assembly', 'drawing-detail',
    'drawing-revision', 'drawing-linked-revision'],
};

export const sampleRuns = [
  { id: '21fe9f9e', model: 'GPT-6.2 Sol', effort: 'medium', usd: 1.7347, seconds: 679.6, tokens: 22088 },
  { id: 'a7a9e5b8', model: 'GPT-6.1 Terra', effort: 'medium', usd: 0.5837, seconds: 502.2, tokens: 14719 },
  { id: 'eb595234', model: 'GPT-6.1 Terra', effort: 'medium', usd: 0.5817, seconds: 513.9, tokens: 15019 },
  { id: '16ca7893', model: 'DeepSeek Flash', effort: 'low', usd: 0.1487, seconds: 675.2, tokens: 85311 },
  { id: '93ccb010', model: 'DeepSeek Flash', effort: 'low', usd: 0.1689, seconds: 645.7, tokens: 100085 },
  { id: 'afa009ae', model: 'DeepSeek Flash', effort: 'low', usd: 0.1618, seconds: 744.9, tokens: 92891 },
  { id: '37215eb6', model: 'DeepSeek Flash', effort: 'high', usd: 0.1834, seconds: 893.7, tokens: 118225 },
  { id: '45754961', model: 'Mistral Large 4', effort: 'medium', usd: 0.3666, seconds: 1080.0, tokens: 74122 },
];

export const sampleOutcomes = {
  'fixture-3': 'PPPPPPPP', 'fixture-5': 'PPPPPPPP', 'bore-oblique': 'PPPPPPPP', 'converter-selected': 'PPPPPPPP',
  'converter-cone': 'PPPPPPPP', 'drawing-views': 'PPPPPPPP', 'drawing-section': 'PPPPPPPP', 'drawing-assembly': 'PPPPPPPP',
  'fixture-6': 'PPPPPPFP', 'converter-find': 'PPPPPEPP', 'drawing-dimensions': 'PPPPFPPP', 'drawing-detail': 'PPPPPEPP',
  'plate-drawing': 'PPFPPFPP', 'fixture-2': 'PPPEPEPP', 'drawing-revision': 'PPPPPEPO', 'fixture-1': 'PPPEEPPE',
  'fixture-7': 'PPPFPFPF', 'fixture-4': 'PPPFFFPP', 'bore-final-fit': 'PPPFFOPP', 'fixture-9': 'PPPPEEPO',
  'drawing-linked-revision': 'PPPEPEPN', 'fixture-8': 'PPFFFPFP', 'stl-cross-drilled': 'PEEPPPON',
  'stl-countersinks': 'PFFOPOFF', 'stl-rim': 'EFFFEEOO',
};

const uuid = (prefix, n) => prefix + '-0000-4000-8000-' + String(n).padStart(12, '0');
const statusOf = { P: 'passed', F: 'failed', E: 'error' };

// Returns saved Zusatzpruefung reports exactly as the compact benchmark stores
// them: one report per stage, the last one carrying the settled simpleRun.
export function sampleReports({ startedAt = Date.parse('2026-11-20T08:00:00Z') } = {}) {
  const reports = [];
  sampleRuns.forEach((run, index) => {
    const requests = 25;
    const domainIds = Object.keys(sampleDomains);
    const simpleRun = {
      id: uuid(run.id, 0), kind: 'compact', model: run.model, efforts: [run.effort], status: 'running',
      plan: { version: 13, domains: Object.fromEntries(Object.entries(sampleDomains).map(([id, tasks]) => [id, {
        label: id, tasks: tasks.map((task) => ({ id: task, label: task })),
      }])) },
      domains: domainIds.map((id, d) => ({ id, label: id, status: 'finished', results: { [run.effort]: {
        effortTokens: {
          requests: d ? 0 : requests,
          costUSD: d ? undefined : { min: run.usd * 0.8, max: run.usd, reported: requests, subscription: false },
          outputTokens: { tokens: d ? 0 : run.tokens, reported: d ? 0 : requests },
          inputTokens: { tokens: 0, reported: 0 }, cachedInputTokens: { tokens: 0, reported: 0 }, reasoningTokens: { tokens: 0, reported: 0 },
        },
        modelMs: d ? 0 : Math.round(run.seconds * 700), localMs: d ? 0 : Math.round(run.seconds * 1000) - Math.round(run.seconds * 700),
      } } })),
    };
    let n = 0;
    let last = null;
    for (const [domain, tasks] of Object.entries(sampleDomains)) {
      tasks.forEach((taskId, level) => {
        const code = sampleOutcomes[taskId][index];
        if (code === 'N') return;
        n++;
        const time = new Date(startedAt + index * 3600000 + n * 60000).toISOString();
        last = {
          id: uuid(run.id, n), mode: 'live', connection: { model: run.model, providerId: 'sample' },
          benchmark: { id: domain, label: domain, version: 13 }, campaign: uuid(run.id, 100 + n),
          simpleRun: structuredClone(simpleRun), effort: run.effort, level: level + 1, task: taskId, taskId,
          caseIds: ['ladder-' + (level + 1) + '-1'],
          results: code === 'O' ? [] : [{ id: 'ladder-' + (level + 1) + '-1', status: statusOf[code] }],
          status: code === 'O' ? 'interrupted' : 'completed', startedAt: time, endedAt: time,
        };
        reports.push(last);
      });
    }
    last.simpleRun.status = 'finished';
    last.simpleRun.elapsedMs = Math.round(run.seconds * 1000);
  });
  return reports;
}
