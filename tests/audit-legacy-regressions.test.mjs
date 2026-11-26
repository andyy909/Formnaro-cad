import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {threeMF} from '../src/mesh-engine/exports.js';

test('BUG-52 classic 3MF writes alpha from each part opacity',()=>{const parts=[{name:'transparent',color:'#123456',opacity:.25,data:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]}}],model=strFromU8(unzipSync(threeMF(parts))['3D/3dmodel.model']);assert(model.includes('#12345640'));});
