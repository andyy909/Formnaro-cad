import { addTokenUsage, createTokenTotals, mergeTokenTotals } from '../ai/lab-token-totals.mjs';

function brief(value, limit, indent) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, indent);
  return text?.length > limit ? { excerpt: text.slice(0, limit), truncated: true } : value;
}

const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;

export function measureLabRequests(runtime, row, { trackTiming = false, detailed = false, captureContextSize = false } = {}) {
  row.tokens = createTokenTotals();
  if (trackTiming) row.requestEvidence = [];
  return {
    ...runtime,
    ...(runtime.generate ? {
      generate: async (args) => {
        const at = performance.now();
        let usage;
        let rejectedBeforeSend = false;
        const evidence = trackTiming && row.requestEvidence.length < (detailed ? 12 : 8) ? {
          ...(args.context?.activeSkill ? { skill: { id: args.context.activeSkill.id, version: args.context.activeSkill.version } } : {}),
          prompt: brief(args.prompt, 3000), correction: brief(args.correction, 1800),
          images: args.images?.length, sceneRevision: args.scene?.revision,
          ...(captureContextSize ? { contextBytes: jsonBytes(args.context), sceneBytes: jsonBytes(args.scene) } : {}),
        } : null;
        const abort = () => { row.interruptedDuring = 'model'; };
        if (trackTiming) runtime.signal?.addEventListener('abort', abort, { once: true });
        try {
          const reply = await runtime.generate(args);
          usage = reply.usage;
          if (evidence) {
            const { revision, label, commands, checks, message, question, analysis, assistant } = reply;
            if (detailed) {
              evidence.responseKind = analysis ? 'analysis' : commands ? 'commands'
                : question ? 'question' : message ? 'message' : 'other';
            }
            evidence.reply = brief({ revision, label, commands, checks, message, question, analysis, assistant }, detailed ? 18000 : 4500, detailed ? 2 : undefined);
          }
          if (usage?.effort != null) row.effectiveEffort = usage.effort;
          return reply;
        } catch (error) {
          usage = error.aiUsage;
          rejectedBeforeSend = error.code === 'LAB_PRICE_BUDGET' && !usage || (detailed && usage?.benchmarkModelRequests === 0);
          if (evidence) {
            evidence.error = { code: error.code, message: brief(error.message, 1200) };
            if (detailed) evidence.responseKind = error.code === 'AI_OUTPUT_INVALID' ? 'invalid' : 'none';
            if (detailed && usage?.benchmarkInvalidReply !== undefined) {
              const { benchmarkInvalidReply, ...reportedUsage } = usage;
              evidence.invalidReply = benchmarkInvalidReply;
              usage = reportedUsage;
            }
          }
          if (trackTiming && error.code === 'AI_OUTPUT_INVALID' && /output was truncated/i.test(error.message))
            row.outputLimitReached = true;
          throw error;
        } finally {
          if (trackTiming) runtime.signal?.removeEventListener('abort', abort);
          if (!rejectedBeforeSend) addTokenUsage(row.tokens, usage);
          row.requests = row.tokens.requests;
          const elapsedMs = Math.round(performance.now() - at);
          row.modelMs = (row.modelMs ?? 0) + elapsedMs;
          if (evidence) row.requestEvidence.push({
            ...(detailed ? { accepted: false, preview: { created: false }, applied: false,
              sentReasoningEffort: usage?.benchmarkSentReasoningEffort ?? null } : {}),
            ...evidence, elapsedMs, usage,
          });
        }
      },
    } : {}),
    guidedUsage({ tokens, requests }) {
      if (tokens) mergeTokenTotals(row.tokens, tokens);
      else row.tokens.requests += requests ?? 0;
      row.requests = row.tokens.requests;
    },
  };
}
