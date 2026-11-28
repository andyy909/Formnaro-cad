const fs = require('node:fs');
const path = require('node:path');

async function verifyPhotoModeInRenderer(mode) {
  const checks = [];
  const find = (selector) => document.querySelector(selector);
  const check = (condition, message) => {
    if (!condition) throw Error(message);
  };
  async function wait(predicate, description) {
    const deadline = Date.now() + 30000;
    while (!predicate()) {
      if (Date.now() >= deadline) {
        const status = find('#photo-profile-status')?.textContent ||
          find('#photo-status')?.textContent || find('#photo-project-dialog [role=status]:last-of-type')?.textContent;
        throw Error(description + (status ? ' · ' + status : ''));
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  await wait(() => !!window.__cadTest, 'CAD test interface did not load');
  const cad = window.__cadTest;
  cad.workbenchUI.setMode(mode);
  await cad.settled();
  check(!cad.getModel().nodes.length && !cad.getModel().photos?.items.length, 'Expected a fresh verification project');
  const empty = cad.serialize();
  const emptyUndo = cad.undoDepth();

  find('#photo-project-open').click();
  await wait(() => find('#photo-project-dialog[open]'), 'Project photos did not open');
  check(!find('[data-photo-profile]'), 'The CAD action was offered without a contour');
  check(typeof window.offlinecadDesktop?.openCutout === 'function' && find('#photo-project-cutout')?.checkVisibility(),
    'The optional Cutout entry is missing in project photos');
  checks.push('CAD profile action requires a confirmed contour');

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  context.fillStyle = '#257446';
  context.fillRect(30, 30, 250, 60);
  context.fillRect(30, 90, 80, 120);
  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  check(png, 'Synthetic PNG could not be encoded');
  const input = find('#photo-project-dialog input[type=file]');
  const transfer = new DataTransfer();
  transfer.items.add(new File([png], 'L-Kontur.png', { type: 'image/png' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change'));
  await wait(() => find('#photo-assistant[open]'), 'Photo measurement assistant did not open');
  check(find('#photo-cutout')?.checkVisibility(), 'The optional Cutout entry is missing in the photo assistant');
  checks.push('Both photo dialogs expose the optional Cutout action');
  check(find('#photo-canvas path[stroke="#aa21c7"]'), 'Alpha proposal was not drawn');
  check(find('#photo-edit-group').value === 'suggestion', 'The unconfirmed proposal is not ready to edit');
  check(!find('#photo-canvas path[stroke="#008949"]'), 'The proposal was confirmed automatically');
  find('#photo-accept-suggestion').click();
  check(find('#photo-canvas path[stroke="#008949"]'), 'Explicit confirmation did not create the outline');
  check(!find('#photo-canvas path[stroke="#aa21c7"]'), 'The confirmed outline retained an unconfirmed duplicate');
  checks.push('Alpha proposes the outline and requires explicit confirmation');

  function point(x, y) {
    find('#photo-point-x').value = x;
    find('#photo-point-y').value = y;
    find('#photo-add-point').click();
  }
  find('#photo-mode-reference').click();
  point(30, 30);
  point(280, 30);
  find('#photo-mm').value = '50';
  find('#photo-mode-hole').click();
  for (const [x, y] of [[50, 50], [70, 50], [70, 70], [50, 70]]) point(x, y);
  find('#photo-finish').click();
  find('#photo-save').click();
  await wait(() => find('[data-photo-profile]') && !find('[data-photo-profile]').disabled, 'Calibrated photo was not saved');
  const photo = cad.getModel().photos.items[0].reference;
  check(photo.scale.mm === 50 && photo.outline.length === 6 && photo.holes.length === 1,
    'Saved calibration, recess or hole is missing');
  const photoOnly = cad.serialize();
  const photoUndo = cad.undoDepth();
  const projectUnchanged = () => cad.serialize() === photoOnly && cad.undoDepth() === photoUndo;

  async function openProfile() {
    find('[data-photo-profile]').click();
    await wait(() => find('#photo-profile-dialog[open]'), 'Native photo profile dialog did not open');
  }
  function setHeight(value) {
    const field = find('#photo-profile-height');
    field.value = String(value);
    field.dispatchEvent(new Event('input'));
  }
  async function makePreview(height) {
    setHeight(height);
    find('#photo-profile-preview').click();
    await wait(() => !find('#photo-profile-apply').disabled, 'Native photo profile preview did not become ready');
    const image = find('#photo-profile-image');
    check(!image.hidden && image.src.startsWith('data:image/png'), 'Missing native profile preview image');
    check(projectUnchanged(), 'Preview mutated project or Undo history');
  }
  await openProfile();
  await makePreview(4);
  setHeight('5,0');
  check(find('#photo-profile-apply').disabled && find('#photo-profile-image').hidden && projectUnchanged(),
    'Extrusion height edit did not invalidate the existing preview');
  await makePreview('5,0');
  find('#photo-profile-close').click();
  await wait(() => !find('#photo-profile-dialog'), 'Closing did not discard the profile preview');
  check(projectUnchanged(), 'Cancel mutated project or Undo history');
  checks.push('Editing height invalidates preview and Cancel leaves the project exact');

  await openProfile();
  await makePreview(5);
  find('#photo-profile-apply').click();
  await wait(() => !find('#photo-profile-dialog'), 'Applying did not close the profile dialog');
  await cad.settled();

  check(cad.undoDepth() === photoUndo + 1, 'Expected one CAD Undo step');
  check(cad.getModel().nodes.length === 1, 'Expected exactly one native CAD body');
  const node = cad.getModel().nodes[0];
  check(node.kind === 'cad' && node.source === 'native' && node.recipe.type === 'sketch' &&
    node.recipe.sketch.kind === 'profile' && node.brep.format === 'OpenCascade-BRep' && node.stats.solids === 1,
  'The profile is not an editable native solid');
  check(node.recipe.sketch.dimensions.height === '5' &&
    node.recipe.sketch.loops.map((loop) => loop.role).join(',') === 'outer,hole',
  'The height or the editable hole loop was lost');
  // 24,600 px² silhouette minus a 400 px² opening, at 0.2 mm/px, extruded 5 mm.
  check(Math.abs(node.stats.volume - 4840) < 1e-5, 'Unexpected native volume: ' + node.stats.volume);
  check(JSON.stringify(cad.getModel().photos.items[0].reference) === JSON.stringify(photo), 'The saved photo was changed');
  const accepted = cad.serialize();
  checks.push('Apply creates one native sketch solid with the measured opening and 4,840 mm³');

  find('#photo-project-close').click();
  await wait(() => !find('#photo-project-dialog'), 'Project photo dialog did not finish closing');
  await cad.actions.undo();
  await cad.settled();
  check(projectUnchanged(), 'CAD Undo did not restore the exact photo-only project');
  await cad.actions.undo();
  await cad.settled();
  check(cad.serialize() === empty && cad.undoDepth() === emptyUndo, 'Photo Undo did not restore the fresh project');
  checks.push('Undo restores the byte-identical photo-only project and then the fresh project');

  return { checks, accepted, buildLabel: find('#app-version')?.textContent, volumeMm3: node.stats.volume, solids: node.stats.solids,
    sketchKind: node.recipe.sketch.kind, previewCancelUnchanged: true, undoExact: true };
}

exports.verifyPhotoMode = async function verifyPhotoMode(win, { directory }) {
  const modes = [];
  for (const [mode, label, filename] of [
    ['normal', 'Normal', 'Foto-CAD-Profil.ocad'],
    ['easy', 'Einfach', 'Foto-CAD-Profil-Einfach.ocad'],
  ]) {
    const { accepted, ...result } = await win.webContents.executeJavaScript(
      `(${verifyPhotoModeInRenderer.toString()})(${JSON.stringify(mode)})`,
    );
    const projectFile = path.join(directory, filename);
    fs.writeFileSync(projectFile, accepted + '\n');
    modes.push({ ...result, mode, label, projectFile });
  }
  const checks = modes.flatMap(({ checks, label }) => checks.map((check) => label + ' · ' + check));
  return { ok: true, ...modes[0], checks, modes };
};
