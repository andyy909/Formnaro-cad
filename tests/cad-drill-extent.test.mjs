import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCadDrillExtent,validateCadDrillDimensions} from '../src/cad-drill-extent.js';

test('Durchgangslänge wächst mit dem Körper, feste Tiefe bleibt gleich',()=>{
 const bounds=height=>({min:[-20,-10,-height],max:[20,10,0]});
 assert.equal(calculateCadDrillExtent({termination:'through',bounds:bounds(4),margin:.001}),4.001);
 assert.equal(calculateCadDrillExtent({termination:'through',bounds:bounds(12),margin:.001}),12.001);
 assert.equal(calculateCadDrillExtent({termination:'depth',depth:3,bounds:bounds(12)}),3);
});

test('Bis Fläche benötigt eine parallele Zielfläche in Bohrrichtung',()=>{
 assert.equal(calculateCadDrillExtent({termination:'plane',stopPlane:{point:[2,4,-8],normal:[0,0,-1]}}),8);
 for(const stopPlane of [{point:[0,0,2],normal:[0,0,1]},{point:[0,0,-2],normal:[1,0,0]},{point:[0,0,-2],normal:[0,0,0]}])assert.throws(()=>calculateCadDrillExtent({termination:'plane',stopPlane}),{code:'INVALID_CAD_DRILL_EXTENT'});
});

test('Kopfaufnahme und Senkung bleiben bei Änderung des Körpers gültig oder werden abgewiesen',()=>{
 assert.deepEqual(validateCadDrillDimensions({kind:'counterbore',diameter:4,headDiameter:8,headDepth:3,length:12}),{bore:4,head:8,headDepth:3,length:12});
 assert.throws(()=>validateCadDrillDimensions({kind:'counterbore',diameter:4,headDiameter:8,headDepth:3,length:2}),/flacher/);
 assert.equal(validateCadDrillDimensions({kind:'countersink',diameter:4,headDiameter:8,angle:90,length:12}).sinkDepth,2.0000000000000004);
 assert.throws(()=>validateCadDrillDimensions({kind:'countersink',diameter:4,headDiameter:8,angle:90,length:1}),/mehr Bohrungstiefe/);
});

test('Unsichere oder nicht endliche Eingaben werden abgelehnt',()=>{
 for(const args of [{termination:'through',bounds:{min:[0,0,1],max:[1,1,2]}},{termination:'depth',depth:NaN},{termination:'depth',depth:4,margin:Infinity}])assert.throws(()=>calculateCadDrillExtent(args),{code:'INVALID_CAD_DRILL_EXTENT'});
 assert.throws(()=>validateCadDrillDimensions({kind:'plain',diameter:NaN,length:4}),{code:'INVALID_CAD_DRILL_EXTENT'});
});
