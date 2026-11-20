import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { developmentGroupingTasks } from '../ai/lab-quick-plans.mjs';

const require = createRequire(import.meta.url);
const { definitions } = require('../backend/ai-benchmark-advanced-cases.cjs');
const { referenceCommands } = require('../tests/fixtures/benchmark-advanced-reference.cjs');
const { caseIds } = require('../ai/lab-development-check.json');

const TARGET = 'existing-1';

// The geometric reference builds visible UI commands. Only the grouping step is
// mapped to a tool the task has to announce; cuts with solid:false exist only to
// be grouped, so a missing group tool is exactly the case this check looks for.
export function requiredTools(id) {
  let commands;
  try {
    commands = referenceCommands(id, TARGET);
  } catch {
    return null;
  }
  const tools = new Set();
  for (const command of Array.isArray(commands) ? commands : []) if (command?.op === 'group') tools.add('tool:group');
  return tools;
}

export function checkDevelopmentTasks(ids = caseIds) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return ids.map((id) => {
    const definition = byId.get(id);
    if (!definition) return `${id}: keine Referenz`;
    const tools = requiredTools(id);
    if (!tools) return `${id}: keine Referenz`;
    const declared = new Set(definition.toolIds);
    if (Object.hasOwn(developmentGroupingTasks, id)) declared.add('tool:group');
    const missing = [...tools].filter((tool) => !declared.has(tool));
    return missing.length
      ? `${id}: Referenz braucht ${missing.join(', ')}, Aufgabe nennt nur ${definition.toolIds.join(', ') || 'keine'}`
      : `${id}: ok`;
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  for (const line of checkDevelopmentTasks()) console.log(line);
}
