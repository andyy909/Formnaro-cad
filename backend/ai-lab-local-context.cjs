'use strict';

const { LOCAL_CONTEXT_TOKENS } = require('./portable-ai.cjs');
const { SYSTEM } = require('./ai-mcp-agent.cjs');
const { METHODS, CONTRACT } = require('./ai-lab-response.cjs');

function localAgentSystem(entry) {
  return [
    SYSTEM.replace('or {"message":"your final answer"}', 'or {"status":"completed","message":"your final answer"}'),
    CONTRACT,
    'Available tools: ' + METHODS.map(name => 'offlinecad_' + name).join(', '),
    'Use offlinecad_command_info with {"command":"operation"} for an individual CAD command schema. '
      + 'Use offlinecad_tool_info with {"query":"tool name or purpose"} for a tool; use offlinecad_scene for current targets. '
      + 'offlinecad_preview takes {"revision":"current revision","commands":[...]}; '
      + 'offlinecad_apply takes {"previewId":"owned preview","revision":"preview base revision"}.',
    entry.text,
  ].join('\n');
}

function localAgentScene(scene) {
  if (Buffer.byteLength(JSON.stringify(scene),'utf8') <= 8192) return scene;
  const selectionTargets = (scene.selectionTargets ?? []).slice(0, 8);
  const selected = new Set(selectionTargets.map(target => JSON.stringify(target)));
  const allObjects = scene.objects ?? [];
  const objects = [...allObjects.filter(object => selected.has(JSON.stringify(object.target))),
    ...allObjects.filter(object => !selected.has(JSON.stringify(object.target)))].slice(0, 8);
  return {
    revision: scene.revision, units: scene.units, coordinateMode: scene.coordinateMode,
    workplane: scene.workplane, selectionTargets,
    selectionCount: scene.selectionTargets?.length ?? 0, objectCount: allObjects.length, summarized: true,
    objects: objects.map(object => ({
      target: object.target, name: object.name?.slice(0, 80), kind: object.kind, type: object.type,
      worldBounds: object.worldBounds, editSize: object.measures?.editSize,
      hidden: object.hidden, locked: object.locked,
    })),
  };
}

function mergeUserTurns(messages) {
  const merged = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (message.role === 'user' && previous?.role === 'user') {
      merged[merged.length - 1] = { role: 'user', content: previous.content + '\n\n' + message.content };
    } else {
      merged.push(message);
    }
  }
  return merged;
}

async function fitLocalChat({ messages, outputBudget, post, onDiagnostic }) {
  // Keep the original task and current tool feedback when older turns are removed.
  const firstUser = messages[1];
  const last = messages.at(-1);
  const recent = messages.slice(2, -1);
  const minimumOutput = Math.min(outputBudget, 512);
  let droppedTurns = 0;
  for (;;) {
    const retained = messages.length <= 2 ? messages : [messages[0], firstUser, ...recent.slice(droppedTurns), last];
    const fitted = mergeUserTurns(retained);
    const { prompt } = await post('/apply-template', { messages: fitted });
    if (typeof prompt !== 'string') throw Error('Die lokale KI-Laufzeit lieferte keine Chat-Vorlage.');
    const { tokens } = await post('/tokenize', { content: prompt, add_special: true, parse_special: true });
    if (!Array.isArray(tokens)) throw Error('Die lokale KI-Laufzeit lieferte keine Tokenzahl.');
    // Reserve a few tokens for special-token handling at the completion boundary.
    const remaining = LOCAL_CONTEXT_TOKENS - tokens.length - 16;
    if (remaining >= minimumOutput) {
      const maxTokens = Math.min(outputBudget, remaining);
      onDiagnostic?.({ type: 'context-budget', contextTokens: LOCAL_CONTEXT_TOKENS,
        inputTokens: tokens.length, outputTokens: maxTokens, droppedTurns });
      return { messages: fitted, maxTokens };
    }
    if (droppedTurns < recent.length) {
      // A retained history starts with a user turn; never leave an orphaned reply.
      droppedTurns++;
      while (recent[droppedTurns]?.role === 'assistant') droppedTurns++;
      continue;
    }
    onDiagnostic?.({ type: 'context-budget', contextTokens: LOCAL_CONTEXT_TOKENS,
      inputTokens: tokens.length, outputTokens: 0, droppedTurns });
    throw Object.assign(Error(`Kontextlimit der lokalen KI: ${tokens.length} Eingabetokens, ${LOCAL_CONTEXT_TOKENS} Kontexttokens. Auftrag oder Werkzeugausgabe kürzen.`),
      { code: 'AI_PROVIDER_CONTEXT_LIMIT' });
  }
}

module.exports = { localAgentSystem, localAgentScene, fitLocalChat };
