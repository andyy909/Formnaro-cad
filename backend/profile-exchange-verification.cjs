const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function plateSketch() {
  const points = [
      [-50, -30],
      [50, -30],
      [50, 30],
      [-50, 30],
    ],
    lines = points.map((start, index) => ({ type: 'line', start, end: points[(index + 1) % 4] })),
    holes = [
      [-40, -20],
      [-40, 20],
      [40, -20],
      [40, 20],
    ].map((center) => [{ type: 'circle', center, diameter: 6 }]),
    slot = [
      { type: 'line', start: [-8, -3], end: [8, -3] },
      { type: 'arc', start: [8, -3], through: [11, 0], end: [8, 3] },
      { type: 'line', start: [8, 3], end: [-8, 3] },
      { type: 'arc', start: [-8, 3], through: [-11, 0], end: [-8, -3] },
    ],
    paths = [lines, ...holes, slot].map((items, i) => items.map((item, j) => ({ ...item, id: 'e-' + i + '-' + j })));
  return {
    version: 2,
    kind: 'profile',
    variables: [],
    dimensions: { height: '5' },
    elements: paths.flat(),
    loops: paths.map((items, i) => ({
      id: 'l-' + i,
      role: i ? 'hole' : 'outer',
      elements: items.map((item) => item.id),
    })),
  };
}

