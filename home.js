// Startseite: ATLAS-5-Achsen, Modus-Reiter und Vorher/Nachher-Regler.
// Sprachabhängige Texte stehen als JSON im Element #home-data der jeweiligen Seite.
(() => {
  const data = JSON.parse(document.getElementById('home-data').textContent);
  const base = data.base || '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ATLAS-5: fünf Achsregler. Jede Achse ist in der Aufnahme als Abschnitt gespeichert:
  // Grundstellung -> Endlage + -> Grundstellung -> Endlage - -> Grundstellung (Sinusverlauf).
  const segs = [[0, 24], [24, 24], [48, 24], [72, 24], [96, 24], [120, 32]];
  const img = document.getElementById('frame'), imgB = document.getElementById('frame2');
  const readout = document.getElementById('readout'), play = document.getElementById('play');
  const icon = document.getElementById('playIcon'), playLabel = document.getElementById('playLabel');
  const sliders = [...document.querySelectorAll('.axis-range')];
  const src = i => base + 'atlas-5-frames/' + String(i).padStart(3, '0') + '.webp?v=2';
  const cache = [];
  const load = seg => { const [s, n] = segs[seg]; for (let i = s; i < s + n; i++) if (!cache[i]) { cache[i] = new Image(); cache[i].src = src(i); } };
  // Bildposition (gebrochen) innerhalb eines Abschnitts für einen Reglerwert v in [-1, 1].
  const framePos = (seg, v) => {
    const n = segs[seg][1], q = Math.asin(Math.max(-1, Math.min(1, Math.abs(v)))) / (2 * Math.PI) * (n - 1);
    return v >= 0 ? q : (n - 1) / 2 + q;
  };
  const showPos = (seg, p) => {
    const s = segs[seg][0], a = Math.floor(p), t = p - a;
    img.src = src(s + a);
    imgB.src = src(s + Math.min(a + 1, segs[seg][1] - 1));
    imgB.style.opacity = t.toFixed(2);
  };
  const label = i => document.querySelector(`label[for="ax-${i}"]`).textContent.trim();
  let timer = null, anim = null;
  const stopDemo = () => {
    clearInterval(timer); timer = null;
    icon.setAttribute('d', 'M3 1.5v11l9-5.5z'); playLabel.textContent = data.play;
  };
  // Andere Regler weich in die Grundstellung zurückfahren.
  const homeOthers = active => {
    cancelAnimationFrame(anim);
    const others = sliders.filter((r, i) => i !== active && +r.value !== 0);
    if (!others.length) return;
    const t0 = performance.now(), from = others.map(r => +r.value);
    const step = now => {
      const k = Math.min(1, (now - t0) / 250);
      others.forEach((r, j) => { r.value = Math.round(from[j] * (1 - k)); });
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  sliders.forEach((r, i) => r.addEventListener('input', () => {
    stopDemo(); load(i); homeOthers(i);
    const v = +r.value / 100;
    showPos(i, framePos(i, v));
    readout.textContent = v === 0 ? data.home : label(i) + ' ' + (v > 0 ? '+' : '−') + Math.abs(+r.value) + ' %';
  }));
  document.getElementById('home').addEventListener('click', () => {
    stopDemo(); sliders.forEach(r => { r.value = 0; }); showPos(0, 0); readout.textContent = data.home;
  });
  // "Alle Achsen vorführen": den gemeinsamen Abschnitt abspielen, Regler zeigen Grundstellung.
  const startDemo = () => {
    load(5); sliders.forEach(r => { r.value = 0; });
    icon.setAttribute('d', 'M2.5 1.5h3v11h-3zM8.5 1.5h3v11h-3z'); playLabel.textContent = data.pause;
    readout.textContent = data.axes[5];
    let f = 0;
    timer = setInterval(() => { f = (f + 1) % segs[5][1]; showPos(5, f); }, 80);
  };
  play.addEventListener('click', () => (timer ? stopDemo() : startDemo()));
  // Bilder erst laden, wenn die Fräse in Sichtweite kommt.
  new IntersectionObserver(([entry], obs) => {
    if (entry.isIntersecting) { segs.forEach((_, i) => load(i)); obs.disconnect(); }
  }, { rootMargin: '300px 0px' }).observe(img);

  // Modi
  const tabs = [...document.querySelectorAll('.tab')];
  const setMode = (t, focus) => {
    tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; });
    const m = data.modes[t.dataset.mode];
    document.getElementById('p-mode').setAttribute('aria-labelledby', t.id);
    const im = document.getElementById('m-img'); im.src = base + m.img; im.alt = m.alt;
    document.getElementById('m-who').textContent = m.who;
    const list = document.getElementById('m-list'); list.replaceChildren(...m.list.map(s => { const li = document.createElement('li'); li.textContent = s; return li; }));
    const lv = document.getElementById('m-level');
    lv.replaceChildren(...[1, 2, 3, 4].map(i => { const sp = document.createElement('span'); if (i <= m.level) sp.className = 'on'; return sp; }), document.createTextNode(' ' + data.levelLabel));
    lv.setAttribute('aria-label', data.levelLabel + ' ' + m.level + ' / 4');
    const link = document.getElementById('m-link'); link.textContent = m.example; link.href = m.href.startsWith('http') ? m.href : base + m.href;
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setMode(t));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      setMode(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
    });
  });
  setMode(tabs[0]);

  // Vorher/Nachher
  document.querySelectorAll('.compare').forEach(cmp => {
    const cut = cmp.querySelector('input');
    cut.addEventListener('input', () => cmp.style.setProperty('--cut', cut.value + '%'));
  });
})();
