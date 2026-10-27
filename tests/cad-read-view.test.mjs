import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,cadProjectReadView,cadProjectSnapshot,cadProjectRevision,serializeCadProject} from '../src/cad-project.js';

test('Read views retain the exact serialization and revision algorithm while isolating caller mutations',()=>{
 const input=createCadProject(),expected=serializeCadProject(input),revision=cadProjectRevision(input),view=cadProjectReadView(input);
 assert.equal(serializeCadProject(view),expected);assert.equal(cadProjectRevision(view),revision);assert.equal(cadProjectReadView(view),view);
 input.layers[0].name='Changed';assert.equal(cadProjectRevision(view),revision);assert.notEqual(cadProjectRevision(input),revision);
 assert.throws(()=>{view.layers[0].name='Tamper'},TypeError);
 const draft=cadProjectSnapshot(view);draft.name='Next';assert.notEqual(cadProjectRevision(draft),revision);assert.equal(serializeCadProject(view),expected);
});

test('Shallow frozen and external values cannot establish a trusted revision cache',()=>{
 const input=createCadProject(),view=Object.freeze(input),first=cadProjectRevision(view);view.layers[0].name='Changed';assert.notEqual(cadProjectRevision(view),first);
 assert.throws(()=>cadProjectReadView({...input,unknown:'value'}),/Unbekanntes Feld/);
 assert.throws(()=>cadProjectReadView({...input,layers:[{...input.layers[0],locked:'yes'}]}));
});
