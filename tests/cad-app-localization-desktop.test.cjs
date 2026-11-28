const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

test('Desktop language changes update the real CAD interface', async () => {
  const { translateText } = await import('../src/i18n.js');
  assert.equal(translateText('Beispiel geladen. Änderungen als eigenes Projekt speichern.', 'en'),
    'Example loaded. Save changes as a separate project.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-localization-'));
  try {
    const run = spawnSync(require('electron'), [path.join(__dirname, 'cad-app-localization-desktop.cjs')], {
      env: { ...process.env, FORMNARO_LOCALIZATION_PROFILE: profile },
      stdio: 'inherit',
      timeout: 120_000,
      windowsHide: true,
    });
    assert.ifError(run.error);
    assert.equal(run.status, 0);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});
