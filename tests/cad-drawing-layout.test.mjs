import test from 'node:test';
import assert from 'node:assert/strict';
import {cadDrawingProjectionCenter,cadDrawingUpdatedPosition,cadDrawingRescaledPosition,cadDrawingNewViewPosition} from '../src/cad-drawing-layout.js';
const projection=(min,max)=>({bounds:{min,max}}),paperCenter=(position,projection,scale)=>{const center=cadDrawingProjectionCenter(projection);return [position[0]+center[0]*scale,position[1]-center[1]*scale];};

test('first native view centres a far translated entire assembly on its chosen paper anchor',()=>{
 const curves=projection([1980,-3020],[2060,-2970]),before=structuredClone(curves),anchor=[65,100],position=cadDrawingUpdatedPosition(anchor,undefined,curves,1);
 assert.deepEqual(paperCenter(position,curves,1),anchor);assert.deepEqual(curves,before);
 // The complete eighty millimetre span is retained; component locations do not
 // get individually centred or normalised.
 assert.equal(position[0]+curves.bounds.max[0]-(position[0]+curves.bounds.min[0]),80);
});
test('source movement, resizing and changed sections preserve a manually placed view centre',()=>{
 const old=projection([2000,10],[2060,16]),next=projection([-1500,-90],[-1420,-50]),position=[-1880,110],center=paperCenter(position,old,.5),updated=cadDrawingUpdatedPosition(position,old,next,.5);
 assert.deepEqual(paperCenter(updated,next,.5),center);assert.deepEqual(position,[-1880,110]);
});
test('paper scale changes preserve centre and physical model size at every world offset',()=>{
 const p=projection([2000,-1000],[2060,-960]),position=cadDrawingUpdatedPosition([165,145],undefined,p,1),half=cadDrawingRescaledPosition(position,p,1,.5);
 assert.deepEqual(paperCenter(half,p,.5),[165,145]);assert.equal((p.bounds.max[0]-p.bounds.min[0])*.5,30);
 assert.deepEqual(cadDrawingRescaledPosition(half,p,.5,1),position);
});
test('missing initial cache has a paper anchor and invalid layout values fail early',()=>{
 assert.deepEqual(cadDrawingRescaledPosition([65,100],undefined,1,.5),[65,100]);
 for(const fn of [()=>cadDrawingUpdatedPosition([0,0],null,null,1),()=>cadDrawingUpdatedPosition([NaN,0],null,projection([0,0],[1,1]),1),()=>cadDrawingRescaledPosition([0,0],null,1,0),()=>cadDrawingProjectionCenter(projection([5,0],[1,1]))])assert.throws(fn);
});
test('all thirty-two new view anchors stay in drawable A4 and A3 paper areas',()=>{
 for(const size of [[297,210],[210,297],[420,297],[297,420]])for(let count=0;count<32;count++){
  const [x,y]=cadDrawingNewViewPosition(count,size);assert.ok(x>=40&&x<=size[0]-40);assert.ok(y>=40&&y<=size[1]-65);
 }
 assert.deepEqual(cadDrawingNewViewPosition(3,[297,210]),[165,145]);
});
