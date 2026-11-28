import './projects.css';
export function createCadProjectsUI({
  desktop,
  modal,
  open,
  save,
  safe,
  thumbnail,
  openTabletNotes,
  openTabletSketch,
  openTabletPart,
  t = (v) => v,
}) {
  let release = () => {},
    generation = 0;
  function attachTabletTransfer(dialog, after, { quick = false } = {}) {
    if (!desktop?.beginTabletTransfer) return;
    const panel = dialog.ownerDocument.createElement('details');
    panel.innerHTML =
      '<summary>Tablet verbinden</summary><label>Lokale PC-Adresse <select id="tablet-pc-address"></select></label> <label><input type="checkbox" id="tablet-pc-allow-ai"> KI-Anbieter für diese Verbindung freigeben</label><label><input type="checkbox" id="tablet-pc-allow-agent"> Formnaro-Agentenchat teilen (einschließlich Modelländerungen und Exporten)</label><div class="project-shortcuts"><button id="tablet-pc-begin" disabled>Kopplungscode erzeugen</button><button id="tablet-pc-copy" disabled>Code kopieren</button><button id="tablet-pc-stop">Verbindung trennen</button><button id="tablet-pc-inbox">Tablet-Eingang öffnen</button></div><p id="tablet-pc-status" role="status" class="small-note"></p>';
    const liveLabel = dialog.ownerDocument.createElement('label');
    liveLabel.innerHTML =
      '<input type="checkbox" id="tablet-pc-allow-live"> Teile und Ansichten am Tablet steuern lassen';
    const remembered = dialog.ownerDocument.createElement('div');
    remembered.hidden = !desktop.tabletKnown;
    remembered.innerHTML =
      '<label><input type="checkbox" id="tablet-pc-remember"> Tablet für spätere Verbindungen zulassen</label><p id="tablet-pc-known-status" class="small-note"></p><div id="tablet-pc-known-devices" class="project-shortcuts"></div>';
    panel.querySelector('.project-shortcuts').before(liveLabel, remembered);
    after.after(panel);
    const $ = (name) => panel.querySelector('#tablet-pc-' + name);
    const address = $('address'),
      begin = $('begin'),
      copy = $('copy'),
      status = $('status');
    const qr = dialog.ownerDocument.createElement('img');
    qr.id = 'tablet-pc-qr';
    qr.alt = 'QR-Code zum Koppeln mit Formano Mini';
    qr.width = 284;
    qr.hidden = true;
    status.before(qr);
    if (quick) {
      panel.querySelector('summary').textContent = 'Verbindungseinstellungen';
      $('allow-live').checked = true;
      const actions = dialog.ownerDocument.createElement('div');
      actions.className = 'project-shortcuts';
      actions.append(begin, copy);
      after.append(qr, status, actions);
    }
    const active = () => dialog.open && panel.isConnected;
    let qrTimer,
      knownTimer,
      lastKnown,
      readingKnown = false;
    function clearQr() {
      clearTimeout(qrTimer);
      qr.removeAttribute('src');
      qr.hidden = true;
    }
    dialog.addEventListener(
      'close',
      () => {
        clearQr();
        clearInterval(knownTimer);
      },
      { once: true },
    );
    async function refreshKnown() {
      if (!active()) {
        clearInterval(knownTimer);
        return;
      }
      if ((!quick && !panel.open) || !desktop.tabletKnown || readingKnown) return;
      readingKnown = true;
      try {
        const info = await desktop.tabletKnown();
        remembered.hidden = !info.available;
        if (!lastKnown) {
          $('remember').checked = info.enabled;
          if (Array.from(address.options).some(option => option.value === info.host)) address.value = info.host;
        }
        const snapshot = JSON.stringify(info);
        if (snapshot === lastKnown) return;
        lastKnown = snapshot;
        $('known-status').textContent =
          info.error ||
          (info.host
            ? 'Bekannte Tablets können sich über ' + info.host + ' verbinden.'
            : info.enabled
              ? 'Warte auf die gespeicherte Netzwerkverbindung.'
              : 'Gespeicherte Tablets sind gerade nicht erreichbar.');
        const rows = info.devices.map(({ id, name, agent }) => {
          const button = dialog.ownerDocument.createElement('button');
          button.type = 'button';
          button.textContent = name + ' · ' + id.slice(0, 6) + (agent ? ' · Agent freigegeben' : '') + ' entkoppeln';
          button.dataset.tabletDevice = id;
          button.onclick = () =>
            safe(async () => {
              button.disabled = true;
              try {
                await desktop.revokeTablet({ id });
                await refreshKnown();
              } finally {
                button.disabled = false;
              }
            });
          return button;
        });
        $('known-devices').replaceChildren(...rows);
      } finally {
        readingKnown = false;
      }
    }
    if (desktop.tabletKnown) knownTimer = setInterval(() => void safe(refreshKnown), 1500);
    async function loadAddresses() {
      const addresses = await desktop.tabletAddresses();
      if (!active()) return;
      address.replaceChildren(...addresses.map(ip => new Option(ip, ip)));
      begin.disabled = !address.options.length;
      if (begin.disabled) status.textContent = 'PC mit einem lokalen WLAN oder Netzwerkkabel verbinden.';
      await refreshKnown();
    }
    async function beginTransfer() {
      if (!active() || !address.value || begin.disabled) return;
      begin.disabled = copy.disabled = true;
      clearQr();
      if (quick) status.textContent = 'QR-Code wird erzeugt …';
      try {
        const result = await desktop.beginTabletTransfer({
          bind: address.value,
          allowProvider: $('allow-ai').checked,
          allowLive: $('allow-live').checked,
          allowAgent: $('allow-agent').checked,
          remember: $('remember').checked,
        });
        if (!active()) return;
        await refreshKnown();
        if (!active()) return;
        if (result.qr) {
          qr.src = result.qr;
          qr.hidden = false;
          qrTimer = setTimeout(
            () => {
              clearQr();
              copy.disabled = true;
              status.textContent = 'Kopplungscode abgelaufen. Einen neuen Code erzeugen.';
            },
            Math.max(0, result.expires - Date.now()),
          );
        }
        status.textContent = quick
          ? (result.qr ? 'QR-Code gilt zwei Minuten.' : 'Kopplungscode kopieren und am Tablet eingeben.')
          : 'Ziel „' + result.target.name + '“. ' + (result.qr ? 'QR scannen oder ' : '') +
            'Code kopieren und in Formano Mini einfügen. Zwei Minuten zum Koppeln.';
        copy.disabled = false;
      } catch (error) {
        if (!quick) throw error;
        if (active()) status.textContent = error.message;
      } finally {
        begin.disabled = false;
      }
    }
    if (quick) {
      status.textContent = 'QR-Code wird erzeugt …';
      void safe(async () => {
        await loadAddresses();
        await beginTransfer();
      });
    } else {
      panel.addEventListener('toggle', () => {
        if (panel.open && !address.options.length) void safe(loadAddresses);
      });
    }
    begin.onclick = () => safe(beginTransfer);
    copy.onclick = () =>
      safe(async () => {
        await desktop.copyTabletTransferCode();
        status.textContent = 'Kopplungscode kopiert. In Formano Mini einfügen.';
      });
    $('stop').onclick = () =>
      safe(async () => {
        await desktop.stopTabletTransfer();
        clearQr();
        copy.disabled = true;
        status.textContent = 'Tablet-Verbindung getrennt.';
        $('remember').checked = false;
        await refreshKnown();
      });
    $('inbox').onclick = () => safe(() => desktop.openTabletInbox());
  }
  function openTabletPairing() {
    ++generation;
    release();
    modal('Tablet koppeln', '<div id="tablet-pairing-code"><p>Am Tablet „CAD-Projekt → Mit PC verbinden → QR scannen“ öffnen.</p></div>');
    const code = document.getElementById('tablet-pairing-code');
    attachTabletTransfer(code.closest('dialog'), code, { quick: true });
  }
  function closeTabletPairing() {
    document.getElementById('tablet-pairing-code')?.closest('dialog')?.close();
  }
  async function show() {
    const ticket = ++generation;
    release();
    const data = desktop?.listProjects ? await desktop.listProjects() : null;
    if (ticket !== generation) return;
    modal(
      'Projekte',
      '<p>Das Projekt enthält alle Teile, Quellen, Layer, Notizen und die aktuelle Ansicht.</p><div class="project-shortcuts"><button id="projects-save" class="primary">Projekt speichern</button><button id="projects-save-as">Speichern unter …</button><button id="projects-open">Projekt öffnen …</button><button id="projects-folder">Projektordner öffnen</button></div><p id="projects-directory" class="small-note" data-no-translate></p><h3>Zuletzt verwendet</h3><div id="projects-recent" class="project-file-list"></div><h3 id="projects-files-heading">Im Projektordner</h3><div id="projects-files" class="project-file-list"></div>',
    );
    document.getElementById('modal').classList.add('projects-modal');
    const $ = (id) => document.getElementById(id);
    const dialog = $('modal'),
      list = $('projects-recent'),
      abort = new AbortController(),
      queue = [],
      requests = new Map(),
      previewRows = [];
    let running = false,
      polling = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            const job = entry.target.previewJob;
            if (job) {
              queue.push(job);
              void pump();
            }
          }
      },
      { root: dialog, rootMargin: '80px' },
    );
    const detached = new MutationObserver(() => {
      if (!list.isConnected) release();
    });
    detached.observe($('modal-body'), { childList: true });
    const pollTimer =
      data && desktop?.projectThumbnail
        ? setInterval(async () => {
            if (polling || abort.signal.aborted) return;
            polling = true;
            try {
              const fresh = await desktop.listProjects();
              if (abort.signal.aborted) return;
              const files = new Map([...fresh.recent, ...fresh.files].map((f) => [f.id, f]));
              for (const row of previewRows) {
                const next = files.get(row.file.id) ?? { ...row.file, exists: false, previewStamp: null };
                if (next.previewStamp === row.target.previewStamp) continue;
                requests.delete(next.id);
                row.file = next;
                row.button.disabled = !next.exists;
                row.date.textContent = next.exists
                  ? new Date(next.usedAt ?? next.modifiedAt).toLocaleString()
                  : t('Datei nicht mehr vorhanden');
                row.target.previewStamp = next.previewStamp;
                row.target.textContent = t('Kein Vorschaubild');
                row.target.classList.remove('loaded');
                row.target.previewJob = { file: next, target: row.target, stamp: next.previewStamp };
                if (next.exists) observer.observe(row.target);
              }
            } catch {
              /* File-list failures leave the dialog usable. */
            } finally {
              polling = false;
            }
          }, 2000)
        : null;
    release = () => {
      abort.abort();
      clearInterval(pollTimer);
      observer.disconnect();
      detached.disconnect();
      dialog.removeEventListener('close', release);
      queue.length = 0;
    };
    dialog.addEventListener('close', release, { once: true });
    async function pump() {
      if (running || abort.signal.aborted) return;
      running = true;
      try {
        while (queue.length && !abort.signal.aborted) {
          const { file, target, stamp } = queue.shift();
          if (target.previewStamp !== stamp) continue;
          try {
            let image = requests.get(file.id);
            if (image === undefined) {
              const result = await desktop.projectThumbnail({ id: file.id });
              if (abort.signal.aborted) break;
              image = result.image;
              if (!image && result.project && thumbnail) {
                image = await thumbnail(result.project, abort.signal);
                if (abort.signal.aborted) break;
                const cached = await desktop.cacheProjectThumbnail({ id: file.id, token: result.token, image });
                if (!cached.cached) image = null;
              }
              if (target.previewStamp === stamp) requests.set(file.id, image ?? null);
            }
            if (image && target.previewStamp === stamp && target.isConnected && !abort.signal.aborted) {
              const img = document.createElement('img');
              img.alt = t('Projektvorschau');
              img.width = 120;
              img.height = 80;
              img.onload = () => {
                if (target.previewStamp === stamp && target.isConnected && !abort.signal.aborted) {
                  target.replaceChildren(img);
                  target.classList.add('loaded');
                }
              };
              img.src = image;
            }
          } catch {
            /* A failed preview keeps its accessible placeholder; opening stays available. */
          }
        }
      } finally {
        running = false;
      }
    }
    $('projects-save').onclick = () =>
      safe(async () => {
        const result = await save();
        if (result?.saved) await show();
      });
    $('projects-save-as').onclick = () =>
      safe(async () => {
        const result = await save({ saveAs: true });
        if (result?.saved) await show();
      });
    if (desktop?.readGeometryBlock) {
      const pack = document.createElement('button');
      pack.id = 'projects-save-pack';
      pack.textContent = t('Als Geometriepaket (.fnpack) speichern …');
      pack.onclick = () =>
        safe(async () => {
          const result = await save({ saveAs: true, format: 'fnpack' });
          if (result?.saved) await show();
        });
      $('projects-save-as').after(pack);
    }
    $('projects-open').onclick = () => safe(() => open());
    $('projects-folder').hidden = !data;
    $('projects-folder').onclick = () => safe(() => desktop.openProjectsFolder());
    if (desktop?.beginTabletTransfer && openTabletNotes) {
      const notes = document.createElement('button');
      notes.id = 'tablet-project-notes-open';
      notes.type = 'button';
      notes.textContent = t('Tablet-Notizen');
      notes.onclick = () => safe(openTabletNotes);
      $('projects-folder').after(notes);
    }
    if (desktop?.beginTabletTransfer && openTabletSketch) {
      const button = document.createElement('button');
      button.id = 'tablet-project-sketch-open';
      button.type = 'button';
      button.textContent = t('Tablet-Skizze');
      button.onclick = () => safe(openTabletSketch);
      $('projects-folder').after(button);
    }
    if (desktop?.beginTabletTransfer && openTabletPart) {
      const button = document.createElement('button');
      button.id = 'tablet-project-part-open';
      button.type = 'button';
      button.textContent = t('Tablet-Teil empfangen');
      button.onclick = () => safe(openTabletPart);
      $('projects-folder').after(button);
    }
    $('projects-directory').textContent =
      data?.directory ?? t('Im Browser werden Projekte als .ocad-Datei heruntergeladen.');
    attachTabletTransfer(dialog, $('projects-directory'));
    function rows(id, files, empty) {
      const root = $(id);
      if (!files.length) {
        const note = document.createElement('p');
        note.className = 'small-note';
        note.textContent = t(empty);
        root.append(note);
        return;
      }
      for (const file of files) {
        const button = document.createElement('button');
        button.className = 'project-file';
        button.disabled = !file.exists;
        button.title = file.path;
        const name = document.createElement('strong');
        name.dataset.noTranslate = '';
        name.textContent = file.name;
        const detail = document.createElement('span');
        detail.dataset.noTranslate = '';
        detail.textContent = file.path;
        const date = document.createElement('small');
        date.textContent = file.exists
          ? new Date(file.usedAt ?? file.modifiedAt).toLocaleString()
          : t('Datei nicht mehr vorhanden');
        const preview = document.createElement('div');
        preview.className = 'project-preview';
        preview.textContent = t('Kein Vorschaubild');
        button.append(preview, name, detail, date);
        button.onclick = () => safe(() => open(file.id));
        root.append(button);
        preview.previewStamp = file.previewStamp;
        previewRows.push({ file, target: preview, button, date });
        if (file.exists && desktop?.projectThumbnail) {
          preview.previewJob = { file, target: preview, stamp: file.previewStamp };
          observer.observe(preview);
        }
      }
    }
    rows('projects-recent', data?.recent ?? [], 'Noch keine Projekte gespeichert oder geöffnet.');
    rows('projects-files', data?.files ?? [], 'Noch keine Projekte in diesem Ordner.');
    $('projects-files-heading').hidden = !data;
    $('projects-files').hidden = !data;
    if (data?.truncated) {
      const note = document.createElement('p');
      note.textContent = t('Weitere Projekte über „Projekt öffnen …“ auswählen.');
      $('projects-files').append(note);
    }
  }
  return { show, openTabletPairing, closeTabletPairing };
}
