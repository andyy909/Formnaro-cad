'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { createModelStore } = require('./speech-model.cjs');
const { createImportedModels, IMPORTED_ID } = require('./portable-ai-models.cjs');

const MODEL = Object.freeze({
  name: 'Qwen3-4B Instruct',
  id: 'qwen3-4b-instruct-2507',
  file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  bytes: 2497280736,
  sha256: '2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e',
  url: 'https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/ae44f08e1392f39c0e474af10c3ff8355c8b6688/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
});
const RUNTIME = Object.freeze({
  file: 'llama-b8022-bin-win-cpu-x64.zip',
  bytes: 31203411,
  sha256: 'd146fa1ccfb838d0b3be305357fcde4550335717d9d22df6e62839230a2a7694',
  url: 'https://github.com/ggml-org/llama.cpp/releases/download/b8022/llama-b8022-bin-win-cpu-x64.zip',
});
const LOCAL_PROVIDER = Object.freeze({
  id: 'http://127.0.0.1:53172',
  label: 'Lokal · Formnaro (GGUF)',
  baseUrl: 'http://127.0.0.1:53172/v1',
  protocol: 'chat',
  authMode: 'api-key',
  model: MODEL.id,
});
const TOTAL_BYTES = MODEL.bytes + RUNTIME.bytes;
const LOCAL_CONTEXT_TOKENS = 8192;

function isPortableModel(config) {
  return config.baseUrl === LOCAL_PROVIDER.baseUrl && config.authMode === LOCAL_PROVIDER.authMode
    && (config.model === MODEL.id || IMPORTED_ID.test(config.model));
}

async function fetchWithConnectionRetry(fetchDownload, url, options) {
  for (const pause of [500, 1500, 3000]) {
    try {
      return await fetchDownload(url, options);
    } catch (error) {
      if (!/ERR_(?:CONNECTION_(?:RESET|ABORTED|CLOSED)|NETWORK_CHANGED|TIMED_OUT)/.test(error.message)) throw error;
      await delay(pause, undefined, { signal: options.signal });
    }
  }
  return fetchDownload(url, options);
}

