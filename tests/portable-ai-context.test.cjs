const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createPortableAI, LOCAL_PROVIDER, MODEL } = require('../backend/portable-ai.cjs');
const { generate, completeModel } = require('../backend/ai-provider.cjs');

test('Portable AI setup remembers the chosen PC profile without downloading a model', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'formnaro-portable-ai-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let requests = 0;
  const options = profile => ({
    directory: path.join(directory, 'models'),
    profileDirectory: path.join(directory, profile), enabled: true, firstLaunch: true,
    fetchImpl: async () => { requests++; throw Error('Unexpected network access'); },
  });
  const first = createPortableAI(options('first-pc'));
  const status = await first.status();
  assert.equal(status.offer, true);
  assert.equal(status.local.installed, false);
  assert.ok(status.local.bytes < 3_000_000_000);
  await first.dismiss();
  assert.deepEqual(await createPortableAI(options('first-pc')).status(), { offer: false });
  assert.equal((await createPortableAI(options('first-pc')).status({ manual: true })).offer, true);
  assert.equal((await createPortableAI(options('new-pc')).status()).offer, true);
  assert.equal(requests, 0);
});

test('Portable AI retries a connection reset before reporting a download response', {
  skip: process.platform !== 'win32' || process.arch !== 'x64',
}, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'formnaro-portable-ai-retry-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let requests = 0;
  const portable = createPortableAI({
    directory, profileDirectory: directory, enabled: true, firstLaunch: true,
    downloadFetch: async (url, options) => {
      assert.equal(url, MODEL.url);
      assert.equal(options.credentials, 'omit');
      if (++requests === 1) throw Error('net::ERR_CONNECTION_RESET');
      return new Response('', { status: 503 });
    },
  });
  await assert.rejects(portable.prepare(), /HTTP 503/);
  assert.equal(requests, 2);
});

test('The portable local model receives a short editable CAD contract instead of the full tool schema', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const revision = '0123456789abcdef';
  const target = { rootId: 'requested-body', path: ['source'] };
  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, LOCAL_PROVIDER.baseUrl + '/chat/completions');
    requestBody = JSON.parse(options.body);
    return Response.json({
      model: LOCAL_PROVIDER.model,
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ revision, label: 'Quader',
        commands: [{ op: 'create', type: 'box', size: [30, 20, 8], pos: [0, 0, 4] }] }) } }],
    });
  };
  const huge = 'tool-contract-omitted-in-local-chat '.repeat(9000);
  const result = await generate({ ...LOCAL_PROVIDER, maxOutputTokens: 1536 }, 'test-local-token', {
    chat: true, prompt: 'Quader 30 × 20 × 8 mm',
    context: { commandSchema: huge, toolReference: true },
    scene: { revision, selectionTargets: [target], objects: [{ target, name: 'Quelle', measures: { editSize: [30, 20, 8] } }] },
  });
  assert.equal(result.revision, revision);
  assert.deepEqual(result.commands[0].size, [30, 20, 8]);
  const packed = JSON.stringify(requestBody);
  assert.ok(packed.length < 3000);
  assert.match(packed, /requested-body/);
  assert.doesNotMatch(packed, /tool-contract-omitted/);
});

test('The local lab budgets the rendered prompt and preserves the task when history is too large', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const seen = [];
  let runtimeContext = 8192;
  globalThis.fetch = async (url, options) => {
    const route = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    seen.push({ route, body });
    if (route === '/props') return Response.json({ default_generation_settings: { n_ctx: runtimeContext } });
    if (route === '/apply-template') {
      assert.deepEqual(body.messages.slice(1).map(m => m.role),
        body.messages.slice(1).map((_, i) => i % 2 === 0 ? 'user' : 'assistant'));
      return Response.json({ prompt: JSON.stringify(body.messages) });
    }
    if (route === '/tokenize') return Response.json({
      tokens: Array(body.content.includes('oversized') ? 8100 : 2000).fill(0),
    });
    assert.equal(route, '/v1/chat/completions');
    return Response.json({ choices: [{ message: { content: '{"status":"completed","message":"done"}' } }] });
  };
  const events = [];
  const envelope = {
    localLab: true, system: 'Local lab', user: 'latest measured CAD feedback',
    input: { images: [], history: [
      { role: 'user', text: 'Original task to preserve', images: [] },
      { role: 'assistant', text: 'oversized historical turn', images: [] },
    ] },
    outputBudget: 16384, onDiagnostic: e => events.push(e),
  };
  await completeModel(LOCAL_PROVIDER, 'test-local-token', envelope);
  const sent = seen.at(-1).body;
  assert.deepEqual(sent.messages.map(m => m.content), ['Local lab', 'Original task to preserve\n\nlatest measured CAD feedback']);
  assert.equal(sent.max_tokens, 6176);
  assert.equal(events.find(e => e.type === 'context-budget').droppedTurns, 1);

  seen.length = 0;
  await assert.rejects(completeModel(LOCAL_PROVIDER, 'test-local-token', {
    ...envelope, user: 'oversized task', input: { images: [], history: [] },
  }), { code: 'AI_PROVIDER_CONTEXT_LIMIT' });
  assert.deepEqual(seen.map(e => e.route), ['/props', '/apply-template', '/tokenize']);

  seen.length = 0;
  runtimeContext = 4096;
  await assert.rejects(completeModel(LOCAL_PROVIDER, 'test-local-token', envelope), { code: 'AI_PROVIDER_CONTEXT_CONFIG' });
  assert.deepEqual(seen.map(e => e.route), ['/props']);
});

test('The local lab starts large scenes with revision and bounded selected geometry', () => {
  const { localAgentScene } = require('../backend/ai-lab-local-context.cjs');
  const objects = Array.from({ length: 35 }, (_, i) => ({
    target: { rootId: 'object-' + i, path: [] }, name: 'Test body',
    worldBounds: { center: [0, 0, 4], size: [40, 30, 8] }, recipe: { detail: 'x'.repeat(800) },
  }));
  const scene = { revision: '0123456789abcdef', selectionTargets: [objects.at(-1).target], objects };
  const summary = localAgentScene(scene);
  assert.equal(summary.revision, scene.revision);
  assert.equal(summary.objectCount, 35);
  assert.equal(summary.objects.length, 8);
  assert.equal(summary.objects[0].target.rootId, 'object-34');
  assert.deepEqual(summary.objects[0].worldBounds, objects.at(-1).worldBounds);
  assert.equal(summary.objects[0].recipe, undefined);
});
