// Startseite: ATLAS-5-Achsen, Modus-Reiter und Vorher/Nachher-Regler.
// Sprachabhängige Texte stehen als JSON im Element #home-data der jeweiligen Seite.
(() => {
  const data = JSON.parse(document.getElementById('home-data').textContent);
  const base = data.base || '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ATLAS-5: Abschnitte der Aufnahme (Startbild, Anzahl) für X, Y, Z, A, C und alle zusammen.
  const segs = [[0, 24], [24, 24], [48, 24], [72, 24], [96, 24], [120, 32]];
  const img = document.getElementById('frame'), pos = document.getElementById('pos');
  const readout = document.getElementById('readout'), play = document.getElementById('play'), icon = document.getElementById('playIcon');
  const src = i => base + 'atlas-5-frames/' + String(i).padStart(3, '0') + '.webp';
  const cache = [];
  const load = seg => { const [s, n] = segs[seg]; for (let i = s; i < s + n; i++) if (!cache[i]) { cache[i] = new Image(); cache[i].src = src(i); } };
  let seg = 0, timer = null;
  const show = () => { img.src = src(segs[seg][0] + +pos.value); };
  const stop = () => {
    clearInterval(timer); timer = null;
    icon.setAttribute('d', 'M3 1.5v11l9-5.5z'); play.setAttribute('aria-label', data.play);
  };
  const start = () => {
    icon.setAttribute('d', 'M2.5 1.5h3v11h-3zM8.5 1.5h3v11h-3z'); play.setAttribute('aria-label', data.pause);
    timer = setInterval(() => { pos.value = (+pos.value + 1) % segs[seg][1]; show(); }, 80);
  };
  document.querySelectorAll('.axis').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.axis').forEach(x => x.setAttribute('aria-pressed', x === b));
    seg = +b.dataset.seg; load(seg);
    pos.max = segs[seg][1] - 1; pos.value = 0; readout.textContent = data.axes[seg]; show();
    if (!timer && !reduce) start();
  }));
  pos.addEventListener('input', () => { stop(); show(); });
  play.addEventListener('click', () => (timer ? stop() : start()));
  // Erst laden und abspielen, wenn die Fräse in Sichtweite kommt; außer Sicht anhalten.
  let userPaused = false;
  play.addEventListener('click', () => { userPaused = !timer; });
  pos.addEventListener('input', () => { userPaused = true; });
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      segs.forEach((_, i) => load(i));
      if (!reduce && !userPaused && !timer) start();
    } else if (timer) stop();
  }, { rootMargin: '200px 0px' }).observe(img);

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
