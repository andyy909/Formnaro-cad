import test from 'node:test';
import assert from 'node:assert/strict';
import {cadInterfaceLocalBounds,cadFormLocalDimensions} from '../src/cad-interface-state.js';

test('immutable vertex bounds are safe to reuse across placement and callers',()=>{
 const verts=Object.freeze([-2,-3,-4,5,6,7]),node={kind:'mesh',mesh:{verts},transform:[1,0,0,0,0,1,0,0,0,0,1,0,100,200,300,1]};
 const first=cadInterfaceLocalBounds(node);first.min[0]=-999;first.max[1]=999;
 assert.deepEqual(cadInterfaceLocalBounds(node),{min:[-2,-3,-4],max:[5,6,7]});
 assert.deepEqual(cadFormLocalDimensions(node),[7,9,11]);
 node.transform[0]=-2;node.transform[5]=3;
 assert.deepEqual(cadFormLocalDimensions(node),[14,27,11]);
 node.mesh.verts=Object.freeze([0,0,0,1,2,3]);
 assert.deepEqual(cadInterfaceLocalBounds(node),{min:[0,0,0],max:[1,2,3]});
});

test('mutable imports and drafts always observe edits and reject nonfinite values',()=>{
 const verts=[0,0,0,1,2,3],node={kind:'referenceMesh',mesh:{verts}};
 assert.deepEqual(cadInterfaceLocalBounds(node).max,[1,2,3]);verts[3]=8;
 assert.deepEqual(cadInterfaceLocalBounds(node).max,[8,2,3]);verts[4]=NaN;
 assert.throws(()=>cadInterfaceLocalBounds(node),/Ungültige Netzreferenz/);
 assert.throws(()=>cadInterfaceLocalBounds({kind:'mesh',mesh:{verts:Object.freeze([0,Infinity,1])}}),/Ungültige Netzreferenz/);
});
