import test from 'node:test';
import assert from 'node:assert/strict';
import {remapCadBoxFaceAnchor} from '../src/cad-box-face-anchor.js';
const bounds=h=>({min:[-20,-10,-h/2],max:[20,10,h/2]});
const anchor={point:[5,-3,2],normal:[0,0,1]};
test('Semantische Oberseite folgt Dickenänderung ohne XY-Lage zu verschieben',()=>{
 assert.deepEqual(remapCadBoxFaceAnchor({feature:'box-face-top',anchor,previousBounds:bounds(4),currentBounds:bounds(12)}),{point:[5,-3,6],normal:[0,0,1]});
});
test('Mehrdeutige, verlorene und falsche Bezüge bleiben ungelöst',()=>{
 for(const bad of [{...anchor,point:[20,-3,2]},{...anchor,point:[5,-3,1]},{...anchor,normal:[0,1,0]}])assert.equal(remapCadBoxFaceAnchor({feature:'box-face-top',anchor:bad,previousBounds:bounds(4),currentBounds:bounds(12)}),null);
 assert.equal(remapCadBoxFaceAnchor({feature:'box-face-top',anchor,previousBounds:bounds(4),currentBounds:{min:[-2,-2,-6],max:[2,2,6]}}),null);
 assert.equal(remapCadBoxFaceAnchor({feature:'wrong',anchor,previousBounds:bounds(4),currentBounds:bounds(12)}),null);
});
