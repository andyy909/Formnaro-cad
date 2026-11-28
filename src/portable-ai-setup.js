import './portable-ai-setup.css';

export async function mountPortableAISetup({ desktop, openSettings, language, manual = false, onReady }) {
  if (!desktop?.portableAISetup) return null;
  const existing = document.getElementById('portable-ai-setup');
  if (existing) return existing;
  let status = await desktop.portableAISetup({ action: 'status', manual });
  if (!status?.offer) return null;
  const mounted = document.getElementById('portable-ai-setup');
  if (mounted) return mounted;

  const english = (typeof language === 'function' ? language() : language) === 'en';
  const text = (de, en) => (english ? en : de);
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'portable-ai-setup';
  dialog.setAttribute('aria-labelledby', 'portable-ai-setup-title');
  dialog.setAttribute('aria-describedby', 'portable-ai-setup-description');
  dialog.innerHTML = `
    <div class="portable-ai-setup-heading">
      <h2 id="portable-ai-setup-title">${text('KI in Formnaro einrichten', 'Set up AI in Formnaro')}</h2>
      <button type="button" data-close aria-label="${text('Schließen', 'Close')}">×</button>
    </div>
    <p id="portable-ai-setup-description">${text('Wähle, wie du KI verwenden möchtest. Du kannst das später unter Einstellungen → KI / API ändern.', 'Choose how you want to use AI. You can change this later under Settings → AI / API.')}</p>
    <div class="portable-ai-setup-options">
      <section aria-labelledby="portable-ai-local-title">
        <h3 id="portable-ai-local-title">${text('Lokales Modell', 'Local model')}</h3>
        <p>${text('Qwen3-4B Instruct für Textanfragen ohne Internet. Einmalig etwa 2,5 GB inklusive CPU-Laufzeit herunterladen.', 'Qwen3-4B Instruct for offline text requests. Download about 2.5 GB once, including the CPU runtime.')}</p>
        <button type="button" class="primary" data-local>${text('Lokales Modell herunterladen', 'Download local model')}</button>
        <div class="portable-ai-model-options">
          <button type="button" data-choose-model aria-describedby="portable-ai-model-hint">${text('Eigene GGUF-Datei auswählen', 'Choose your own GGUF file')}</button>
          <p id="portable-ai-model-hint">${text('Für Text eignet sich ein kleines Instruct-Modell, etwa in Q4.', 'For text, choose a small Instruct model, such as a Q4 variant.')}</p>
          <div class="portable-ai-model-catalogs">
            <button type="button" data-model-catalog="huggingface" aria-label="${text('Hugging Face im Browser öffnen', 'Open Hugging Face in your browser')}">Hugging Face ↗</button>
            <button type="button" data-model-catalog="modelscope" aria-label="${text('ModelScope im Browser öffnen', 'Open ModelScope in your browser')}">ModelScope ↗</button>
          </div>
          <p data-imported-model hidden></p>
        </div>
        <progress data-progress hidden max="100" aria-label="${text('Fortschritt der Modelleinrichtung', 'Model setup progress')}"></progress>
        <p data-local-status role="status" aria-live="polite"></p>
        <button type="button" data-local-cancel hidden>${text('Download abbrechen', 'Cancel download')}</button>
      </section>
      <section aria-labelledby="portable-ai-chatgpt-title">
        <h3 id="portable-ai-chatgpt-title">ChatGPT</h3>
        <p>${text('Dein ChatGPT-Konto im Browser verbinden. Anfragen nutzen deinen Tarif und dessen Limits und werden an OpenAI gesendet.', 'Connect your ChatGPT account in the browser. Requests use your plan and its limits and are sent to OpenAI.')}</p>
        <button type="button" class="primary" data-chatgpt>${text('Bei ChatGPT im Browser anmelden', 'Sign in to ChatGPT in the browser')}</button>
        <p data-chatgpt-status role="status" aria-live="polite"></p>
        <button type="button" data-chatgpt-cancel hidden>${text('Anmeldung abbrechen', 'Cancel sign-in')}</button>
      </section>
    </div>
    <p data-error role="alert" hidden></p>
    <div class="portable-ai-setup-footer">
      <button type="button" data-settings>${text('Weitere Möglichkeiten zum Anbinden', 'More ways to connect')}</button>
      <button type="button" data-skip>${text('Weiter ohne KI', 'Continue without AI')}</button>
    </div>`;

  const element = (selector) => dialog.querySelector(selector);
  let active = null;
  let closed = false;
  let cancelling = false;
  let operation = 0;
  let timer;
  const fail = (error) => {
    if (closed) return;
    element('[data-error]').textContent =
      error?.message ||
      text('Die Einrichtung ist fehlgeschlagen. Bitte erneut versuchen.', 'Setup failed. Please try again.');
    element('[data-error]').hidden = false;
  };
  const clearError = () => {
    element('[data-error]').hidden = true;
  };

  function render() {
    if (closed) return;
    const local = status.local || {};
    const chatgpt = status.chatgpt || {};
    const importing = active === 'import';
    const downloading = active === 'local' || local.downloading;
    const working = !!active || downloading || cancelling;
    element('[data-local]').disabled = working || !local.supported;
    element('[data-choose-model]').disabled = working || !local.supported;
    for (const button of dialog.querySelectorAll('[data-model-catalog]')) button.disabled = working;
    element('[data-chatgpt]').disabled = !!active || cancelling;
    element('[data-local]').textContent = local.installed
      ? text('Lokales Modell verwenden', 'Use local model')
      : text('Lokales Modell herunterladen', 'Download local model');
    element('[data-chatgpt]').textContent = chatgpt.connected
      ? text('ChatGPT verwenden', 'Use ChatGPT')
      : text('Bei ChatGPT im Browser anmelden', 'Sign in to ChatGPT in the browser');
    const progress = element('[data-progress]');
    progress.hidden = !downloading;
    const total = local.totalBytes || local.bytes;
    if (!importing && total > 0) progress.value = Math.min(100, (100 * (local.downloadedBytes || 0)) / total);
    else progress.removeAttribute('value');
    const amount =
      total > 0 ? `${Math.floor((local.downloadedBytes || 0) / 1000000)} / ${Math.ceil(total / 1000000)} MB` : '';
    const modelStatus = element('[data-local-status]');
    modelStatus.textContent = downloading
      ? local.installed
        ? text('Lokale Laufzeit wird gestartet …', 'Starting the local runtime …')
        : text('Download läuft … ', 'Downloading … ') + amount
      : local.downloadError ||
        (!local.supported
          ? text(
              'Das lokale Modell wird auf diesem Computer noch nicht unterstützt.',
              'The local model is not supported on this computer yet.',
            )
          : local.installed
            ? text('Das Modell ist installiert.', 'The model is installed.')
            : '');
    if (importing) modelStatus.textContent = downloading ? text('Eigenes Modell wird eingerichtet …', 'Setting up your model …') : '';
    const imported = element('[data-imported-model]');
    const importedName = typeof local.importedModel === 'string' ? local.importedModel : local.importedModel?.name;
    imported.hidden = !importedName;
    imported.textContent = importedName ? `${text('Eigenes Modell', 'Your model')} · ${importedName}` : '';
    element('[data-local-cancel]').textContent = importing
      ? text('Einrichtung abbrechen', 'Cancel setup')
      : text('Download abbrechen', 'Cancel download');
    element('[data-local-cancel]').hidden = !downloading;
    element('[data-local-cancel]').disabled = cancelling;
    element('[data-chatgpt-status]').textContent =
      chatgpt.message ||
      (chatgpt.pending
        ? text('Anmeldung im Browser abschließen …', 'Complete sign-in in the browser …')
        : chatgpt.connected
          ? text('ChatGPT ist verbunden.', 'ChatGPT is connected.')
          : '');
    element('[data-chatgpt-cancel]').hidden = active !== 'chatgpt' && !chatgpt.pending;
    element('[data-chatgpt-cancel]').disabled = cancelling;
  }

  function close() {
    closed = true;
    clearTimeout(timer);
    dialog.close();
    dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  async function cancelActive() {
    if (active === 'local' || active === 'import' || status.local?.downloading) {
      await desktop.portableAISetup({ action: 'cancelDownload' });
    }
    if (active === 'chatgpt' || status.chatgpt?.pending) await desktop.cancelChatGPTLogin();
  }

  async function dismiss(settings = false) {
    if (closed || cancelling) return;
    cancelling = true;
    operation++;
    clearTimeout(timer);
    render();
    try {
      await cancelActive();
      await desktop.portableAISetup({ action: 'dismiss' });
      close();
      if (settings) await openSettings?.();
    } catch (error) {
      fail(error);
      cancelling = false;
      render();
      schedule();
    }
  }

  function complete() {
    close();
    onReady?.();
  }

  async function useChatGPT() {
    if (closed || cancelling) return;
    await desktop.portableAISetup({ action: 'useChatGPT' });
    if (!closed && !cancelling) complete();
  }

  function schedule() {
    clearTimeout(timer);
    if (!closed && !cancelling && (active || status.local?.downloading || status.chatgpt?.pending)) {
      timer = setTimeout(poll, 700);
    }
  }

  async function poll() {
    if (closed || cancelling) return;
    try {
      status = await desktop.portableAISetup({ action: 'status', manual });
      if (closed || cancelling) return;
      if (operation === 0 && active === 'local' && status.local?.installed && !status.local.downloading) {
        await desktop.portableAISetup({ action: 'download' });
        if (!closed && !cancelling) complete();
        return;
      }
      if (active === 'chatgpt' || status.chatgpt?.pending) {
        status.chatgpt = await desktop.getChatGPTStatus();
        if (status.chatgpt.connected && !status.chatgpt.pending) {
          await useChatGPT();
          return;
        }
        if (!status.chatgpt.pending) active = null;
      }
      render();
    } catch (error) {
      fail(error);
    }
    schedule();
  }

  async function setupLocal(action) {
    if (active || cancelling || closed) return;
    clearError();
    const currentOperation = ++operation;
    active = action === 'chooseModel' ? 'import' : 'local';
    render();
    schedule();
    try {
      const result = await desktop.portableAISetup({ action });
      const selected = action !== 'chooseModel' || result?.selected;
      if (!closed && !cancelling && currentOperation === operation && selected && !result?.cancelled) complete();
    } catch (error) {
      if (currentOperation === operation) fail(error);
    } finally {
      if (currentOperation === operation) active = null;
      if (!closed && !cancelling && currentOperation === operation) {
        try {
          status = await desktop.portableAISetup({ action: 'status', manual });
        } catch (error) {
          fail(error);
        }
        render();
        schedule();
      }
    }
  }
  element('[data-local]').onclick = () => void setupLocal('download');
  element('[data-choose-model]').onclick = () => void setupLocal('chooseModel');
  for (const button of dialog.querySelectorAll('[data-model-catalog]')) {
    button.onclick = async () => {
      clearError();
      try {
        await desktop.portableAISetup({ action: 'openModelCatalog', catalog: button.dataset.modelCatalog });
      } catch (error) {
        fail(error);
      }
    };
  }
  element('[data-chatgpt]').onclick = async () => {
    if (active || cancelling || closed) return;
    clearError();
    const currentOperation = ++operation;
    active = 'chatgpt';
    render();
    try {
      if (status.chatgpt?.connected) await useChatGPT();
      else {
        const chatgpt = await desktop.startChatGPTLogin();
        if (closed || cancelling || currentOperation !== operation) return;
        status.chatgpt = chatgpt;
        if (!closed && !cancelling && status.chatgpt?.connected && !status.chatgpt.pending) await useChatGPT();
        else schedule();
      }
    } catch (error) {
      if (currentOperation === operation) {
        active = null;
        fail(error);
      }
    }
    render();
  };
  async function cancel() {
    if (cancelling || closed) return;
    cancelling = true;
    operation++;
    clearTimeout(timer);
    render();
    try {
      await cancelActive();
      active = null;
      status = await desktop.portableAISetup({ action: 'status', manual });
    } catch (error) {
      fail(error);
    } finally {
      cancelling = false;
      render();
      schedule();
    }
  }
  element('[data-local-cancel]').onclick = cancel;
  element('[data-chatgpt-cancel]').onclick = cancel;
  element('[data-close]').onclick = () => void dismiss();
  element('[data-skip]').onclick = () => void dismiss();
  element('[data-settings]').onclick = () => void dismiss(true);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void dismiss();
  });
  document.body.append(dialog);
  if (status.local?.downloading) active = 'local';
  else if (status.chatgpt?.pending) active = 'chatgpt';
  render();
  dialog.showModal();
  element('[data-skip]').focus();
  schedule();
  return dialog;
}
