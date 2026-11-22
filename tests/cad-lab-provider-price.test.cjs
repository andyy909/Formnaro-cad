const test = require('node:test');
const assert = require('node:assert/strict');
const { completeModel } = require('../backend/ai-provider.cjs');

const config = { authMode: 'api-key', protocol: 'chat', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-4', maxOutputTokens: null };
const envelope = {
  system: 'CAD contract ' + 'x'.repeat(360000), user: 'Rebuild the two bores.',
  input: { images: [], history: [] }, outputBudget: 12000,
  context: { toolReference: { version: 1 }, benchmarkWithoutResearch: true },
};
const budget = remainingUSD => ({ remainingUSD, usdPerEur: 1.0992, outputReserve: 4096 });

function response(text, promptTokens = 14) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: promptTokens, completion_tokens: 10 } }));
}

test('the benchmark checks the prepared first Mistral request and retains the API reply cap', async t => {
  const sent = [];
  t.mock.method(global, 'fetch', async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return response('{"message":"ok"}');
  });
  await completeModel(config, 'fixture', envelope, undefined, { benchmarkPrice: budget(3.25731164) });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].max_tokens, 12000);
  await assert.rejects(completeModel(config, 'fixture', envelope, undefined, { benchmarkPrice: budget(.01) }), { code: 'LAB_PRICE_BUDGET' });
  assert.equal(sent.length, 1);
});

test('a local tool lookup checks the next prepared request and preserves paid usage if it stops', async t => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    return response('{"toolReference":{"tool":"array"}}', 100000);
  });
  await assert.rejects(completeModel(config, 'fixture', envelope, undefined, { benchmarkPrice: budget(.30) }), error => {
    assert.equal(error.code, 'LAB_PRICE_BUDGET');
    assert.match(error.message, /Preisreserve/);
    assert.equal(error.aiUsage.inputTokens, 100000);
    assert.equal(error.aiUsage.outputTokens, 10);
    assert.equal(error.aiUsage.estimatedCostUSD.max, .070021);
    return true;
  });
  assert.equal(calls, 1);
});

test('ChatGPT applies the remaining balance to a single prepared request without a wire reply cap', async t => {
  const sent = [];
  const chatgpt = { ...config, authMode: 'chatgpt', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.1-terra' };
  t.mock.method(global, 'fetch', async (_url, options) => {
    sent.push(JSON.parse(options.body));
    const event = { type: 'response.completed', response: { status: 'completed', model: chatgpt.model,
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"message":"ok"}' }] }],
      usage: { input_tokens: 75000, output_tokens: 500, input_tokens_details: { cached_tokens: 0 } },
    } };
    return new Response('data: ' + JSON.stringify(event) + '\n\n');
  });
  const answer = await completeModel(chatgpt, 'fixture', envelope, undefined, { benchmarkPrice: budget(5.2507872) });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].max_output_tokens, undefined);
  assert.equal(answer.data.benchmarkUsage.estimatedCostUSD.subscription, true);
});

test('a tight DeepSeek budget reduces the output cap but permits the request', async t => {
  const deepseek = { ...config, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' };
  let cap;
  t.mock.method(global, 'fetch', async (_url, options) => {
    cap = JSON.parse(options.body).max_tokens;
    return response('{"message":"ok"}');
  });
  const result = await completeModel(deepseek, 'fixture', { ...envelope, system: 'CAD', outputBudget: 131072 }, undefined,
    { benchmarkPrice: budget(.1) });
  assert(cap > 0 && cap < 131072);
  assert.equal(result.data.benchmarkUsage.benchmarkOutputLimit, cap);
});

test('detailed benchmarks count HTTP retries and refuse the next model dispatch', async t => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    return new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { 'retry-after': '0' } });
  });
  await assert.rejects(completeModel(config, 'fixture', envelope, undefined, { benchmarkModelRequests: 2 }), error => {
    assert.equal(error.code, 'LAB_MODEL_REQUEST_BUDGET');
    assert.equal(error.aiUsage.benchmarkModelRequests, 2);
    assert.equal(error.aiUsage.benchmarkModelRetries, 1);
    return true;
  });
  assert.equal(calls, 2);
});

test('an internal request stopped by the hard cap preserves prior billed tokens without a Euro cap', async t => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    return response('{"toolReference":{"tool":"array"}}', 7845);
  });
  await assert.rejects(completeModel(config, 'fixture', envelope, undefined, { benchmarkModelRequests: 1 }), error => {
    assert.equal(error.code, 'LAB_MODEL_REQUEST_BUDGET');
    assert.equal(error.aiUsage.inputTokens, 7845);
    assert.equal(error.aiUsage.outputTokens, 10);
    assert.equal(error.aiUsage.benchmarkModelRequests, 1);
    assert(error.aiUsage.estimatedCostUSD.max > 0);
    return true;
  });
  assert.equal(calls, 1);
});

test('a dispatched API request with no usage preserves its conservative dispatch reserve', async t => {
  const stop = new AbortController();
  t.mock.method(global, 'fetch', async (_url, options) => {
    assert.equal(JSON.parse(options.body).max_tokens, 12000);
    stop.abort();
    stop.signal.throwIfAborted();
  });
  await assert.rejects(completeModel(config, 'fixture', envelope, stop.signal, {
    benchmarkModelRequests: 63, benchmarkPrice: budget(5),
  }), error => {
    assert.equal(error.aiUsage.benchmarkModelRequests, 1);
    assert.equal(error.aiUsage.estimatedCostUSD, undefined);
    assert.equal(error.aiUsage.benchmarkPriceReserve.requests, 1);
    assert(error.aiUsage.benchmarkPriceReserve.maximumUSD > 0);
    assert(error.aiUsage.benchmarkPriceReserve.maximumUSD < 5);
    return true;
  });
});

test('priced internal rounds preserve metered usage beside a later interrupted dispatch', async t => {
  const stop = new AbortController();
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    if (++calls === 1) return response('{"toolReference":{"tool":"array"}}', 7845);
    stop.abort();
    stop.signal.throwIfAborted();
  });
  await assert.rejects(completeModel(config, 'fixture', envelope, stop.signal, {
    benchmarkModelRequests: 63, benchmarkPrice: budget(5),
  }), error => {
    assert.equal(error.aiUsage.benchmarkModelRequests, 2);
    assert.equal(error.aiUsage.inputTokens, 7845);
    assert(error.aiUsage.estimatedCostUSD.max > 0);
    assert.equal(error.aiUsage.benchmarkPriceReserve.requests, 1);
    return true;
  });
});

test('an explicitly rate-rejected dispatch releases its reserve before the retry settles', async t => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => ++calls === 1
    ? new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { 'retry-after': '0' } })
    : response('{"message":"ok"}', 7845));
  const reply = await completeModel(config, 'fixture', envelope, undefined, {
    benchmarkModelRequests: 63, benchmarkPrice: budget(5),
  });
  assert.equal(reply.data.benchmarkTransport.benchmarkModelRetries, 1);
  assert.equal(reply.data.benchmarkUsage.benchmarkPriceReserve, undefined);
  assert(reply.data.benchmarkUsage.estimatedCostUSD.max > 0);
});
