import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditPythonReader,authoredPythonProofs} from '../scripts/audit-python-api-release.mjs';

const report=()=>({ok:true,artifacts:Array.from({length:6},(_,i)=>({file:String(i)})),examples:[
 {stem:'python-plate',stepVolume:14400-2*Math.PI*6.25*6,closed:true,solids:1,bodies:Array.from({length:4},()=>({source:'native',volume:100})),stl:{volume:14400-2*Math.PI*6.25*6+.1,watertight:true,oriented:true,triangles:200}},
 {stem:'python-loft',stepVolume:3000,closed:true,solids:1,bodies:Array.from({length:3},()=>({source:'native',volume:100})),stl:{volume:3000,watertight:true,oriented:true,triangles:12}}
]});
test('Python release audit demands every actual UI proof and the full independent model scope',()=>{
 assert.equal(authoredPythonProofs().length,22);assert.deepEqual(auditPythonReader(report()),{examples:2,bodies:7,artifacts:6});
 for(const change of [r=>r.examples.pop(),r=>r.artifacts.pop(),r=>r.examples[0].bodies.pop(),r=>r.examples[0].closed=false,r=>r.examples[1].stepVolume=2900,r=>r.examples[0].stl.watertight=false,r=>{r.examples[0].stl.allowedTessellationVolumeDifference=1e9;r.examples[0].stl.volume+=20;}]){const r=report();change(r);assert.throws(()=>auditPythonReader(r));}
});
