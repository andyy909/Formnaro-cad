export function showPhotoProfile(store, reference, revision) {
  const dialog = document.createElement('dialog');
  dialog.id = 'photo-profile-dialog';
  dialog.dataset.noTranslate = '';
  dialog.innerHTML = `<header><h2>CAD-Körper aus Foto</h2></header>
    <p>Die bestätigte Kontur wird als Skizze auf der aktiven Arbeitsebene extrudiert. Gib die Materialdicke in Millimetern an.</p>
    <label>Extrusionshöhe (mm)<input id="photo-profile-height" type="text" inputmode="decimal"></label>
    <p id="photo-profile-status" role="status"></p>
    <img id="photo-profile-image" alt="Vorschau des nativen CAD-Körpers" hidden>
    <div class="photo-tools">
      <button type="button" id="photo-profile-preview">CAD-Vorschau</button>
      <button type="button" id="photo-profile-apply" class="primary" disabled>CAD-Körper übernehmen</button>
      <button type="button" id="photo-profile-close">Schließen</button>
    </div>`;
  const byId = (id) => dialog.querySelector('#photo-profile-' + id),
    height = byId('height'), image = byId('image'), status = byId('status'),
    preview = byId('preview'), apply = byId('apply'), close = byId('close');
  let pending = null, busy = false, applied = false;

  function lock(value) {
    busy = value;
    height.disabled = preview.disabled = close.disabled = busy;
    apply.disabled = busy || !pending;
  }
  function discard() {
    if (pending) store.discardProfile(pending.proposal.previewId);
    pending = null;
    image.hidden = true;
    image.removeAttribute('src');
  }

  preview.onclick = async () => {
    if (busy) return;
    discard();
    lock(true);
    status.textContent = 'CAD-Körper wird berechnet …';
    try {
      const value = height.value.trim().replace(',', '.');
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw Error('Extrusionshöhe in Millimetern eingeben.');
      pending = await store.previewProfile(reference.imageId, Number(value), { revision });
      image.src = pending.image;
      image.hidden = false;
      status.textContent = 'Vorschau bereit. Übernehmen fügt einen bearbeitbaren CAD-Körper hinzu.';
    } catch (error) {
      discard();
      status.textContent = error.message;
    } finally {
      lock(false);
    }
  };
  height.oninput = () => {
    if (busy) return;
    discard();
    status.textContent = '';
    lock(false);
  };
  apply.onclick = async () => {
    if (busy || !pending) return;
    lock(true);
    try {
      await store.applyProfile(pending);
      pending = null;
      applied = true;
      dialog.close();
    } catch (error) {
      discard();
      status.textContent = error.message;
    } finally {
      lock(false);
    }
  };
  close.onclick = () => dialog.close();
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => {
    discard();
    dialog.remove();
    resolve(applied);
  }, { once: true }));
}
