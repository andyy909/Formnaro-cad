import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlugin as originalParser} from '../src/plugins.js';
import {CAD_PLUGIN,parsePlugin,label,loadPlugins} from '../src/cad-plugin-manifest.js';
import {CAD_SHAPES} from '../src/cad-shapes.js';
const manifest=nodes=>({format:'OfflineCAD-Plugin',version:1,id:'test',name:{de:'Paket',en:'Pack'},shapes:[{id:'shape',name:'Shape',nodes}]});
test('Pure CAD package parser retains original JSON validation, translation and storage contract',()=>{
  assert.equal(CAD_PLUGIN.storageKey,'offlinecad-plugins-v1');assert.equal(CAD_PLUGIN.favoritesKey,'offlinecad-favorites-v1');assert.equal(label({en:'Pack'},'de'),'Pack');
  for(const shape of CAD_SHAPES.filter(shape=>shape.type!=='text')){const value=manifest([{type:shape.type}]);assert.deepEqual(parsePlugin(value),originalParser(value));}
  const cases=[{type:'text'},{type:'box',size:[0,1,2]},{type:'box',pos:[Infinity,0,0]},{type:'box',rot:[0,0,'3']},{type:'box',mirror:[0,1,1]},{type:'box',color:'#xyzxyz'},{type:'box',solid:1},{type:'polygon',params:{sides:2}},{type:'gear',params:{mesh:[]}}, {type:'box',script:'run'}];
  for(const spec of cases){assert.throws(()=>parsePlugin(manifest([spec])));assert.throws(()=>originalParser(manifest([spec])));}
  const value=manifest([{type:'box',segments:128,params:{edgeStyle:'round',edgeSize:2,edgeSteps:24}}]);assert.deepEqual(parsePlugin(value),originalParser(value));assert.throws(()=>parsePlugin({...value,constructor:'invalid'}));
  const saved=[{manifest:value,enabled:true},{manifest:value,enabled:false},{manifest:manifest([{type:'text'}]),enabled:true},{manifest:{...value,id:'second'},enabled:false}],storage={getItem:key=>{assert.equal(key,CAD_PLUGIN.storageKey);return JSON.stringify(saved);}},loaded=loadPlugins(storage);
  assert.equal(loaded.length,2);assert.equal(loaded[1].enabled,false);loaded[0].manifest.name='changed';assert.deepEqual(value.name,{de:'Paket',en:'Pack'});
});
