import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLayout,validateLayout,validateLayouts,emptyLayouts,changeLayouts} from '../backend/layout-data.mjs';
import {moveLayoutItem} from '../src/layout-preferences.js';
import {layoutGridPosition, snapLayoutGrid} from '../src/layout-grid.js';

test('old layouts and named profiles retain positions and gain all previously unmovable tools',()=>{
  const old=defaultLayout(),added=['stl-to-step','drill','mesh-tools','mesh-select','mesh-inspector','mesh-repair','mesh-close-hole','mesh-more','cad-to-mesh','mesh-to-cad','workplane-set','workplane-top','reset-plane'];
  for(const keys of Object.values(old.zones))for(const key of added){const index=keys.indexOf(key);if(index>=0)keys.splice(index,1);}
  delete old.hiddenTools;delete old.objectsFirst;delete old.workspaceFirst;old.zones.header.reverse();old.librarySide='right';
  const upgraded=validateLayout(old);assert.deepEqual(upgraded.zones.header.filter(key=>!added.includes(key)),old.zones.header);assert.equal(upgraded.librarySide,'right');
  for(const key of added)assert.equal(Object.values(upgraded.zones).flat().filter(value=>value===key).length,1);
  const id='11111111-1111-4111-8111-111111111111',collection={...emptyLayouts(),current:old,activeId:id,profiles:[{id,name:'Bestehende Anordnung',layout:old}]};
  const migrated=validateLayouts(collection);assert.equal(migrated.activeId,id);assert.deepEqual(migrated.current,migrated.profiles[0].layout);
});

test('all normal tools move between file, toolbar and view areas while movement mode controls retain their own area',()=>{
  let layout=defaultLayout();for(const key of ['mesh-close-hole','stl-to-step','workplane-set','drill'])for(const zone of ['header','view','toolbar']){layout=moveLayoutItem(layout,key,zone,0);assert.equal(layout.zones[zone][0],key);}
  assert.throws(()=>moveLayoutItem(layout,'mode-translate','header',0));assert.throws(()=>moveLayoutItem(layout,'mesh-tools','mode',0));
  assert.equal(new Set(Object.values(layout.zones).flat()).size,Object.values(defaultLayout().zones).flat().length);
});

test('visibility and section order persist in a named profile with validation and an accessible settings entry',()=>{
  const layout={...defaultLayout(),hiddenTools:['mesh-repair','mesh-close-hole'],objectsFirst:true,workspaceFirst:true},id='11111111-1111-4111-8111-111111111111';
  const saved=changeLayouts(emptyLayouts(),{action:'save',name:'Eigener Arbeitsplatz',layout},()=>id);
  assert.deepEqual(changeLayouts(saved,{action:'load',id},()=>id).current,layout);
  for(const hiddenTools of [['foreign'],['mesh-tools','mesh-tools'],['settings'],'mesh-tools'])assert.throws(()=>validateLayout({...layout,hiddenTools}));
  assert.throws(()=>validateLayout({...layout,objectsFirst:'yes'}));assert.throws(()=>validateLayout({...layout,workspaceFirst:1}));
});

test('button and panel grid positions survive named layouts and fit narrower displays', () => {
  const layout = {...defaultLayout(), grid: {undo:[14,12], inspector:[0,6], workspace:[14,3]}};
  const id = '11111111-1111-4111-8111-111111111111';
  const saved = changeLayouts(emptyLayouts(), {action:'save', name:'Raster', layout}, () => id);
  assert.deepEqual(changeLayouts(saved, {action:'load', id}, () => id).current.grid, layout.grid);
  assert.equal(moveLayoutItem(layout, 'undo', 'toolbar', 1).grid.undo, undefined);
  assert.deepEqual(validateLayout({...layout, grid:undefined}).grid, {});
  for (const grid of [{foreign:[0,0]}, {undo:[-1,0]}, {undo:[7.5,0]}, {undo:[256,3]}, {undo:[7]}])
    assert.throws(() => validateLayout({...layout, grid}), /Rasterposition/);
  const size = {width:44, height:40}, viewport = {usableWidth:600, usableHeight:400};
  const {cell, rect} = snapLayoutGrid(194, 207, size, viewport);
  assert.deepEqual(cell, [4,5]);
  assert.deepEqual(rect, {left:182, top:226, ...size});
  const resized = layoutGridPosition(layout.grid.undo, size, viewport);
  assert(resized.left + size.width <= viewport.usableWidth);
  assert(resized.top + size.height <= viewport.usableHeight);
});
