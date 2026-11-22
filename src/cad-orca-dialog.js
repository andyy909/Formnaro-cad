export function createOrcaDialog({ $, request, modal, getModalSequence, prepare, geometry, hasSelection, openAgent }) {
  const categories = ['machine', 'process', 'filament'];
  const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  const time = seconds => {
    const rounded = Math.round(seconds);
    const minutes = Math.floor(rounded / 60);
    return minutes + ':' + String(rounded % 60).padStart(2, '0') + ' min';
  };

  async function show() {
    prepare();
    modal('3D-Druck mit OrcaSlicer', `
      <p id="orca-status" role="status">OrcaSlicer wird gesucht …</p>
      <section id="orca-installations" hidden>
        <label class="dialog-label">Orca-Installation<select id="orca-mode"><option value="system">Vorhandene Installation</option><option value="portable">Portable Installation</option></select></label>
        <p id="orca-instance-info"></p>
        <progress id="orca-download" max="100" aria-label="Orca-Download" hidden></progress>
        <div class="modal-actions"><button id="orca-launch" hidden>OrcaSlicer öffnen</button><button id="orca-portable">OrcaSlicer portabel einrichten</button><button id="orca-check">Nach Update suchen</button></div>
      </section>
      <section id="orca-controls" hidden>
        <label class="dialog-label">Teile
          <select id="orca-scope"><option value="all">Sichtbare Teile</option><option value="selection">Ausgewählte Teile</option></select>
        </label>
        <label class="dialog-label">Drucker und Düse<select id="orca-machine"></select></label>
        <label class="dialog-label">Prozess<select id="orca-process"></select></label>
        <label class="dialog-label">Filament<select id="orca-filament"></select></label>
        <label class="dialog-label">Schichthöhe in mm
          <input id="orca-layer" type="number" min="0.05" max="1" step="0.01" placeholder="Aus Prozessprofil">
        </label>
        <div class="modal-actions">
          <button id="orca-configure">Profile für KI merken</button>
          <button id="orca-agent">Agenten-Chat öffnen</button>
          <button id="orca-open-model">Modell in Orca öffnen</button>
          <button class="primary" id="orca-slice">Slicen</button>
          <button id="orca-cancel" hidden>Abbrechen</button>
        </div>
      </section>
      <div class="modal-actions"><button id="orca-install-chat" hidden>Orca-Seitenleiste bereitstellen</button><button id="orca-choose" hidden>OrcaSlicer auswählen …</button></div>
      <section id="orca-results" hidden>
        <label class="dialog-label">Ergebnisse dieser Sitzung<select id="orca-recent"></select></label>
        <div id="orca-report" role="status"></div>
        <div class="modal-actions">
          <button id="orca-save">Druckprojekt speichern …</button>
          <button class="primary" id="orca-open-result">Druckprojekt in Orca öffnen</button>
        </div>
      </section>
    `);
    const session = getModalSequence();
    const current = () => session === getModalSequence() && $('modal').open;
    const setStatus = message => { if (current()) $('orca-status').textContent = message; };
    const field = category => $('orca-' + category);
    let state, running = false, task;
    const chosen = () => Object.fromEntries(categories.map(category => [category, field(category).value]));
    const hasProfiles = () => categories.every(category => field(category).value);
    $('orca-scope').value = hasSelection() ? 'selection' : 'all';

    function fill(select, values, selected, placeholder) {
      select.replaceChildren(new Option(placeholder, ''),
        ...values.map(value => new Option(value.name + (value.custom ? ' (Benutzerprofil)' : ''), value.id)));
      select.value = values.some(value => value.id === selected) ? selected : '';
    }

    function linked(proposed = {}) {
      const machine = state.choices.machine.find(value => value.id === field('machine').value);
      for (const [category, fallback] of [['process', 'defaultProcess'], ['filament', 'defaultFilament']]) {
        const values = state.choices[category].filter(value => machine &&
          (!value.machines.length || value.machines.includes(machine.name) || value.machines.includes(machine.parent)));
        const suggested = values.find(value => value.name === machine?.[fallback])?.id;
        const pick = proposed[category] || suggested;
        fill(field(category), values, pick, 'Profil auswählen');
      }
      enable();
    }

    function enable() {
      $('orca-slice').disabled = running || !hasProfiles();
      $('orca-configure').disabled = running || !hasProfiles();
      $('orca-open-model').disabled = running;
      $('orca-agent').disabled = running;
      $('orca-choose').disabled = running;
      for (const id of ['orca-mode','orca-portable','orca-launch','orca-check','orca-install-chat']) $(id).disabled = running;
      $('orca-cancel').hidden = !running;
      for (const category of categories) field(category).disabled = running;
      $('orca-scope').disabled = running;
      $('orca-layer').disabled = running;
    }

    function report() {
      const result = state.recent.find(value => value.id === $('orca-recent').value);
      const content = $('orca-report');
      content.replaceChildren();
      if (!result) return;
      const settings = result.settings.layerHeight ? number.format(result.settings.layerHeight) + ' mm' : 'Schichthöhe aus Profil';
      const details = document.createElement('p');
      details.textContent = [result.profiles.machine, result.profiles.process, result.profiles.filament, settings].join(' · ');
      content.append(details);
      if (result.profileNote) {
        const note = document.createElement('p');
        note.textContent = result.profileNote;
        content.append(note);
      }
      for (const plate of result.plates) {
        const row = document.createElement('p');
        row.textContent = 'Platte ' + plate.plate + ' · ' + time(plate.seconds) + ' · ' +
          number.format(plate.grams) + ' g · ' + plate.layers + ' Schichten' +
          (plate.supportGrams > 0 ? ' · ' + number.format(plate.supportGrams) + ' g Stützen' : '');
        content.append(row);
      }
    }

    function updateResults() {
      $('orca-results').hidden = !state.recent.length;
      $('orca-recent').replaceChildren(...state.recent.map(value => {
        const stamp = new Date(value.createdAt).toLocaleTimeString('de-DE');
        const layer = value.settings.layerHeight ? ' · ' + number.format(value.settings.layerHeight) + ' mm' : '';
        return new Option(stamp + layer + ' · ' + value.plates.length + ' Platte(n)', value.id);
      }));
      report();
    }

    function display(value) {
      state = value;
      running = value.busy;
      $('orca-installations').hidden = !value.supported;
      $('orca-mode').value = value.mode || 'system';
      $('orca-mode').querySelector('[value="portable"]').disabled = !value.portableVersion;
      const update = value.updateAvailable;
      $('orca-portable').hidden = !!value.portableVersion && !update;
      $('orca-portable').textContent = value.portableVersion && update ? 'Portables Orca auf ' + value.latestVersion + ' aktualisieren' : 'OrcaSlicer portabel einrichten';
      $('orca-portable').classList.toggle('primary', !value.available);
      $('orca-check').hidden = !value.portableVersion;
      $('orca-instance-info').textContent = value.available ? [value.version ? 'OrcaSlicer ' + value.version : 'OrcaSlicer',value.executable,
        value.connected ? 'Chat verbunden' : value.pluginPresent ? 'Chat-Plugin bereitgestellt' : 'Chat-Plugin noch einrichten'].join(' · ') : '';
      $('orca-launch').hidden = !value.available;
      $('orca-controls').hidden = !value.available;
      $('orca-choose').hidden = !value.supported;
      $('orca-install-chat').hidden = !value.available;
      $('orca-choose').textContent = value.available ? 'Anderes OrcaSlicer wählen …' : 'OrcaSlicer auswählen …';
      if (!value.available) {
        enable();
        updateResults();
        setStatus(value.supported ? 'OrcaSlicer wurde nicht gefunden.' : 'Die OrcaSlicer-Brücke unterstützt Windows.');
        return;
      }
      fill(field('machine'), value.choices.machine, value.defaults.machine, 'Drucker auswählen');
      linked(value.defaults);
      updateResults();
      setStatus(running ? 'Ein Orca-Auftrag läuft …' :
        value.version && /^v?(?:[01]\.|2\.[0-4](?:\.|$))/.test(value.version) ? 'Für den Chat und die Druckstatistik wird OrcaSlicer ab 2.5 benötigt.' : value.choices.machine.length ? '' : 'Richte zuerst einen Drucker in OrcaSlicer ein.');
    }

    const perform = operation => async () => {
      if (!current()) return;
      try { await operation(); }
      catch (error) { setStatus(error.message); }
    };

    async function start(action) {
      if (running) return;
      const target = geometry($('orca-scope').value === 'selection');
      const layer = $('orca-layer');
      if (action === 'slice' && !layer.reportValidity()) return;
      const extra = action === 'slice'
        ? { profiles: chosen(), ...(layer.value ? { layerHeight: Number(layer.value) } : {}) } : {};
      running = true;
      task = new AbortController();
      enable();
      setStatus(action === 'slice' ? 'OrcaSlicer berechnet den Druck …' : 'Formnaro übergibt das Modell …');
      try {
        const result = await request({ action, ...target, ...extra }, task.signal);
        if (!current()) return;
        if (action === 'slice') {
          state.recent = [result, ...state.recent].slice(0, 8);
          updateResults();
          setStatus('Druckprojekt berechnet. Zeit und Verbrauch sind Schätzwerte.');
        } else setStatus('Das Modell wurde an OrcaSlicer übergeben.');
      } finally {
        task = undefined;
        running = false;
        if (current()) enable();
      }
    }

    async function manage(args) {
      if (running) return;
      running = true;
      enable();
      let timer;
      if (args.action === 'installPortable') {
        setStatus('Portable Einrichtung wird gestartet …');
        timer = setInterval(async () => {
          try {
            const progress = await request({action:'installProgress'});
            if (timer && progress && current()) {
              setStatus(progress);
              const percentage = /^Download (\d+) %$/.exec(progress);
              $('orca-download').hidden = !percentage;
              if (percentage) $('orca-download').value = Number(percentage[1]);
            }
          } catch { /* The initiating request reports installation errors. */ }
        }, 500);
      }
      try {
        const result = await request(args);
        if (current()) {
          display(result);
          if (args.action === 'checkRelease' && !result.updateAvailable) setStatus('Die portable Version ist aktuell.');
          if (args.action === 'installPortable') setStatus('Portables Orca eingerichtet. Im Orca-Menü neben „Datei“ unter Plugins den Formnaro Chat aktivieren.');
        }
      } finally {
        clearInterval(timer);
        timer = null;
        running = false;
        if (current()) { $('orca-download').hidden = true; $('orca-mode').value = state.mode; enable(); }
      }
    }
    $('orca-mode').onchange = perform(() => manage({action:'selectInstance',mode:$('orca-mode').value}));
    $('orca-launch').onclick = perform(async () => {
      await request({action:'launchInstance'});
      setStatus('Orca geöffnet. Nach der Druckerauswahl den 3D-Druck-Dialog erneut öffnen.');
    });
    $('orca-check').onclick = perform(() => manage({action:'checkRelease'}));
    $('orca-portable').onclick = perform(() => manage({action:'installPortable'}));
    $('orca-machine').onchange = () => linked();
    for (const category of ['process', 'filament']) field(category).onchange = enable;
    $('orca-recent').onchange = report;
    $('orca-install-chat').onclick = perform(async () => {
      await request({ action: 'installChat' });
      if (current()) display(await request({action:'setup'}));
      setStatus('In Orca im Menü neben „Datei“ unter Plugins „Formnaro Chat“ aktivieren. Falls es fehlt, Orca neu starten.');
    });
    $('orca-choose').onclick = perform(async () => {
      const value = await request({ action: 'chooseExecutable' });
      if (current()) display(value);
    });
    $('orca-configure').onclick = perform(async () => {
      const value = await request({ action: 'configure', profiles: chosen() });
      if (current()) {
        display(value);
        setStatus('Druckprofile gemerkt. Sie stehen im Agenten-Chat bereit.');
      }
    });
    $('orca-agent').onclick = perform(async () => {
      $('modal').close();
      await openAgent();
    });
    $('orca-slice').onclick = perform(() => start('slice'));
    $('orca-open-model').onclick = perform(() => start('openModel'));
    $('orca-cancel').onclick = perform(async () => {
      task?.abort(new DOMException('Orca-Auftrag abgebrochen.', 'AbortError'));
      await request({ action: 'cancel' });
      setStatus('Orca-Auftrag wird abgebrochen …');
    });
    for (const [button, action, message] of [
      ['orca-save', 'saveResult', 'Druckprojekt gespeichert.'],
      ['orca-open-result', 'openResult', 'Druckprojekt wurde an OrcaSlicer übergeben.'],
    ]) $(button).onclick = perform(async () => {
      if (await request({ action, id: $('orca-recent').value })) setStatus(message);
    });
    await perform(async () => {
      const value = await request({ action: 'setup' });
      if (current()) display(value);
    })();
  }

  return { show };
}
