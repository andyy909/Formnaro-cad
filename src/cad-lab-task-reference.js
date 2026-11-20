import { frontierTaskCard } from './cad-lab-frontier-task-card.js';

function boreViews(document, { size, from, bores, spatial }) {
  const views = document.createElement('div');
  const faces = [[0, 1, 2, true, 'Draufsicht']];
  if (spatial) faces.push([0, 2, 1, false, 'Vorderseite'], [1, 2, 0, true, 'Rechte Seite']);
  for (const [u, v, w, upper, label] of faces) {
    const figure = document.createElement('figure');
    figure.className = 'lab-plate-preview';
    const outline = document.createElement('div');
    outline.className = 'lab-plate-outline';
    outline.style.aspectRatio = size[u] + ' / ' + size[v];
    const face = from[w] + (upper ? size[w] : 0);
    for (const bore of bores) {
      const point = [bore.from, bore.to].find((end) => end[w] === face);
      if (!point || bore.from[w] === bore.to[w]) continue;
      const hole = document.createElement('span');
      hole.className = 'lab-plate-hole';
      hole.style.left = 100 * (point[u] - from[u]) / size[u] + '%';
      hole.style.top = 100 * (1 - (point[v] - from[v]) / size[v]) + '%';
      const stretch = bore.inclined ? Math.hypot(...bore.to.map((n, i) => n - bore.from[i])) /
        Math.abs(bore.to[w] - bore.from[w]) : 1;
      hole.style.width = 100 * bore.diameter * stretch / size[u] + '%';
      hole.style.aspectRatio = stretch;
      outline.append(hole);
    }
    const caption = document.createElement('figcaption');
    caption.textContent = label + ' · ' + size[u] + ' × ' + size[v] + ' mm';
    figure.append(outline, caption);
    views.append(figure);
  }
  return views;
}

export function mountLabTaskReference(panel) {
  const document = panel.ownerDocument;
  const title = panel.querySelector('[data-reference-title]');
  const content = panel.querySelector('[data-reference-content]');
  const fallback = panel.querySelector('[data-reference-missing]');
  let preview, revision = 0;
  const enlargement = document.createElement('dialog');
  enlargement.className = 'lab-drawing-enlargement';
  const close = document.createElement('button');
  close.textContent = 'Schließen';
  close.type = 'button';
  close.onclick = () => enlargement.close();
  const enlargedImage = document.createElement('img');
  enlargement.append(close, enlargedImage);
  enlargement.addEventListener('close', () => enlargedImage.removeAttribute('src'));
  panel.append(enlargement);

  function clear() {
    revision++;
    if (enlargement.open) enlargement.close();
    preview?.dispose();
    preview = undefined;
    content.replaceChildren();
    fallback.hidden = false;
  }

  function showTask(task, frontier) {
    clear();
    title.textContent = task.label;
    panel.hidden = false;
    if (frontier) {
      const card = frontierTaskCard(document, frontier.domain, frontier.level, frontier.version);
      if (card) {
        card.querySelector('h4')?.remove();
        content.append(card);
        fallback.hidden = Boolean(card.querySelector('figure'));
      }
    }
  }

  function image(src, caption, isDrawing = false) {
    if (typeof src !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/.test(src)) return null;
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    const label = document.createElement('figcaption');
    img.src = src;
    img.alt = caption;
    label.textContent = caption;
    if (isDrawing) {
      const button = document.createElement('button');
      button.className = 'lab-enlarge-drawing';
      button.type = 'button';
      button.setAttribute('aria-label', caption + ' vergrößern');
      button.append(img);
      button.onclick = () => {
        enlargement.setAttribute('aria-label', caption);
        enlargedImage.alt = caption;
        enlargedImage.src = src;
        enlargement.showModal();
      };
      figure.append(button, label);
    } else {
      figure.append(img, label);
    }
    return figure;
  }

  function showObserved(src, caption) {
    if (!content.querySelector('figure, canvas')) {
      const figure = image(src, caption);
      if (!figure) return;
      content.append(figure);
      fallback.hidden = true;
    }
  }

  function showReference(reference) {
    if (reference.pictures) {
      const gallery = document.createElement('div');
      gallery.dataset.referenceRole = reference.role;
      for (const picture of reference.pictures) {
        const figure = image(picture.dataUrl, picture.caption, picture.kind === 'drawing');
        if (figure) gallery.append(figure);
      }
      if (!gallery.childElementCount) return;
      for (const old of content.querySelectorAll('[data-reference-role]'))
        if (old.dataset.referenceRole === reference.role) old.remove();
      content.append(gallery);
      fallback.hidden = true;
      return;
    }
    clear();
    if (reference.photos) {
      const views = { front: 'Vorderansicht', right: 'Rechte Seite', top: 'Draufsicht' };
      for (const photo of reference.photos) {
        const view = photo.reference?.view;
        const figure = image(photo.image?.dataUrl, 'Fotovorlage' + (view ? ' · ' + (views[view] ?? view) : ''));
        if (figure) content.append(figure);
      }
      fallback.hidden = content.childElementCount > 0;
    } else if (reference.stl) {
      const current = revision;
      void import('./cad-stl-preview.js').then(({ createStlPreview }) => {
        if (current !== revision || !panel.isConnected) return;
        const figure = document.createElement('figure');
        const view = document.createElement('div');
        view.className = 'lab-reference-stl';
        const caption = document.createElement('figcaption');
        caption.textContent = 'STL-Vorlage · ' + reference.name;
        figure.append(view, caption);
        content.prepend(figure);
        preview = createStlPreview(view);
        preview.setResult(new Uint8Array(reference.stl));
        preview.setMode('Ergebnis');
        fallback.hidden = true;
      }).catch(() => { if (current === revision) clear(); });
    } else if (reference.size && Array.isArray(reference.bores)) {
      const label = document.createElement('strong');
      label.textContent = 'Sollansicht';
      content.append(label, boreViews(document, reference));
      fallback.hidden = true;
    }
  }
  return { showTask, showReference, showObserved, dispose: clear };
}
