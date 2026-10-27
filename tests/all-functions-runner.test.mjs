import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {surfaceSuites,unitSuites,testInventory} from '../scripts/all-functions-catalog.mjs';

test('Every real application verification entry has a catalogued current suite',()=>{
 const source=fs.readFileSync('electron.cjs','utf8'),flags=new Set([...source.matchAll(/startsWith\('--verify-([\w-]+)='/g)].map(m=>m[1]));
 for(const helper of ['all-phase','release-reopen'])flags.delete(helper);
 for(const flag of flags)assert(surfaceSuites.some(s=>s.flag===flag),'Uncatalogued application entry '+flag);
 assert.equal(new Set(surfaceSuites.map(s=>s.id)).size,surfaceSuites.length);
 assert(surfaceSuites.every(s=>s.timeoutMs>0));
});
test('All discoverable files are classified, including native and legacy launchers',()=>{
 const inventory=testInventory(),units=unitSuites();assert(units.length>=156);
 assert(inventory.every(e=>e.suite||e.reason));assert(inventory.some(e=>e.file==='tests/cad-fonts.test.mjs'&&e.classification==='current-node-suite'));
 assert(inventory.some(e=>e.file==='tests/cad-portable-proof.cjs'&&e.replacement));
});
test('Unknown modes and suites cannot silently produce a passing partial run',()=>{
 for(const args of [['--mode','unknown','--list'],['--suite','missing-suite','--list'],['--mode','packaged','--list']]){
  const result=spawnSync(process.execPath,['scripts/test-all-functions.mjs',...args],{encoding:'utf8',windowsHide:true});assert.notEqual(result.status,0);assert.match(result.stderr,/Expected source|Unknown suite|requires --exe/);
 }
});
