import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createLibrary} from '../library-store.cjs';
import {emptyProject,createNode,encodeProject,decodeProject} from '../src/model.js';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('library persists independent source files and lists metadata without opening model',async()=>{
  const root=path.resolve('work/library-unit-'+crypto.randomUUID());fs.mkdirSync(root,{recursive:true});const library=createLibrary({root,checkProject:decodeProject,checkImage:()=>{}}),node=createNode('tube');node.notes='Wand 2 mm';node.folder='Rohre';const text=encodeProject({...emptyProject(),nodes:[node]});
  const {id}=await library.save({name:'Mein Rohr',folder:'Rohre',favorite:true,text,image});assert.equal(library.list().entries.length,1);assert.equal((await library.load(id)).text,text);assert.equal(library.thumbnail(id).image,image);
  library.update({id,name:'Rohr M4',folder:'Werkstatt',favorite:false});assert.equal(library.list().entries[0].name,'Rohr M4');assert.equal((await library.load(id)).text,text);
  fs.writeFileSync(path.join(root,'Bibliothek-CAD',id,'model.fmcad'),'bad');assert.equal(library.list().entries.length,1);await assert.rejects(library.load(id));assert.equal(library.thumbnail(id).image,image);
  await assert.rejects(library.save({name:'Ungültig',text:'bad',image}));await assert.rejects(library.save({name:'Ungültig',text,image:'data:image/png;base64,AAAA'}));assert.throws(()=>library.thumbnail('../autosave.fmcad'));assert.throws(()=>library.update({id,name:'',folder:'',favorite:false}));const bomb=Buffer.from(image.split(',')[1],'base64');bomb.writeUInt32BE(50000,16);await assert.rejects(library.save({name:'Zu groß',text,image:'data:image/png;base64,'+bomb.toString('base64')}));assert.equal(library.list().entries.length,1);
});
