import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';

const output = path.resolve('work', 'photo-mode');
mkdirSync(output, { recursive: true });
const report = path.join(mkdtempSync(path.join(output, 'run-')), 'result.json');
const run = spawnSync(process.execPath, ['node_modules/electron/cli.js', '.', '--verify-photo-mode=' + report], {
  stdio: 'inherit', windowsHide: true, timeout: 120000,
});
if (run.error) throw run.error;
if (run.status !== 0) {
  if (existsSync(report)) console.error(readFileSync(report, 'utf8'));
  process.exit(run.status ?? 1);
}
const evidence = JSON.parse(readFileSync(report, 'utf8'));
if (!evidence.ok || !evidence.isolatedProfile || !evidence.checks?.length) throw Error('Incomplete photo-mode verification');
console.log(`Photo mode: ${evidence.checks.length} checks passed. ${report}`);
