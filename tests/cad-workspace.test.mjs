import test from 'node:test';
import assert from 'node:assert/strict';
import {cadBedGrid,workplaneOnGround} from '../src/cad-bed-grid.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {CAD_QUALITY_DEFAULTS} from '../src/cad-quality.js';
import {defaultLayout,validateLayout} from '../src/layout-preferences.js';
test('Rectangular grids remain bounded, use exact millimetres and contain no duplicate segments',()=>{
  for(const [w,d]of [[200,200],[800,350],[333,777],[20,2000]]){const groups=cadBedGrid(w,d),seen=new Set();for(const [kind,values]of Object.entries(groups))for(let i=0;i<values.length;i+=6){const a=values.slice(i,i+3),b=values.slice(i+3,i+6);for(const p of [a,b]){assert.ok(Math.abs(p[0])<=w/2);assert.ok(Math.abs(p[1])<=d/2);assert.equal(p[2],0);}const key=[a.join(','),b.join(',')].sort().join('|');assert.ok(!seen.has(key));seen.add(key);if(kind!=='border')assert.ok((a[0]===b[0]?a[0]:a[1])%10===0);}}
  assert.equal(workplaneOnGround({origin:[0,0,0],orientation:[0,0,0,1]}),true);assert.equal(workplaneOnGround({origin:[20,20,0],orientation:[0,0,1,0]}),true);assert.equal(workplaneOnGround({origin:[0,0,1],orientation:[0,0,0,1]}),false);assert.equal(workplaneOnGround({origin:[0,0,0],orientation:[.5,0,0,Math.sqrt(.75)]}),false);
});
test('Format 5 retains validated workspace; plain existing files still open',()=>{
  const project=createCadProject({bed:[800,350]}),workspace={version:1,view:{projection:'orthographic',position:[123,-200,400],target:[2,3,4],up:[0,0,1],zoom:2.5},selection:[],mode:'rotate',snap:.25,quality:structuredClone(CAD_QUALITY_DEFAULTS),layout:defaultLayout()};
  const saved=parseCadProject(serializeCadProject({...project,workspace}));assert.deepEqual(saved.workspace,workspace);assert.deepEqual(parseCadProject(serializeCadProject(project)),project);assert.ok(!serializeCadProject(saved).includes('workerHandles'));
  for(const change of [v=>v.view.zoom=Infinity,v=>v.view.up=[0,0,0],v=>v.view.position=[...v.view.target],v=>v.selection=[{rootId:'a',path:['b'],code:'bad'}],v=>v.extra=true]){const broken=structuredClone(workspace);change(broken);assert.throws(()=>createCadProject({workspace:broken}));}
});
test('Existing custom layout gains Projects once beside its moved Save control',()=>{const old=defaultLayout();old.zones.header=old.zones.header.filter(k=>!['projects','save'].includes(k));old.zones.toolbar.unshift('save');const migrated=validateLayout(old);assert.deepEqual(migrated.zones.toolbar.slice(0,2),['save','projects']);assert.deepEqual(validateLayout(migrated),migrated);});
