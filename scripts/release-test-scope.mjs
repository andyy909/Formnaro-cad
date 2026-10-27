import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function tapTotals(file){
 const text=fs.readFileSync(file,'utf8'),count=Number(text.match(/^# tests (\d+)$/m)?.[1]);
 assert(count>0&&/^# fail 0$/m.test(text)&&/^# skipped 0$/m.test(text)&&/^# cancelled 0$/m.test(text),'Incomplete or failing test run: '+file);
 return {count,log:path.resolve(file),sha256:hash(file)};
}
// Explicit follow-up to the broad 0.113.1 maintenance run. A different file
// change requires a new selection/review; it cannot silently reuse this base.
export function maintenanceDeltaScope({baseline,source,files}){
 baseline=path.resolve(baseline);const unit=tapTotals(path.join(baseline,'unit.log'));assert(unit.count>640);
 const previous=JSON.parse(fs.readFileSync(path.join(baseline,'source-freeze.json'),'utf8'));
 const original=path.resolve('work/release-build/Fehlerkorrekturen-v0.113.1-r1/source');
 const allowed=new Set(['backend/program-storage.cjs','backend/maintenance-verification.cjs','src/cad-main.js','src/cad-ai-sandbox.js','src/cad-sandbox-frame.html','src/settings.css','tests/maintenance-regressions.test.mjs','scripts/package-freecad-python.mjs','scripts/release-test-scope.mjs','docs/AUSBAUPLAN-AB-0.106.md','docs/PROJEKTKONTEXT.md','docs/BUILD.md']);
 const before=new Map(previous.map(row=>[row.file,row.sha256])),after=new Map(files.map(row=>[row.file,row.sha256])),changed=[];
 for(const row of previous)assert.equal(hash(path.join(original,row.file)),row.sha256,'Baseline source changed: '+row.file);
 for(const file of new Set([...before.keys(),...after.keys()])){
  if(before.get(file)===after.get(file))continue;assert(allowed.has(file),'Unreviewed change outside targeted maintenance scope: '+file);assert(after.has(file),'Unexpected source deletion: '+file);changed.push({file,before:before.get(file)??null,after:after.get(file)});
 }
 assert(changed.some(row=>row.file==='src/cad-ai-sandbox.js'));
 return {kind:'targeted-maintenance-followup',baseline:{...unit,sourceFreeze:path.join(baseline,'source-freeze.json'),sourceFreezeSha256:hash(path.join(baseline,'source-freeze.json'))},changed,files:['maintenance-regressions.test.mjs','program-storage.test.cjs','program-storage-cad.test.cjs','projects.test.cjs','files.test.cjs','layout-files.test.cjs','layout.test.mjs','layout-customization.test.mjs','all-functions-runner.test.mjs','mesh-partition-review.test.mjs','cad-recovery.test.mjs','fnpack-recovery.test.mjs','ai-working-contract.test.mjs','cad-ai-program.test.mjs'],reason:'Only sandbox/CSP integration, portable markerless-folder copying and their verification changed after the broad baseline. All prior packaged suites still run on the new EXE. Counts for baseline and follow-up are recorded separately.'};
}
