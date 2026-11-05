import test from 'node:test';
import assert from 'node:assert/strict';
import {locatePracticeSketchGesture} from '../src/cad-practice-sketch.js';

test('sketch gestures follow the SVG camera and require an unobstructed start and end',()=>{
  const child={};
  const board={
    getBoundingClientRect:()=>({left:100,top:100,right:400,bottom:400,width:300,height:300}),
    getScreenCTM:()=>({}),
    createSVGPoint:()=>({matrixTransform(){return {x:200+this.x*3,y:220+this.y*3};}}),
    contains:node=>node===child
  };
  let covered=false;
  const document={
    querySelector:selector=>selector==='dialog[open].sketch-modal #sketch-board'?board:null,
    elementFromPoint:x=>covered&&x>200?{}:child
  };
  assert.deepEqual(locatePracticeSketchGesture(document,{point:[0,5],to:[4,5]}),{
    x:200,y:205,width:300,height:300,to:{x:212,y:205}
  });
  covered=true;
  assert.throws(()=>locatePracticeSketchGesture(document,{point:[0,5],to:[4,5]}),/sichtbaren Zeichenfläche/);
  assert.throws(()=>locatePracticeSketchGesture(document,{point:[-50,0]}),/sichtbaren Zeichenfläche/);
});
