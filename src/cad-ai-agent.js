import { renderReasoningSelect } from './ai-reasoning-ui.js';
import { providerOptionLabel } from './ai-provider-status.js';
import { formatAIUsage } from './cad-ai-usage.js';
export function createAIAgentChat({
  host,
  desktop,
  onSettings,
  onProviderChange = () => {},
  onBusy = () => {},
  isBusy = () => false,
}) {
  const root = document.createElement('dialog');
  root.id = 'ai-agent-chat';
  root.className = 'ai-agent-dialog';
  root.setAttribute('aria-label', 'KI-Agenten-Chat');
  root.innerHTML =
    '<div class="ai-agent-heading"><h2>Agenten-Chat</h2><button id="ai-agent-new" type="button">Neuer Chat</button><button id="ai-agent-close" type="button" aria-label="Agenten-Chat schließen">×</button></div><p class="small-note">Der Agent bedient Formnaro direkt: Er liest die Szene, prüft Vorschläge und kann passende Änderungen selbst übernehmen. Wenn OrcaSlicer eingerichtet ist, kann der Agent das Modell auch für den Druck vorbereiten. Die Druckprojekte findest du unter 3D-Druck.</p><div class="ai-agent-selectors"><label>Anbieter<select id="ai-agent-provider"></select></label><label>Modell<select id="ai-agent-model"></select></label><label id="ai-agent-effort-row" hidden>Denkaufwand<select id="ai-agent-effort"></select><span id="ai-agent-reasoning-note" class="small-note"></span></label><button id="ai-agent-settings" type="button">Anmeldung / Einstellungen</button><button id="ai-agent-connect" type="button">Lokale Verbindung einschalten</button></div><p id="ai-agent-connection" role="status"></p><div id="ai-agent-log" role="log" aria-label="Agentenverlauf" aria-live="polite"></div><form id="ai-agent-form"><label for="ai-agent-prompt">Auftrag an den Agenten</label><textarea id="ai-agent-prompt" rows="3" maxlength="10000" placeholder="Was soll der Agent in Formnaro erledigen?"></textarea><div class="ai-controls"><button id="ai-agent-cancel" type="button" hidden>Auftrag abbrechen</button><button id="ai-agent-send" class="primary" type="submit">Auftrag ausführen</button></div></form><p id="ai-agent-status" role="status"></p><p class="small-note">Beim Senden erhält der gewählte Anbieter deinen Auftrag und die vom Agenten gelesenen Modellinformationen. ChatGPT und Mistral Vibe nutzen ihre jeweilige Anmeldung; die anderen Zugänge verwenden den eingerichteten API-Schlüssel.</p>';
  document.body.append(root);
  const el = (id) => root.querySelector('#' + id),
    button = document.createElement('button');
  button.id = 'ai-open-agent';
  button.type = 'button';
  button.textContent = 'Agenten-Chat öffnen';
  host.append(button);
  const usageLine = document.createElement('p');
  usageLine.id = 'ai-agent-usage';
  usageLine.className = 'small-note';
  el('ai-agent-status').after(usageLine);
  let settings,
    busy = false,
    loading = false,
    requestId = null,
    cancelling = null,
    answer = null,
    disposed = false,
    usageAttempts = [],
    effortAdjustable = false;
  const conversations = new Map(),
    tools = new Map();
  let providerId = null;
  const accepted = new Map();
  const agentError = (code, message) => Object.assign(Error(message), { code });
  function append(kind, text) {
    const item = document.createElement('article');
    item.className = 'ai-agent-' + kind;
    item.textContent = text;
    el('ai-agent-log').append(item);
    item.scrollIntoView({ block: 'nearest' });
    return item;
  }
  function status(text, error = false) {
    el('ai-agent-status').textContent = text;
    el('ai-agent-status').classList.toggle('ai-error', error);
  }
  function controls() {
    for (const id of [
      'ai-agent-send',
      'ai-agent-provider',
      'ai-agent-model',
      'ai-agent-new',
      'ai-agent-connect',
      'ai-agent-settings',
    ])
      el(id).disabled = busy || loading;
    el('ai-agent-effort').disabled = busy || loading || !effortAdjustable;
    el('ai-agent-prompt').disabled = busy;
    el('ai-agent-cancel').hidden = !busy;
  }
  function switchHistory(id) {
    if (providerId === id) return;
    if (providerId) conversations.set(providerId, [...el('ai-agent-log').childNodes]);
    el('ai-agent-log').replaceChildren(...(conversations.get(id) ?? []));
    providerId = id;
    tools.clear();
  }
  async function refresh() {
    loading = true;
    controls();
    try {
      settings = await desktop.getAISettings();
      if (disposed) return;
      switchHistory(settings.providerId);
      el('ai-agent-provider').replaceChildren();
      for (const p of settings.providers) el('ai-agent-provider').add(new Option(providerOptionLabel(p), p.id));
      el('ai-agent-provider').value = settings.providerId;
      const catalog = await desktop.getAIModels({ refresh: false });
      if (disposed) return;
      el('ai-agent-model').replaceChildren();
      for (const m of catalog.models) el('ai-agent-model').add(new Option(m.name, m.id));
      if (settings.model && !catalog.models.some((m) => m.id === settings.model))
        el('ai-agent-model').add(new Option(settings.model, settings.model));
      el('ai-agent-model').value = settings.model;
      const reasoning = renderReasoningSelect(
        el('ai-agent-effort'),
        settings,
        catalog.models.find((m) => m.id === settings.model),
      );
      el('ai-agent-effort-row').hidden = !reasoning.visible;
      effortAdjustable = reasoning.adjustable;
      el('ai-agent-reasoning-note').textContent = reasoning.note;
      el('ai-agent-connect').hidden = settings.bridge.enabled;
      el('ai-agent-connection').textContent = !settings.bridge.enabled
        ? 'Lokale Formnaro-Verbindung ist ausgeschaltet.'
        : !catalog.hasKey
          ? 'Anmeldung oder API-Schlüssel für diesen Anbieter fehlt.'
          : catalog.error
            ? 'Modellliste: ' + catalog.error
            : 'Lokale Verbindung bereit · ' +
              (settings.providers.find((p) => p.id === settings.providerId)?.label ?? settings.providerId);
    } catch (error) {
      status(error.message, true);
    } finally {
      loading = false;
      controls();
    }
  }
  async function open() {
    if (disposed) return;
    if (!root.open) root.showModal();
    await refresh();
    el('ai-agent-prompt').focus();
  }
  button.onclick = open;
  el('ai-agent-close').onclick = () => root.close();
  el('ai-agent-settings').onclick = () => {
    root.close();
    onSettings();
  };
  el('ai-agent-provider').onchange = async () => {
    try {
      await desktop.selectAIProvider({ providerId: el('ai-agent-provider').value });
      await onProviderChange();
      await refresh();
    } catch (error) {
      status(error.message, true);
      await refresh();
    }
  };
  el('ai-agent-model').onchange = async () => {
    try {
      await desktop.selectAIModel({ model: el('ai-agent-model').value });
      await onProviderChange();
      await refresh();
    } catch (error) {
      status(error.message, true);
    }
  };
  el('ai-agent-effort').onchange = async () => {
    if (busy || loading) return;
    loading = true;
    controls();
    try {
      await desktop.selectAIEffort({ reasoningEffort: el('ai-agent-effort').value });
      await onProviderChange();
    } catch (error) {
      status(error.message, true);
    } finally {
      await refresh();
    }
  };
  el('ai-agent-connect').onclick = async () => {
    try {
      const current = await desktop.getAISettings();
      await desktop.saveAISettings({ config: { ...current, bridgeEnabled: true } });
      await refresh();
    } catch (error) {
      status(error.message, true);
    }
  };
  el('ai-agent-new').onclick = async () => {
    try {
      await desktop.resetAgent();
      conversations.clear();
      el('ai-agent-log').replaceChildren();
      tools.clear();
      status('Neuer Agenten-Chat gestartet. Das Modell bleibt erhalten.');
    } catch (error) {
      status(error.message, true);
    }
  };
  el('ai-agent-cancel').onclick = () => cancelCurrent(requestId).catch((error) => status(error.message, true));
  const unsubscribe = desktop?.onAgentEvent?.((event) => {
    if (event.requestId !== requestId) return;
    if (event.type === 'text') {
      if (!answer) answer = append('assistant', '');
      answer.textContent += event.text;
      answer.scrollIntoView({ block: 'nearest' });
    } else if (event.type === 'usage') {
      usageAttempts.push(event.usage);
      usageLine.textContent = formatAIUsage(usageAttempts);
    } else if (event.type === 'tool') {
      const key = event.id || event.title;
      let row = tools.get(key);
      if (!row) {
        row = append('tool', '');
        tools.set(key, row);
      }
      if (event.title) row.dataset.tool = event.title;
      const tool = row.dataset.tool ?? '',
        short = tool.replace(/^formnaro_/, ''),
        labels = {
          offlinecad_context: 'Werkzeugkontext lesen',
          offlinecad_scene: 'Modellzustand lesen',
          offlinecad_project: 'Projekt lesen',
          offlinecad_screenshot: 'Modellansicht prüfen',
          offlinecad_preview: 'Vorschlag prüfen',
          offlinecad_python: 'Python-Vorschlag prüfen',
          offlinecad_apply: 'Änderungen übernehmen',
          offlinecad_export: 'Modell exportieren',
          offlinecad_assembly: 'Baugruppenanzeige einstellen',
          offlinecad_ui: 'Bedienhilfe / Übung',
          offlinecad_orca: 'OrcaSlicer · Druck vorbereiten',
        },
        states = { pending: 'wartet', in_progress: 'läuft', completed: 'erledigt', failed: 'fehlgeschlagen' };
      row.textContent =
        (labels[short] || tool || 'Formnaro-Werkzeug') + ' · ' + (states[event.status] || event.status || '');
    } else if (event.type === 'notice') append('notice', event.text);
  });
  function ensureIdle() {
    if (disposed) throw agentError('AGENT_UNAVAILABLE', 'Der Formnaro-Agent ist nicht verfügbar.');
    if (busy || loading || isBusy()) throw agentError('AGENT_BUSY', 'Laufenden Formnaro-Auftrag zuerst abschließen.');
  }

  async function cancelCurrent(id) {
    if (!id || requestId !== id) return false;
    cancelling = id;
    await desktop.cancelAI({ requestId: id });
    return true;
  }

  async function submit(prompt, id, clearInput) {
    busy = true;
    onBusy(true);
    controls();
    requestId = id;
    answer = null;
    usageAttempts = [];
    usageLine.textContent = '';
    tools.clear();
    status('Agent arbeitet …');
    try {
      settings = await desktop.getAISettings();
      if (disposed) return;
      switchHistory(settings.providerId);
      append('user', prompt);
      if (clearInput) el('ai-agent-prompt').value = '';
      if (cancelling === id) throw Error('Auftrag abgebrochen.');
      const result = await desktop.sendAgent({ prompt, requestId: id, providerId: settings.providerId });
      if (!answer && result.message) append('assistant', result.message);
      if (!usageAttempts.length && result.usages) {
        usageAttempts = result.usages;
        usageLine.textContent = formatAIUsage(usageAttempts);
      }
      status('Auftrag beendet. Ausgeführte Schritte stehen im Verlauf.');
    } catch (error) {
      append('error', error.message);
      status('Auftrag beendet: ' + error.message, true);
    } finally {
      requestId = null;
      cancelling = null;
      busy = false;
      onBusy(false);
      controls();
    }
  }

  el('ai-agent-form').onsubmit = (event) => {
    event.preventDefault();
    const prompt = el('ai-agent-prompt').value.trim();
    if (!prompt) return;
    try {
      ensureIdle();
      void submit(prompt, crypto.randomUUID(), true);
    } catch (error) {
      status(error.message, true);
    }
  };

  async function snapshot() {
    const current = await desktop.getAISettings();
    if (disposed) throw agentError('AGENT_UNAVAILABLE', 'Der Formnaro-Agent ist nicht verfügbar.');
    if (!busy && !loading) switchHistory(current.providerId);
    const entries = [];
    let size = 0;
    const rows = [...el('ai-agent-log').children].slice(-80).reverse();
    for (const row of rows) {
      const text = row.textContent.slice(0, 12000);
      if (size + text.length > 45000) break;
      size += text.length;
      entries.unshift({ kind: row.className.replace('ai-agent-', ''), text });
    }
    const host = new URL(current.baseUrl).hostname;
    return {
      busy,
      requestId,
      provider: current.providers.find((p) => p.id === current.providerId)?.label ?? 'Formnaro',
      model: current.model,
      ready: !!current.model && (current.hasKey || ['localhost', '127.0.0.1', '[::1]'].includes(host)),
      status: el('ai-agent-status').textContent,
      entries,
    };
  }

  async function externalRequest(args) {
    const invalid = () => agentError('AGENT_REQUEST_INVALID', 'Ungültiger lokaler Chat-Auftrag.');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw invalid();
    const keys = Object.keys(args);
    if (args.action === 'state' && keys.length === 1) return snapshot();
    const id = args.requestId;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) throw invalid();
    if (args.action === 'cancel' && keys.length === 2) {
      return { cancelled: await cancelCurrent(id) };
    }
    if (
      args.action !== 'send' ||
      keys.length !== 3 ||
      typeof args.prompt !== 'string' ||
      !args.prompt.trim() ||
      args.prompt.length > 10000
    )
      throw invalid();
    const prompt = args.prompt.trim();
    if (accepted.has(id)) {
      if (accepted.get(id) !== prompt) throw invalid();
      return { accepted: true, requestId: id };
    }
    ensureIdle();
    accepted.set(id, prompt);
    if (accepted.size > 100) accepted.delete(accepted.keys().next().value);
    void submit(prompt, id, false);
    return { accepted: true, requestId: id };
  }

  return {
    open,
    externalRequest,
    isBusy: () => busy,
    dispose() {
      disposed = true;
      unsubscribe?.();
      if (requestId) void desktop.cancelAI({ requestId }).catch(() => {});
      root.remove();
      button.remove();
    },
  };
}
