import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLayout,validateLayout,emptyLayouts,changeLayouts,validateLayouts} from '../backend/layout-data.mjs';
import {CAD_SHAPES} from '../src/cad-shapes.js';
import {cadShapeIcon} from '../src/cad-shape-icons.js';

test('Old current and named portable layouts migrate together; explicit dimensions survive profile switches',()=>{
  const old=defaultLayout();for(const key of ['libraryWidth','inspectorWidth','shapeLibraryHeight','chatHeight'])delete old[key];
  const value={format:'Formnaro-Layouts',version:1,current:old,activeId:'12345678-1234-1234-1234-123456789abc',profiles:[{id:'12345678-1234-1234-1234-123456789abc',name:'Alt',layout:old}]};
  const migrated=validateLayouts(value);assert.deepEqual(migrated.current,defaultLayout());assert.deepEqual(migrated.current,migrated.profiles[0].layout);
  const resized={...defaultLayout(),libraryWidth:380,inspectorWidth:420,shapeLibraryHeight:260,chatHeight:300};
  let store=changeLayouts(emptyLayouts(),{action:'save',name:'Größen',layout:resized},()=>value.activeId);
  store=changeLayouts(store,{action:'reset'},()=>{});store=changeLayouts(store,{action:'load',id:value.activeId},()=>{});assert.deepEqual(store.current,resized);
  for(const invalid of [0,NaN,Infinity,380.5,'380',{},-1,9999])assert.throws(()=>validateLayout({...resized,libraryWidth:invalid}));
});

test('Every native palette shape has its own illustration and no external images',()=>{
  const icons=CAD_SHAPES.map(({type,color})=>{const svg=cadShapeIcon(type,color);assert.ok(svg.includes(`data-shape-icon="${type}"`));assert.ok(!svg.includes('href=')&&!svg.includes('<script'));return svg.replace(/#[a-f0-9]{6}/gi,'COLOR').replace(/data-shape-icon="[^"]*"/,'');});
  assert.equal(new Set(icons).size,CAD_SHAPES.length);
  assert.ok(!cadShapeIcon('unknown','" onload="bad').includes('onload'));
});
