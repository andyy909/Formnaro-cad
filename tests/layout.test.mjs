import test from 'node:test';
import assert from 'node:assert/strict';
import {LAYOUT_KEY,defaultLayout,validateLayout,loadLayout,moveLayoutItem} from '../src/layout-preferences.js';
import {createLayoutLibrary,LAYOUT_LIBRARY_KEY} from '../src/layout-library.js';
import {emptyLayouts,changeLayouts} from '../backend/layout-data.mjs';

test('Original layouts gain default open panels; collapse flags persist independently of tool placement',()=>{
 const old=defaultLayout();delete old.libraryCollapsed;delete old.inspectorCollapsed;const upgraded=validateLayout(old);assert.equal(upgraded.libraryCollapsed,false);assert.equal(upgraded.inspectorCollapsed,false);
 const collapsed={...upgraded,libraryCollapsed:true,inspectorCollapsed:true},stored=changeLayouts(emptyLayouts(),{action:'current',layout:collapsed},()=>{});assert.deepEqual(stored.current,collapsed);assert.deepEqual(stored.current.zones,old.zones);assert.throws(()=>validateLayout({...collapsed,libraryCollapsed:'true'}));
});

test('layout data always retains every tool exactly once in compatible rows',()=>{
  const original=defaultLayout();let l=moveLayoutItem(original,'export','toolbar',0);
  assert.equal(l.zones.toolbar[0],'export');assert.ok(!l.zones.header.includes('export'));
  l=moveLayoutItem(l,'undo','toolbar',l.zones.toolbar.length);assert.equal(l.zones.toolbar.at(-1),'undo');
  l=moveLayoutItem(l,'mode-rotate','mode',0);assert.equal(l.zones.mode[0],'mode-rotate');
  assert.deepEqual(original,defaultLayout());assert.deepEqual(validateLayout(l),l);
  assert.throws(()=>moveLayoutItem(l,'export','mode',0));assert.throws(()=>moveLayoutItem(l,'unknown','toolbar',0));
  assert.throws(()=>moveLayoutItem(l,'undo','toolbar',999));assert.throws(()=>moveLayoutItem(l,'undo','toolbar',1.5));
});
test('native portable storage migrates a previous layout once and never writes a browser cache',async()=>{
  const legacy=defaultLayout();legacy.librarySide='right';const reads=new Map([[LAYOUT_KEY,JSON.stringify(legacy)]]),writes=[],storage={getItem:k=>reads.get(k)||null,setItem:(...args)=>writes.push(args)};
  let result={data:emptyLayouts(),revision:'missing',exists:false,directory:'Portable/Layouts'},calls=[];
  const desktop={getLayouts:async()=>result,changeLayouts:async args=>{calls.push(args);result={...result,data:changeLayouts(result.data,args.command,()=>''),exists:true,revision:'saved'};return result;}};
  const lib=createLayoutLibrary({storage,desktop});await lib.reload();assert.deepEqual(lib.current(),legacy);assert.equal(calls[0].revision,'missing');assert.equal(calls.length,1);assert.deepEqual(writes,[]);
  await lib.reload();assert.equal(calls.length,1);assert.equal(lib.directory(),'Portable/Layouts');
});
test('failed native migration retains the old arrangement and revision for retry, with no silent local save',async()=>{
  const legacy=defaultLayout();legacy.viewSide='right';const revisions=[],storage={getItem:k=>k===LAYOUT_KEY?JSON.stringify(legacy):null,setItem:()=>assert.fail('Native mode must not save in the PC profile')};
  const desktop={getLayouts:async()=>({data:emptyLayouts(),revision:'missing',exists:false,directory:'Portable/Layouts'}),changeLayouts:async args=>{revisions.push(args.revision);throw Error('read-only');}};
  const lib=createLayoutLibrary({storage,desktop});await assert.rejects(lib.reload(),/read-only/);assert.deepEqual(lib.current(),legacy);await assert.rejects(lib.change({action:'current',layout:defaultLayout()}),/read-only/);assert.deepEqual(revisions,['missing','missing']);assert.deepEqual(lib.current(),legacy);
});
test('browser collection is authoritative over the legacy cache and a failed legacy cache write does not undo a save',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(k===LAYOUT_KEY)throw Error('Cache unavailable');values.set(k,v);}};
  const lib=createLayoutLibrary({storage});await lib.reload();const right=defaultLayout();right.librarySide='right';await lib.change({action:'save',name:'Web layout',layout:right});assert.equal(lib.data().profiles.length,1);assert.ok(values.has(LAYOUT_LIBRARY_KEY));values.set(LAYOUT_KEY,'{broken');await lib.reload();assert.deepEqual(lib.current(),right);
});
test('corrupt, duplicated, missing or foreign layout data falls back without affecting other storage',()=>{
  for(const change of [l=>l.zones.header.push('undo'),l=>l.zones.toolbar.pop(),l=>l.zones.view.reverse().push('new'),l=>l.librarySide='centre',l=>l.version=9,l=>l.unknown='x']){
    const l=defaultLayout();change(l);assert.throws(()=>validateLayout(l));
    const reads=[];assert.deepEqual(loadLayout({getItem:key=>{reads.push(key);return JSON.stringify(l);}}),defaultLayout());assert.deepEqual(reads,[LAYOUT_KEY]);
  }
  assert.deepEqual(loadLayout({getItem:()=>'{broken'}),defaultLayout());assert.deepEqual(loadLayout({getItem:()=>null}),defaultLayout());
  const l=defaultLayout();l.librarySide='right';l.viewSide='right';l.modePosition='bottom';assert.deepEqual(loadLayout({getItem:()=>JSON.stringify(l)}),l);
});
