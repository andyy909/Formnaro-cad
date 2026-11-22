import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const LIMIT_BYTES = 40 * 1024;
const INPUT = 3000;
const REASONING = 1500;

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/shrink-lab-run.mjs <eingabe.json> <ausgabe.json>');
  process.exit(2);
}

const truncate = (value, length) => (typeof value === 'string' && value.length > length ? value.slice(0, length) : value);
const isImage = (value) => typeof value === 'string' && value.startsWith('data:image/');

// Remove image payloads wherever a kept field still carries one.
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (['image', 'imageFile', 'images'].includes(key)) continue;
      result[key] = clean(entry);
    }
    return result;
  }
  return isImage(value) ? '[Bilddaten entfernt]' : value;
}

function shrinkEvent(event, firstReasoning) {
  switch (event.type) {
    case 'start-context':
      return { type: 'start-context', user: truncate(event.user, INPUT) };
    case 'reasoning':
      if (firstReasoning === false) return null;
      return { type: 'reasoning', text: truncate(event.text, REASONING) };
    case 'proposal':
      return clean({ type: 'proposal', plan: event.plan, ms: event.ms });
    case 'practice-ui-feedback':
      return clean({
        type: 'practice-ui-feedback',
        phase: event.phase,
        round: event.round,
        verification: event.verification,
        freshRevision: event.freshRevision,
        ms: event.ms,
      });
    case 'format-feedback':
      return clean({ type: 'format-feedback', round: event.round, error: event.error, attempt: event.attempt, ms: event.ms });
    case 'blocker-diagnosis':
      return clean({ type: 'blocker-diagnosis', text: event.text, round: event.round, ms: event.ms });
    case 'finished':
      return clean({
        type: 'finished',
        status: event.status,
        elapsedMs: event.elapsedMs,
        cleanExit: event.cleanExit,
        close: event.close,
        ms: event.ms,
      });
    case 'request':
      return { type: 'request', round: event.round, ms: event.ms };
    case 'usage':
      return clean({ type: 'usage', round: event.round, usage: event.usage, returnedModel: event.returnedModel, role: event.role });
    default:
      return null;
  }
}

const record = JSON.parse(readFileSync(input, 'utf8'));
const events = [];
let reasoningSeen = false;
for (const event of record.events ?? []) {
  const shrunk = shrinkEvent(event, reasoningSeen ? false : true);
  if (!shrunk) continue;
  if (event.type === 'reasoning') reasoningSeen = true;
  events.push(shrunk);
}

const result = clean({
  id: record.id,
  spec: { caseId: record.spec?.caseId, effort: record.spec?.effort, seriesName: record.spec?.seriesName },
  status: record.status,
  error: record.error,
  cleanExit: record.cleanExit,
  close: record.close,
  verification: record.verification,
  modelIdentity: record.modelIdentity,
  finalMessage: record.finalMessage,
  firstReasoningMs: record.firstReasoningMs,
  elapsedMs: record.elapsedMs,
  events,
});

let text = JSON.stringify(result, null, 2);
if (Buffer.byteLength(text) > LIMIT_BYTES) text = JSON.stringify(result);
if (Buffer.byteLength(text) > LIMIT_BYTES) throw new Error('Der verkleinerte Lauf ist größer als 40 KB: ' + output);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, text + '\n');
console.log(`${output}: ${Buffer.byteLength(text)} Bytes, ${events.length} Ereignisse`);
