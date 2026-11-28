export function createCadTabletFaceUI({
  host, desktop, controller, view, ready, preparePick, pair, paired, partForHit, hasParts, canReplaceReturned, openReturned, toast, t,
}) {
  if (!host || !desktop?.beginTabletTransfer || !desktop.tabletFaceSketchRecipients) return null;

  const controls = document.createElement('div');
  controls.id = 'tablet-face-controls';
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'tablet-face-sketch';
  button.className = 'primary';
  button.setAttribute('aria-pressed', 'false');
  const picker = document.createElement('select');
  picker.hidden = true;
  picker.setAttribute('aria-label', t('Tablet für Flächenskizze'));
  controls.append(picker, button);
  host.append(controls);

  let recipients = [];
  let selection;
  let preparing = false;
  let sending = false;
  let pending;
  let recipientSignature = '';
  const returned = [];

  function refresh() {
    const connected = recipients.length > 0;
    const available = connected && hasParts();
    picker.hidden = recipients.length < 2;
    picker.disabled = !!selection || preparing || sending || !!pending;
    button.disabled = connected && (!available || preparing || sending || !!pending);
    const label = !connected ? t('Tablet koppeln') : selection ? t('Fläche anklicken') : t('Fläche ans Tablet');
    if (button.textContent !== label) button.textContent = label;
    if (connected) {
      button.removeAttribute('aria-haspopup');
      button.setAttribute('aria-pressed', String(!!selection));
    } else {
      button.setAttribute('aria-haspopup', 'dialog');
      button.removeAttribute('aria-pressed');
    }
    button.title = !connected ? t('QR-Code auf dem PC anzeigen') :
      !available ? t('Öffne ein Modell mit einer sichtbaren CAD-Fläche.') : selection
      ? t('Ebene CAD-Fläche anklicken oder mit Esc abbrechen')
      : t('Ebene CAD-Fläche als bearbeitbare Skizze ans Tablet senden');
  }

  function stop() {
    if (!selection) return;
    selection.abort.abort();
    selection = null;
    view.setInteraction(null);
    refresh();
  }

  async function pick(ray, _event, hit) {
    const job = selection;
    if (!job || job.running) return;
    const current = () => job === selection && job.scope === controller.projectScope() &&
      job.revision === controller.revision();
    const part = partForHit(hit);
    if (!part) {
      toast(t('Bitte eine sichtbare ebene CAD-Fläche anklicken.'));
      return;
    }
    job.running = true;
    const options = {signal: job.abort.signal};
    try {
      const camera = view.camera();
      camera.updateMatrixWorld(true);
      const axes = camera.matrixWorld.elements;
      const viewAxes = {right: axes.slice(0, 3), up: axes.slice(4, 7)};
      const face = await controller.query('rayPick', {ray, ids: [part.id], withGeometryDigest: true}, options);
      if (!current()) return;
      if (!face) throw Error(t('Keine CAD-Fläche getroffen.'));
      const {sketch, frame} = await controller.query(
        'tabletFaceSketch', {nodeId: part.id, faceIndex: face.faceIndex, viewAxes}, options,
      );
      if (!current() || partForHit(hit)?.id !== part.id) return;
      ready();
      sending = true;
      stop();
      const {id} = await desktop.queueTabletFaceSketch({
        recipientId: job.recipientId, name: (part.name + ' · Fläche ' + face.faceIndex).slice(0, 200),
        sketch, frame, opening: job.scope,
        binding: {targetId: part.id, point: face.point, normal: face.normal, geometryDigest: face.geometryDigest},
      });
      pending = {id, recipientId: job.recipientId, expires: Date.now() + 5 * 60 * 1000};
      toast(t('Flächenskizze wartet auf das Tablet …'));
    } catch (error) {
      if (error.name !== 'AbortError' && (current() || sending)) toast(error.message);
    } finally {
      job.running = false;
      sending = false;
      refresh();
    }
  }

  button.onclick = async () => {
    if (selection) {
      stop();
      return;
    }
    const recipientId = picker.value;
    try {
      ready();
      if (!recipients.length) {
        pair();
        return;
      }
      if (!recipients.some(item => item.recipientId === recipientId)) return;
      preparing = true;
      refresh();
      const scope = controller.projectScope();
      await preparePick();
      if (scope !== controller.projectScope()) return;
      ready();
      selection = {recipientId, scope: controller.projectScope(), revision: controller.revision(),
        abort: new AbortController(), running: false};
      view.setInteraction(pick);
      refresh();
      toast(t('Ebene CAD-Fläche für das Tablet anklicken.'));
    } catch (error) {
      toast(error.message);
    } finally {
      preparing = false;
      refresh();
    }
  };

  function openNextReturn() {
    while (returned.length && returned[0].opening !== controller.projectScope()) returned.shift();
    if (!returned.length || selection || preparing || sending) return;
    if (!canReplaceReturned(returned[0])) {
      try { ready(); }
      catch { return; }
    }
    openReturned(returned.shift());
  }

  async function poll() {
    try { openNextReturn(); }
    catch (error) { toast(error.message); }
    try {
      const hadRecipient = recipients.length > 0;
      recipients = await desktop.tabletFaceSketchRecipients();
      if (!hadRecipient && recipients.length) paired();
      if (selection && (!hasParts() || selection.scope !== controller.projectScope() ||
        selection.revision !== controller.revision() ||
        !recipients.some(item => item.recipientId === selection.recipientId))) stop();
      const devices = recipients.map(({recipientId, name}) => [recipientId, name]);
      const signature = JSON.stringify(devices);
      if (signature !== recipientSignature) {
        const selected = picker.value;
        picker.replaceChildren(...devices.map(([id, name]) => new Option(name, id)));
        if (devices.some(([id]) => id === selected)) picker.value = selected;
        recipientSignature = signature;
      }
      if (pending && recipients.some(item => item.recipientId === pending.recipientId && item.receipt === pending.id)) {
        toast(t('Flächenskizze ist auf dem Tablet angekommen.'));
        pending = null;
      } else if (pending && Date.now() >= pending.expires) {
        toast(t('Das Tablet hat den Empfang der Flächenskizze nicht bestätigt.'));
        pending = null;
      }
      refresh();
    } catch {
      recipients = [];
      stop();
      refresh();
    } finally {
      setTimeout(poll, 400);
    }
  }
  refresh();
  void poll();
  return {stop, receiveReturned(imported) {
    if (returned.length >= 8) throw Error(t('Am PC warten bereits mehrere Flächenskizzen.'));
    returned.push(imported);
    openNextReturn();
    return {status: returned.includes(imported) ? 'queued' : 'opened'};
  }};
}
