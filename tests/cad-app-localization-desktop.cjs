const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

const profile = process.env.FORMNARO_LOCALIZATION_PROFILE;
assert.ok(profile && path.isAbsolute(profile), 'Use npm run test:cad-localization to start with an isolated profile.');
app.setPath('userData', profile);
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  try {
    await win.loadFile(path.join(__dirname, '../work/cad-v011/native-app/index.html'), { query: { test: '1' } });
    const js = code => win.webContents.executeJavaScript(code);
    const waitFor = condition => js(`(async()=> {
      for (let tries = 0; tries < 150; tries++) {
        if (window.__cadError) throw Error(window.__cadError);
        if (${condition}) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw Error('UI did not update: ' + ${JSON.stringify(condition)});
    })()`);
    const label = selector => js(`document.querySelector(${JSON.stringify(selector)}).textContent.trim()`);
    const chooseLanguage = lang => js(`(() => {
      const select = document.querySelector('#settings-language');
      select.value = ${JSON.stringify(lang)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor('window.__cadReady');
    await js("document.querySelector('#settings-open').click()");
    await chooseLanguage('en');
    await waitFor("document.documentElement.lang === 'en'");
    const controls = [
      ['[data-settings-tab="files"]', 'Files', 'Dateien'],
      ['#settings-tab-context', 'Right click', 'Rechtsklick'],
      ['#settings-theme option[value="system"]', 'Follow Windows (startup default)', 'Wie Windows (Startstandard)'],
      ['#settings-meshDisplayStyle option[value="blue"]', 'Technical · Blue', 'Technisch · Blau'],
      ['[data-action="sketch-on-part"]', 'Sketch on part face …', 'Skizze auf Teilfläche …'],
      ['[data-action="linked-contours"]', 'Linked contours …', 'Konturverknüpfungen …'],
      ['#ai-chat-pick-feature', 'Attach model feature', 'Stelle anhängen'],
      ['[data-example="atlas"] strong', 'ATLAS-5 milling machine', 'ATLAS-5-Fräse'],
    ];
    for (const [selector, en] of controls) assert.equal(await label(selector), en, selector);
    await js("document.querySelector('#settings-done').click(); document.querySelector('[data-action=export]').click()");
    await waitFor("document.querySelector('#export-confirm')?.textContent === 'Export'");
    assert.equal(await label('#export-format option[value="stl"]'), 'STL · 3D printing');
    assert.equal(await label('#export-format option[value="step"]'), 'STEP · CAD solids');
    assert.match(await label('#modal-body > p'), /^Exports include permanently visible parts\./);
    await js("document.querySelector('#modal-close').click(); document.querySelector('#settings-open').click()");
    await chooseLanguage('de');
    await waitFor("document.documentElement.lang === 'de'");
    for (const [selector, , de] of controls) assert.equal(await label(selector), de, selector);
    console.log('PASS: Windows localization follows the live language switch and export dialog.');
  } finally {
    win.destroy();
  }
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
