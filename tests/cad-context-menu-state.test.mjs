import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTEXT_MENU_KEY,CONTEXT_DEFAULTS,defaultContextSettings,validateContextSettings,createContextSettings,contextCommandAllowed,isContextCommand} from '../src/cad-context-menu-state.js';
const cad={name:'Part',kind:'cad',root:true,solid:true,locked:false,hidden:false};
test('Right-click menus have independent modes and preserve the initial program state without writes',()=>{
 const values=new Map(),writes=[],storage={getItem:k=>values.get(k),setItem:(k,v)=>{values.set(k,v);writes.push(k);}},store=createContextSettings(storage);
 assert.deepEqual(writes,[]);assert.deepEqual(store.get(),defaultContextSettings());const value=store.get();value.modes.normal=['measure','function:example:check'];store.set(value);assert.deepEqual(writes,[CONTEXT_MENU_KEY]);assert.deepEqual(createContextSettings(storage).get().modes.normal,value.modes.normal);assert.deepEqual(store.get().modes.solid,CONTEXT_DEFAULTS.solid);assert.deepEqual(store.get().modes.easy,CONTEXT_DEFAULTS.easy);
});
test('Menu entries are bounded data: no unknown actions, scripts, extra modes or duplicate entries',()=>{
 for(const value of [null,[],{...defaultContextSettings(),version:2},{...defaultContextSettings(),apiKey:'x'},{version:1,modes:{normal:[],easy:[]}},{version:1,modes:{normal:[],easy:[],solid:[],unknown:[]}}])assert.throws(()=>validateContextSettings(value));
 for(const keys of [['delete','delete'],['eval'],['function:../../other:run'],['function:a:<script>'],['function:a:b:c'],Array.from({length:33},(_,i)=>'function:p:f'+i)]){const value=defaultContextSettings();value.modes.easy=keys;assert.throws(()=>validateContextSettings(value));}
 assert.equal(isContextCommand('function:my-plugin:my_function'),true);assert.equal(isContextCommand('function:x:y;run'),false);
});
test('Failed writes preserve the previous independent menus, and caller arrays cannot mutate saved state',()=>{
 const store=createContextSettings({getItem:()=>null,setItem:()=>{throw Error('write denied');}}),before=store.get(),next=store.get();next.modes.normal.reverse();assert.throws(()=>store.set(next),/write denied/);assert.deepEqual(store.get(),before);next.modes.solid.length=0;assert.deepEqual(store.get().modes.solid,CONTEXT_DEFAULTS.solid);
});
test('Read-only selection and lock constraints prevent destructive context commands',()=>{
 assert(contextCommandAllowed('fit',[]));assert(!contextCommandAllowed('delete',[]));assert(!contextCommandAllowed('cut',[]));assert(contextCommandAllowed('cut',[cad]));assert(!contextCommandAllowed('cut',[{...cad,root:false}]));assert(!contextCommandAllowed('cut',[{...cad,solid:false}]));
 for(const state of [{...cad,locked:true},{...cad,hidden:true}]){for(const key of ['delete','round','cut','cad-shell','duplicate'])assert.equal(contextCommandAllowed(key,[state]),false);assert(contextCommandAllowed('properties',[state]));assert(contextCommandAllowed('copy',[state]));}
 assert(!contextCommandAllowed('group',[cad]));assert(contextCommandAllowed('group',[cad,{...cad,name:'Second'}]));assert(!contextCommandAllowed('cad-shell',[{...cad,kind:'mesh'}]));assert(contextCommandAllowed('mesh-repair',[{...cad,kind:'mesh'}]));
});