exports.verifyProfileExchange = async function verifyProfileExchange(win, { directory, files }) {
  const checks = [],
    pause = () => new Promise((resolve) => setTimeout(resolve, 45));
  const js = (code) =>
    win.webContents.executeJavaScript(
      `(async()=>{const a=window.__cadTest;const $=id=>document.getElementById(id);const check=(v,m)=>{if(!v)throw Error(m);};${code}})()`,
    );
  const until = async (predicate, message) => {
    for (let i = 0; i < 240; i++) {
      if (await predicate()) return;
      await pause();
    }
    throw Error(message + ' · ' + (await js("return $('toast').textContent")));
  };
  const note = (label) => {
    checks.push(label);
    fs.writeFileSync(path.join(directory, 'Fortschritt.json'), JSON.stringify(checks));
  };
  const drop = (name, data) =>
    js(`
    const files = new DataTransfer();
    files.items.add(new File([${JSON.stringify(data)}],${JSON.stringify(name)}));
    $('viewport').dispatchEvent(new DragEvent('drop',{dataTransfer:files,bubbles:true,cancelable:true}));
  `);

  await js(`
    await a.resetProject();
    a.workbenchUI.setMode('normal');
    const sketch=${JSON.stringify(plateSketch())};
    const result=await a.execute({kind:'batch',commands:[{op:'sketch',name:'Montageplatte',sketch,as:'platte'}]});
    window.__plateId=result.aliases.platte;
    await a.settled();
    a.view.setView('top');
    a.view.fit();
    await a.view.renderReady();
    window.__exchangeBefore=a.serialize();
    window.__exchangeUndo=a.undoDepth();
  `);
  note('Native Montageplatte erstellt');

  for (const format of ['svg', 'dxf']) {
    files.save = path.join(directory, 'Montageplatte-Flaeche.' + format);
    const pos = await js(`
      a.actions.export();
      $('export-format').value='profile-${format}';
      $('export-format').dispatchEvent(new Event('change',{bubbles:true}));
      check(!$('export-profile-source-label').hidden,'Schnittkontur fehlt im Dialog');
      $('export-confirm').click();
      check(!$('modal').open,'Flächenauswahl verlangt gefahrlosen Mausklick');
      const p=a.view.projectPoint([20,12,5]);
      return {x:Math.round(p.x),y:Math.round(p.y)};
    `);
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp'])
      win.webContents.sendInputEvent({ type, ...pos, button: 'left', clickCount: 1 });
    await until(() => fs.existsSync(files.save), 'Flächenexport fehlt ' + format);
    assert.ok(fs.statSync(files.save).size > 100);
    await js(
      "check(a.serialize()===window.__exchangeBefore&&a.undoDepth()===window.__exchangeUndo,'Export changed geometry')",
    );
    note('Exportdialog und nativer Flächenklick ' + format.toUpperCase());
  }

  files.save = path.join(directory, 'Montageplatte-Skizze.dxf');
  await js(`
    a.select([{rootId:window.__plateId,path:[]}]);
    a.actions.export();
    $('export-format').value='profile-dxf';
    $('export-format').dispatchEvent(new Event('change',{bubbles:true}));
    $('export-profile-source').value='sketch';
    $('export-profile-source').dispatchEvent(new Event('change',{bubbles:true}));
    $('export-confirm').click();
  `);
  await until(() => fs.existsSync(files.save), 'Skizzenexport fehlt');
  await until(() => js("return !$('modal').open"), 'Exportdialog schließt nicht');
  note('Ausgewählte native Skizze exportiert');

  const svgFixture = fs.readFileSync(path.join(directory, 'Montageplatte-fremd.svg'), 'utf8'),
    dxfFixture = fs.readFileSync(path.join(directory, 'Montageplatte-fremd.dxf'), 'utf8'),
    unspecified = fs.readFileSync(path.join(directory, 'Montageplatte-Einheit-offen.dxf'), 'utf8');
  await drop('Fremdes SVG.svg', svgFixture);
  await until(() => js("return !!$('import-kind')"), 'SVG-Dateiauswahl fehlt');
  await js(`
    $('import-kind').value='sketch';
    $('import-kind').dispatchEvent(new Event('change',{bubbles:true}));
    $('import-confirm').click();
  `);
  await until(() => js("return !!$('sketch-board')"), 'SVG-Skizzeneditor fehlt');
  await js(
    "check(a.serialize()===window.__exchangeBefore,'SVG editor changed the existing project');$('sketch-preview').click();",
  );
  await until(() => js("return !!$('sketch-apply')&&!$('sketch-apply').disabled"), 'SVG-Extrusionsvorschau fehlt');
  await js("$('sketch-apply').click();");
  await until(() => js('return a.getModel().nodes.length===2'), 'SVG-Skizzenquelle fehlt');
  await js(`
    await a.settled();
    const node=a.getModel().nodes.at(-1), {min,max}=node.stats.bounds;
    check(Math.abs(max[0]-min[0]-100)<1e-6&&Math.abs(max[1]-min[1]-60)<1e-6,
      'SVG transform and unit mapping');
    check(node.recipe.sketch.elements.filter(e=>e.type==='circle'&&Number(e.diameter)===6).length===4,'SVG circles');
    await a.actions.undo();
    check(a.serialize()===window.__exchangeBefore,'SVG Undo changed the project');
  `);
  note('Fremdes SVG mit verschachtelten Gruppen und gemischten Einheiten maßhaltig importiert');

  await drop('Fremdes DXF ohne Einheit.dxf', unspecified);
  await until(() => js("return !!$('dxf-import-unit')"), 'DXF-Einheitenwahl fehlt');
  await js("$('dxf-import-confirm').click();");
  await until(
    () => js("return $('dxf-import-status')?.textContent.toLowerCase().includes('einheit')"),
    'fehlende Einheit wurde nicht gemeldet',
  );
  await js("$('dxf-import-unit').value='1';$('dxf-import-confirm').click();");
  await until(() => js("return !!$('sketch-board')"), 'DXF-Skizzeneditor fehlt');
  await js("$('sketch-cancel').click();");
  note('DXF ohne Einheit verlangt Auswahl und kann abgebrochen werden');

  await js(`
    const selection = new DataTransfer();
    selection.items.add(new File([${JSON.stringify(dxfFixture)}], 'Fremdes DXF.dxf'));
    check($('import-file').accept.split(',').includes('.dxf'),'Dateiauswahl akzeptiert kein DXF');
    $('import-file').files = selection.files;
    $('import-file').dispatchEvent(new Event('change',{bubbles:true}));
  `);
  await until(() => js("return !!$('dxf-import-confirm')"), 'DXF-Importdialog fehlt');
  await js("$('dxf-import-confirm').click();");
  await until(() => js("return !!$('sketch-board')"), 'DXF-Skizzeneditor fehlt');
  await js("$('sketch-preview').click();");
  await until(() => js("return !!$('sketch-apply')&&!$('sketch-apply').disabled"), 'DXF-Extrusionsvorschau fehlt');
  await js("$('sketch-apply').click();");
  await until(() => js('return a.getModel().nodes.length===2'), 'Editierbare Skizzenquelle fehlt');
  await js(`
    await a.settled();
    const sketch=a.getModel().nodes.at(-1).recipe.sketch;
    check(sketch.loops.length===6,'sechs Konturen');
    check(sketch.elements.filter(e=>e.type==='circle'&&Number(e.diameter)===6).length===4,'vier Bohrungen Durchmesser 6');
    check(sketch.elements.filter(e=>e.type==='arc').length===2,'zwei Langlochbögen');
    const centers=sketch.elements.filter(e=>e.type==='circle').map(e=>e.center.map(Number).join(',')).sort();
    check(JSON.stringify(centers)===JSON.stringify(['10,10','10,50','90,10','90,50']),'DXF block placements');
    check(a.undoDepth()===window.__exchangeUndo+1,'Import hat nicht genau einen Undo-Schritt');
    await a.actions.undo();
    check(a.serialize()===window.__exchangeBefore,'Undo stellt Modell nicht wieder her');
    await a.actions.redo();
    await a.settled();
  `);
  note('Fremdes DXF mit Blockvorkommen und Langloch importiert. Undo und Redo geprüft');

  files.save = path.join(directory, 'Montageplatte-Rundlauf.ocad');
  await js(`
    check((await a.save({saveAs:true,format:'ocad'})).saved,'OCAD save');
    await a.resetProject();
    check(await a.openProject(),'OCAD re-open');
    await a.settled();
    const added=a.getModel().nodes.find(node=>node.name==='Fremdes DXF');
    check(added?.recipe?.sketch?.elements.filter(e=>e.type==='circle').length===4,'native re-open');
  `);
  note('Import im Projekt gespeichert und als native Skizzenquelle wieder geöffnet');
  return { ok: true, checks };
};
