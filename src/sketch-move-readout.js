import './sketch-move-readout.css';

const signedMillimeters = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 4,
  signDisplay: 'exceptZero',
  useGrouping: false,
});

export function createSketchMoveReadout(board) {
  const doc = board.ownerDocument;
  const view = doc.defaultView;
  const readout = doc.createElement('div');
  readout.className = 'sketch-move-readout';
  readout.hidden = true;
  readout.setAttribute('role', 'group');
  readout.setAttribute('aria-label', 'Verschiebung');

  const axes = ['X', 'Y'].map(axis => {
    const field = doc.createElement('span');
    const label = doc.createElement('b');
    label.textContent = axis;
    const value = doc.createTextNode('');
    field.append(label, value);
    readout.append(field);
    return {axis, value};
  });
  const announcement = doc.createElement('span');
  announcement.className = 'sketch-move-announcement';
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  readout.append(announcement);

  let host;
  let panel;
  let ownsPosition = false;
  const resize = new view.ResizeObserver(position);

  function releaseHost() {
    resize.disconnect();
    if (ownsPosition) host.classList.remove('sketch-move-readout-host');
  }

  function mount() {
    const parent = board.parentElement;
    if (!parent?.isConnected) return false;
    if (parent !== host) {
      releaseHost();
      host = parent;
      ownsPosition = view.getComputedStyle(host).position === 'static';
      if (ownsPosition) host.classList.add('sketch-move-readout-host');
      panel = board.closest('.tablet-sketch-dialog')?.querySelector('.tablet-sketch-panel');
      resize.observe(board);
      resize.observe(host);
      if (panel) resize.observe(panel);
    }
    if (readout.parentElement !== host) host.append(readout);
    return true;
  }

  function position() {
    if (readout.hidden || !board.isConnected) return;
    const surface = board.getBoundingClientRect();
    const origin = host.getBoundingClientRect();
    const dialog = board.closest('dialog')?.getBoundingClientRect();
    const left = Math.max(surface.left, dialog?.left ?? 0, 0);
    let right = Math.min(surface.right, dialog?.right ?? view.innerWidth, view.innerWidth);
    if (panel && !panel.hidden) {
      const panelLeft = panel.getBoundingClientRect().left;
      if (panelLeft - left >= 110) right = Math.min(right, panelLeft);
    }
    const bottom = Math.min(surface.bottom, dialog?.bottom ?? view.innerHeight, view.innerHeight);
    readout.style.left = (left + right) / 2 - origin.left - host.clientLeft + host.scrollLeft + 'px';
    readout.style.top = bottom - origin.top - host.clientTop + host.scrollTop - 10 + 'px';
    readout.style.maxWidth = Math.max(0, right - left - 16) + 'px';
  }

  function clear() {
    readout.hidden = true;
    announcement.textContent = '';
  }

  view.addEventListener('scroll', position, true);
  view.addEventListener('resize', position);
  return {
    show(delta, {active = true} = {}) {
      if (!delta || delta.length !== 2 || !delta.every(Number.isFinite) || !mount()) {
        clear();
        return;
      }
      for (const [index, {value}] of axes.entries()) {
        value.data = ' ' + signedMillimeters.format(delta[index]) + ' mm';
      }
      readout.classList.toggle('is-moving', active);
      readout.hidden = false;
      announcement.textContent = active ? '' : 'Verschiebung: ' + axes.map(
        ({axis, value}) => axis + value.data,
      ).join(', ');
      position();
    },
    clear,
    dispose() {
      view.removeEventListener('scroll', position, true);
      view.removeEventListener('resize', position);
      releaseHost();
      readout.remove();
    },
  };
}
