import test from 'node:test';
import assert from 'node:assert/strict';
import {constraintAnchor,constraintsForElements,quickConstraintRefs,selectedConstraintRefs} from '../src/sketch-direct-constraints.js';
import {solveSketchConstraints} from '../src/sketch-constraints-solver.js';
const line={id:'a',type:'line',start:[0,0],end:[10,0]},circle={id:'b',type:'circle',center:[20,5],radius:3};
test('dimension labels use stable geometry references and missing references are harmless',()=>{assert.deepEqual(constraintAnchor({refs:[{element:'a'}]},[line,circle]),[5,0]);assert.deepEqual(constraintAnchor({refs:[{element:'a',point:'start'},{element:'b',point:'center'}]},[line,circle]),[10,2.5]);assert.equal(constraintAnchor({refs:[{element:'missing'}]},[line]),null);});
test('selection exposes point references and connected relations without duplicates',()=>{const handles=[{references:[{id:'a',field:'end'},{id:'b',field:'center'}]},{references:[{id:'a',field:'end'}]}];assert.deepEqual(selectedConstraintRefs(handles,[0,1]),[{element:'a',point:'end'},{element:'b',point:'center'}]);assert.deepEqual(constraintsForElements([{id:'one',refs:[{element:'a'}]},{id:'two',refs:[{element:'b'}]}],['a']),['one']);});
test('edited value is solved and a conflicting edit returns the previous draft',()=>{const base={version:3,kind:'profile',variables:[],dimensions:{height:'1'},elements:[{id:'a',type:'line',start:['0','0'],end:['10','0'],construction:true}],loops:[],constraints:[{id:'fixed',type:'fixed',refs:[{element:'a',point:'start'}],value:[0,0]},{id:'horizontal',type:'horizontal',refs:[{element:'a'}]},{id:'length',type:'length',refs:[{element:'a'}],value:'10'}]};const changed=structuredClone(base);changed.constraints[2].value='20';const ok=solveSketchConstraints(changed,{lastValid:base});assert.equal(ok.ok,true);assert.ok(Math.abs(Number(ok.sketch.elements[0].end[0])-20)<1e-5);const bad=structuredClone(ok.sketch);bad.constraints.push({id:'bad',type:'length',refs:[{element:'a'}],value:'30'});const failed=solveSketchConstraints(bad,{lastValid:ok.sketch});assert.equal(failed.ok,false);assert.deepEqual(failed.sketch,ok.sketch);assert.ok(failed.conflicts.length);});


test('quick relationships require distinct eligible selections from the current geometry', () => {
  const second = { ...line, id: 'second' };
  const arc = { id: 'arc', type: 'arc', start: [2, 3], through: [3, 4], end: [4, 3] };
  const elements = [line, circle, second, arc];
  const elementsOnly = (type, ids) => quickConstraintRefs(type, elements, ids, []);
  assert.deepEqual(elementsOnly('horizontal', ['a']), [{ element: 'a' }]);
  assert.equal(elementsOnly('horizontal', ['b']), null);
  assert.deepEqual(elementsOnly('parallel', ['a', 'second']), [{ element: 'a' }, { element: 'second' }]);
  assert.equal(elementsOnly('parallel', ['a', 'missing']), null);
  assert.equal(elementsOnly('parallel', ['a', 'a']), null);
  assert.equal(elementsOnly('tangent', ['a', 'second']), null);
  assert.deepEqual(elementsOnly('tangent', ['a', 'arc']), [{ element: 'a' }, { element: 'arc' }]);
  assert.deepEqual(elementsOnly('equalRadius', ['b', 'arc']), [{ element: 'b' }, { element: 'arc' }]);
  assert.equal(elementsOnly('equalRadius', ['a', 'arc']), null);
});

test('quick point relationships use exactly the chosen points and reject ambiguous joints', () => {
  const start = { element: 'a', point: 'start' };
  const end = { element: 'a', point: 'end' };
  const center = { element: 'b', point: 'center' };
  assert.deepEqual(quickConstraintRefs('coincident', [line, circle], [], [[start], [center]]), [start, center]);
  assert.equal(quickConstraintRefs('coincident', [line, circle], [], [[start, center]]), null);
  assert.equal(quickConstraintRefs('coincident', [line, circle], [], [[start, center], [end]]), null);
  assert.equal(quickConstraintRefs('coincident', [line], [], [[start], [center]]), null);
  assert.equal(quickConstraintRefs('coincident', [line], [], [[start], [start]]), null);
  assert.deepEqual(quickConstraintRefs('fixed', [line], [], [[start]]), [start]);
  assert.equal(quickConstraintRefs('fixed', [line], ['a'], [[start]]), null);
});
