const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function verifyStlMeshHelp(win, modelFile, directory) {
  const phase = (name) => {
    if (directory) fs.writeFileSync(path.join(directory, 'Netzhilfe-Fortschritt.txt'), name);
  };
  phase('Arbeitsbereich öffnen');
  const run = (code) => win.webContents.executeJavaScript(code);
  async function until(expression) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (await run(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 70));
    }
    const status = await run('document.getElementById("converter-status")?.textContent');
    throw Error('Netz-Hilfe-Test: ' + expression + ' · ' + status);
  }
  const source = (filename) => {
    const bytes = fs.readFileSync(filename).toString('base64');
    return 'new File([Uint8Array.from(atob(' + JSON.stringify(bytes) + '), c => c.charCodeAt(0))], '
      + JSON.stringify(path.basename(filename)) + ')';
  };
  const button = (id) => run('document.getElementById(' + JSON.stringify(id) + ').click()');
  await run('window.__cadTest.workbenchUI.setMode("normal")');
  const before = await run('window.__cadTest.serialize()'),
    beforeUndo = await run('window.__cadTest.undoDepth()');
  await run('(()=>{const input=document.getElementById("import-file"), transfer=new DataTransfer();'
    + 'transfer.items.add(' + source(modelFile) + ');input.files=transfer.files;input.dispatchEvent(new Event("change"));})()');
  await until('document.getElementById("modal").open&&!!document.getElementById("import-kind")');
  await run('(()=>{const mode=document.getElementById("import-kind"); mode.value="cad";mode.dispatchEvent(new Event("change"));})()');
  phase('CAD-Import starten');
  await button('import-confirm');
  await until('!document.getElementById("converter-mesh-help")?.hidden && document.getElementById("converter-run")?.disabled===false');
  phase('Konvertierung der beschädigten STL');
  await button('converter-run');
  await until('document.getElementById("converter-status")?.textContent.includes("3.01367 mm")&&!window.__cadTest.functionsUI.state()?.busy');
  assert.equal(await run('window.__cadTest.serialize()'), before);
  assert.equal(await run('window.__cadTest.undoDepth()'), beforeUndo);

  phase('Netz-Hilfe öffnen');
  await button('converter-mesh-help');
  await until('!!window.__cadTest.meshInspectorUI.state()?.result');
  phase('Diagnose und Messung');
  const diagnosed = await run('window.__cadTest.meshInspectorUI.state()');
  const measured = await run('(' + (async function () {
    const a = window.__cadTest;
    const node = a.getModel().nodes.at(-1);
    const original = a.serialize();
    const map = (v, point) => [0, 1, 2].map(k => node.transform[k] * v[0] + node.transform[k+4] * v[1]
      + node.transform[k+8] * v[2] + (point ? node.transform[k+12] : 0));
    const query = (id, normal, point) => ({
      id, engine: 'mesh', kind: 'sectionContours', options: { id: node.id, options: {
        normal: map(normal, false), planePoint: map(point, true), summaryOnly: true,
      } },
    });
    const reply = await a.access.analyze([query('rear', [0, 1, 0], [0, 60.19, 0]), query('base', [0, 0, 1], [0, 0, 7.33])]);
    const [rear, base] = reply.results.map(r => r.value);
    return { id: node.id, kind: node.kind, triangles: node.mesh.triangles.length/3, unchanged: a.serialize() === original,
      rearDiameter: rear.measurements.find(m => m.kind === 'circle').diameter, rearComplete: rear.complete,
      baseCircles: base.measurements.filter(m => m.kind === 'circle').length };
  }).toString() + ')()');
  assert.equal(measured.kind, 'mesh');
  assert.equal(measured.triangles, 22009);
  assert.equal(diagnosed.objectId, measured.id);
  assert.equal(measured.unchanged, true);
  assert.equal(measured.rearComplete, false);
  assert.ok(Math.abs(measured.rearDiameter - 22.204) < 0.008);
  assert.equal(measured.baseCircles, 14);
  assert.equal(await run('window.__cadTest.undoDepth()'), beforeUndo + 1);

  phase('Vorhandenes Netz wiederverwenden');
  const afterLoad = await run('window.__cadTest.serialize()');
  await run('window.__cadTest.actions["mesh-to-cad"]()');
  await until('!document.getElementById("converter-mesh-help")?.hidden && document.getElementById("converter-run")?.disabled===false');
  await button('converter-mesh-help');
  await until('!!window.__cadTest.meshInspectorUI.state()?.result');
  assert.equal(await run('window.__cadTest.meshInspectorUI.state().objectId'), measured.id);
  assert.equal(await run('window.__cadTest.serialize()'), afterLoad);
  await run('window.__cadTest.meshInspectorUI.close();window.__cadTest.actions.undo()');
  assert.equal(await run('window.__cadTest.serialize()'), before);

  phase('Netz-Hilfe aus dem Easy-CAD-Bereich');
  await run('window.__cadTest.workbenchUI.setMode("easy");window.__cadTest.workbenchUI.setDomain("cad")');
  await run('window.__cadTest.functionsUI.converter(' + source(modelFile) + ', {intent:"import"})');
  await until('!document.getElementById("converter-mesh-help")?.hidden && document.getElementById("converter-run")?.disabled===false');
  await button('converter-mesh-help');
  await until('!!window.__cadTest.meshInspectorUI.state()?.result');
  assert.equal(await run('window.__cadTest.workbenchUI.mode()'), 'normal');
  assert.equal(await run('window.__cadTest.getModel().nodes.at(-1).mesh.triangles.length'), 22009 * 3);
  await run('window.__cadTest.meshInspectorUI.close();window.__cadTest.actions.undo()');
  assert.equal(await run('window.__cadTest.serialize()'), before);

  phase('Intakte STL als CAD übernehmen');
  const examples = require('electron').app.isPackaged
    ? path.join(process.resourcesPath, 'converter', 'examples')
    : path.join(__dirname, '../converter/examples');
  const healthy = path.join(examples, 'platte-mit-zwei-senkungen.stl');
  await run('window.__cadTest.functionsUI.converter(' + source(healthy) + ', {intent:"import"})');
  await until('document.getElementById("converter-run")?.disabled===false && window.__cadTest.functionsUI.state()?.regions>0');
  assert.equal(await run('document.getElementById("converter-mesh-help").hidden'), true);
  await button('converter-run');
  await until('window.__cadTest.functionsUI.state()?.hasResult && !window.__cadTest.functionsUI.state().busy');
  assert.equal(await run('document.getElementById("converter-mesh-help").hidden'), true);
  await button('converter-import');
  await until('window.__cadTest.functionsUI.state()?.projectPreview && !window.__cadTest.functionsUI.state().busy');
  await button('converter-apply');
  await until('window.__cadTest.getModel().nodes.some(n=>n.kind==="cad"&&n.stats.solids===1)');
  phase('Prüfung bestanden');
  return { ok: true, measured, healthyCadImport: true, existingMeshReused: true, easyCadHandoff: true, undoRestored: true };
}
module.exports = { verifyStlMeshHelp };
