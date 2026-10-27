import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const [entry, mode] of [['run-cad-release-gates.mjs', 'test'], ['package-cad-release.mjs', 'package']]) {
  for (const version of ['0.113.1', '0.114.0']) {
    test(`${entry} forwards ${version} without historical work inputs`, t => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-release-entry-'));
      t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({version}));
      fs.copyFileSync(path.join(root, 'scripts', entry), path.join(dir, 'scripts', entry));
      // Capture the real compatibility entry's handoff without running CAD or packaging.
      fs.writeFileSync(path.join(dir, 'scripts/current-release.mjs'), `
        import fs from 'node:fs';
        console.log(JSON.stringify({args: process.argv.slice(2), version: JSON.parse(fs.readFileSync('package.json')).version}));
      `);
      const result = spawnSync(process.execPath, ['scripts/' + entry, 'r7'], {cwd: dir, encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {args: [mode, 'r7'], version});
      assert.equal(fs.existsSync(path.join(dir, 'work')), false);
    });
  }
}

test('npm release commands select the current pipeline', () => {
  const {scripts} = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(scripts.package, 'node scripts/current-release.mjs package');
  assert.equal(scripts['test:cad-release'], 'node scripts/current-release.mjs test');
});
