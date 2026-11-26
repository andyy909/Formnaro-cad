export function createPhotoCutoutControl(id) {
  const desktop = window.offlinecadDesktop;
  if (typeof desktop?.openCutout !== 'function') return null;

  const control = document.createElement('span');
  const button = document.createElement('button');
  const status = document.createElement('span');
  button.type = 'button';
  button.id = id;
  button.textContent = 'Formnaro Cutout';
  status.id = id + '-status';
  status.setAttribute('role', 'status');
  button.setAttribute('aria-describedby', status.id);
  control.className = 'photo-tools';
  control.append(button, status);

  let pending = false;
  button.onclick = async () => {
    if (button.disabled || pending) return;
    pending = button.disabled = true;
    status.classList.remove('ai-error');
    status.textContent = 'Formnaro Cutout wird geöffnet …';
    try {
      const { opened } = await desktop.openCutout();
      status.textContent = opened ? 'Formnaro Cutout geöffnet.' : 'Öffnen abgebrochen.';
    } catch (error) {
      status.classList.add('ai-error');
      status.textContent = error?.message || 'Formnaro Cutout konnte nicht geöffnet werden.';
    } finally {
      pending = button.disabled = false;
    }
  };

  return control;
}
