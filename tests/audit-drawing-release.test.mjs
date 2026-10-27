import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditMeasuredStl} from '../scripts/audit-drawing-release.mjs';
const points=[[-9,-9,0],[87,-9,12],[87,61,12]],bounds={min:[-9,-9,0],max:[87,61,12]};
const ascii=points=>'solid audit\nfacet normal 0 0 1\nouter loop\n'+points.map(p=>'vertex '+p.join(' ')).join('\n')+'\nendloop\nendfacet\nendsolid audit\n';
test('independent release audit reads complete ASCII and binary STL records, even binary headers starting solid',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-stl-audit-'));try{
  const file=path.join(directory,'part.stl'),input=ascii(points);fs.writeFileSync(file,input);const checked=auditMeasuredStl({file,geometry:{encoding:'ascii',triangles:1,bounds}});assert.equal(checked.encoding,'ascii');assert.equal(checked.triangles,1);assert.deepEqual(checked.bounds,bounds);
  const binary=Buffer.alloc(134);binary.write('solid misleading binary header');binary.writeUInt32LE(1,80);binary.writeFloatLE(1,92);points.forEach((p,i)=>p.forEach((v,k)=>binary.writeFloatLE(v,96+i*12+k*4)));fs.writeFileSync(file,binary);assert.equal(auditMeasuredStl({file,geometry:{encoding:'binary',triangles:1,bounds}}).encoding,'binary');
 }finally{fs.rmSync(path.join(directory,'part.stl'),{force:true});fs.rmdirSync(directory);}
});
test('independent STL release audit rejects truncated facets, wrong counts/bounds, nonfinite and degenerate geometry',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-stl-audit-'));try{
  const file=path.join(directory,'part.stl'),receipt={file,geometry:{encoding:'ascii',triangles:1,bounds}};
  for(const invalid of [ascii(points).replace('endfacet\n',''),ascii(points).replace('endsolid audit','endsolid other'),ascii(points).replace('vertex 87 -9 12','vertex Infinity -9 12'),ascii([points[0],points[0],points[2]])]){fs.writeFileSync(file,invalid);assert.throws(()=>auditMeasuredStl(receipt));}
  fs.writeFileSync(file,ascii(points));assert.throws(()=>auditMeasuredStl({...receipt,geometry:{...receipt.geometry,triangles:2}}),/triangle count/);assert.throws(()=>auditMeasuredStl({...receipt,geometry:{...receipt.geometry,bounds:{...bounds,max:[88,61,12]}}}),/bounds differ/);
 }finally{fs.rmSync(path.join(directory,'part.stl'),{force:true});fs.rmdirSync(directory);}
});
