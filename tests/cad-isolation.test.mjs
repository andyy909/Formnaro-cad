import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadIsolation} from '../src/cad-isolation.js';
const fixture=()=>({nodes:[{id:'a',layerId:'l',children:[{id:'s'}],locked:true},{id:'b',layerId:'l'},{id:'h',hidden:true,layerId:'l'},{id:'f',folderId:'f',layerId:'l'}],layers:[{id:'l'}],folders:[{id:'f',hidden:true}]});
test('View filter preserves bytes and locks, maps sources to roots and restores permanent visibility',()=>{
 const p=fixture(),bytes=JSON.stringify(p),i=createCadIsolation();assert.deepEqual(i.start(p,[{rootId:'a',path:['s']}]),['a']);assert.equal(i.visible(p.nodes[1],p),false);assert.equal(i.visible(p.nodes[0],p),true);assert.equal(i.visible(p.nodes[2],p),false);assert.equal(JSON.stringify(p),bytes);i.end();assert.equal(i.visible(p.nodes[1],p),true);assert.equal(i.visible(p.nodes[3],p),false);assert.throws(()=>i.start(p,[{rootId:'h',path:[]}]),/sichtbar/);
});
test('Grouping and dissolution follow original sources; selected new roots join and removing last root ends isolation',()=>{
 const p=fixture(),i=createCadIsolation();i.start(p,[{rootId:'a'}]);const a=p.nodes.shift();p.nodes.push({id:'g',children:[a],layerId:'l'});assert.deepEqual(i.sync(p),['g']);p.nodes.pop();p.nodes.push(a);assert.deepEqual(i.sync(p),['a']);i.include(p,[{rootId:'b'}]);assert.deepEqual(i.state(),['a','b']);p.nodes=p.nodes.filter(n=>!['a','b'].includes(n.id));assert.equal(i.sync(p),null);
});