function createPortableAI({ directory, profileDirectory, enabled, firstLaunch, fetchImpl = globalThis.fetch, downloadFetch = fetchImpl }) {
  const supported = enabled && process.platform === 'win32' && process.arch === 'x64';
  const seen = path.join(profileDirectory, 'portable-ai-setup-v1');
  const fetchDownload = (url, options) => fetchWithConnectionRetry(downloadFetch, url, options);
  const model = createModelStore({ directory, model: MODEL, fetchImpl: fetchDownload,
    resourceName: 'das KI-Modell', resourceTitle: 'Das KI-Modell' });
  const runtime = createModelStore({ directory, model: RUNTIME, fetchImpl: fetchDownload,
    resourceName: 'die KI-Laufzeit', resourceTitle: 'Die KI-Laufzeit' });
  const imported = createImportedModels(directory);
  const stop = new AbortController();
  let install, starting, server, sessionDirectory, disposed;

  async function status({ manual = false, modelId } = {}) {
    const wasSeen = await fs.access(seen).then(() => true, () => false);
    const offer = enabled && (manual || (firstLaunch && !wasSeen));
    if (!offer) return { offer };
    const weight = model.progress(), engine = runtime.progress();
    const [hasModel, hasRuntime, custom] = await Promise.all([
      weight.downloading ? false : model.installed({ allowCached: true }),
      engine.downloading ? false : runtime.installed({ allowCached: true }),
      modelId ? imported.find(modelId).catch(() => null) : null,
    ]);
    return { offer, local: { supported, installed: hasModel && hasRuntime, bytes: TOTAL_BYTES,
      model: MODEL.name, importedModel: custom?.name, downloading: !!install, totalBytes: TOTAL_BYTES,
      downloadedBytes: (hasModel ? MODEL.bytes : weight.downloadedBytes)
        + (hasRuntime ? RUNTIME.bytes : engine.downloadedBytes),
      downloadError: weight.downloadError || engine.downloadError || null } };
  }

  async function dismiss() {
    await fs.mkdir(profileDirectory, { recursive: true });
    await fs.writeFile(seen, '', { flag: 'a' });
  }

  async function checkSpace(bytes) {
    if (typeof fs.statfs !== 'function') return;
    await fs.mkdir(directory, { recursive: true });
    const { bavail, bsize } = await fs.statfs(directory);
    const engineBytes = await runtime.installed({ allowCached: true }) ? 0 : RUNTIME.bytes;
    if (bavail * bsize < bytes + engineBytes + 134217728) {
      throw Error('Im Formnaro-Datenordner ist nicht genügend Platz für Modell und Laufzeit.');
    }
  }

  function setup(operation, modelId) {
    if (!supported) throw Error('Das lokale KI-Modell ist für Windows x64 verfügbar.');
    if (install) throw Error('Die lokale KI wird bereits eingerichtet.');
    const current = { controller: new AbortController(), modelId };
    const signal = AbortSignal.any([current.controller.signal, stop.signal]);
    install = current;
    current.promise = operation(signal, current).finally(() => { install = undefined; });
    return current.promise;
  }

  async function ensureDownload(store, signal) {
    signal.throwIfAborted();
    if (!await store.installed({ allowCached: true })) {
      signal.throwIfAborted();
      await store.download();
    }
  }

  function prepare() {
    return setup(async signal => {
      await checkSpace(await model.installed({ allowCached: true }) ? 0 : MODEL.bytes);
      await ensureDownload(model, signal);
      await ensureDownload(runtime, signal);
      await token(signal, { cancelLaunch: true });
    }, MODEL.id);
  }

  function prepareImported(file) {
    return setup(async (signal, current) => {
      const selected = await imported.add(file, { signal, checkSpace });
      current.modelId = selected.id;
      try {
        await checkSpace(0);
        await ensureDownload(runtime, signal);
        await token(signal, { modelId: selected.id, cancelLaunch: true });
        return { id: selected.id, name: selected.name };
      } catch (error) {
        // A cancellation immediately after startup can leave the file in use.
        if (server?.modelId === selected.id) await releaseRuntime();
        await selected.remove();
        throw error;
      }
    });
  }

  function cancelDownload() {
    if (!install) return false;
    install.controller.abort();
    runtime.cancel();
    model.cancel();
    return true;
  }

  async function launch(signal, modelId) {
    try {
      const selected = modelId === MODEL.id
        ? await model.installed({ allowCached: true }) && { target: model.target }
        : await imported.find(modelId);
      if (!selected) throw Error('Die lokale Modell-Datei fehlt. Unter KI / API erneut auswählen.');
      if (!await runtime.installed({ allowCached: true })) throw Error('Die lokale KI-Laufzeit zuerst einrichten.');
      signal.throwIfAborted();
      sessionDirectory = await fs.mkdtemp(path.join(directory, '.llama-cpu-'));
      const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      await promisify(execFile)(tar, ['-xf', runtime.target, '-C', sessionDirectory],
        { windowsHide: true, signal, timeout: 60000 });
      signal.throwIfAborted();
      const key = randomBytes(32).toString('hex');
      const child = spawn(path.join(sessionDirectory, 'llama-server.exe'), [
        '--model', selected.target, '--alias', modelId, '--host', '127.0.0.1',
        '--port', new URL(LOCAL_PROVIDER.id).port, '--ctx-size', String(LOCAL_CONTEXT_TOKENS), '--parallel', '1',
        '--n-gpu-layers', '0', '--no-webui', '--no-slots', '--api-key', key,
      ], { cwd: sessionDirectory, windowsHide: true, stdio: 'ignore' });
      server = { child, key, modelId, ended: false };
      const current = server;
      current.exit = new Promise(resolve => {
        child.once('error', () => { current.ended = true; resolve(); });
        child.once('close', () => { current.ended = true; resolve(); });
      });
      const until = Date.now() + 90000;
      while (!current.ended && Date.now() < until) {
        signal.throwIfAborted();
        try {
          const response = await fetchImpl(LOCAL_PROVIDER.baseUrl + '/models', {
            headers: { Authorization: 'Bearer ' + key }, redirect: 'error',
            signal: AbortSignal.any([signal, AbortSignal.timeout(1200)]),
          });
          if (response.ok && (await response.json()).data?.some(item => item.id === modelId) && !current.ended) return key;
        } catch { /* Wait for model loading. */ }
        await delay(240, undefined, { signal });
      }
      throw Error('Das Modell konnte nicht gestartet werden. Prüfe, ob es ein kompatibles GGUF-Textmodell ist und genügend Arbeitsspeicher frei ist.');
    } catch (error) {
      await releaseRuntime();
      throw error;
    }
  }

  async function releaseRuntime() {
    if (server && !server.ended) server.child.kill();
    if (server) await server.exit;
    server = undefined;
    const temporary = sessionDirectory;
    sessionDirectory = undefined;
    if (temporary) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }

  async function token(signal, { cancelLaunch = false, modelId = MODEL.id } = {}) {
    if (!supported) throw Error('Diese lokale KI-Laufzeit ist hier nicht verfügbar.');
    stop.signal.throwIfAborted();
    signal?.throwIfAborted();
    if ((install && install.modelId !== modelId) || (starting && starting.modelId !== modelId)) {
      throw Error('Ein anderes lokales Modell wird gerade eingerichtet.');
    }
    if (!starting && (!server || server.ended || server.modelId !== modelId)) {
      starting = { modelId, promise: (async () => {
        if (server) await releaseRuntime();
        return launch(cancelLaunch ? AbortSignal.any([stop.signal, signal]) : stop.signal, modelId);
      })().finally(() => { starting = undefined; }) };
    }
    const key = starting ? await starting.promise : server.key;
    signal?.throwIfAborted();
    if (server?.ended !== false) throw Error('Die lokale KI-Laufzeit wurde beendet.');
    return key;
  }

  function dispose() {
    if (disposed) return disposed;
    cancelDownload();
    stop.abort();
    disposed = (async () => {
      await Promise.allSettled([install?.promise, starting?.promise]);
      await releaseRuntime();
    })();
    return disposed;
  }

  async function models() {
    const own = await imported.list();
    if (await model.installed({ allowCached: true })) own.unshift(MODEL);
    return own.map(({ id, name }) => ({ id, name, input_modalities: ['text'] }));
  }

  return { enabled, status, dismiss, prepare, prepareImported, models, cancelDownload, token, dispose,
    active: () => !!(install || starting || server || sessionDirectory) };
}

module.exports = { MODEL, RUNTIME, LOCAL_PROVIDER, LOCAL_CONTEXT_TOKENS, isPortableModel, createPortableAI };
