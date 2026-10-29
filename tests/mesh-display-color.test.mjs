import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,BufferGeometry,MeshStandardMaterial} from 'three';
import {applyMeshDisplayStyle,MESH_DISPLAY_STYLES} from '../src/mesh-display-style.js';

test('STL object color remains visible after each display-style redraw and material reuse',()=>{
 for(const style of Object.keys(MESH_DISPLAY_STYLES)){
  const mesh=new Mesh(new BufferGeometry(),new MeshStandardMaterial({color:'#8294aa'}));
  mesh.userData={record:{kind:'mesh'},objectColor:'#8294aa'};
  applyMeshDisplayStyle(mesh,style,true);
  for(const color of ['#1025d5','#ef3344','#22bb66']){
   // This is the renderer's setDisplay material-reuse seam, followed by draw.
   mesh.userData.record={kind:'mesh'};mesh.userData.objectColor=color;mesh.material.color.set(color);mesh.userData.meshStyleKey=null;
   applyMeshDisplayStyle(mesh,style,true);
   assert.equal('#'+mesh.material.color.getHexString(),color,`${style} hides the selected STL color`);
   applyMeshDisplayStyle(mesh,style,true);
   assert.equal('#'+mesh.material.color.getHexString(),color,'A subsequent frame hides the selected color');
  }
  mesh.geometry.dispose();mesh.material.dispose();
 }
});

test('source face colors, cutters and temporary previews retain their own appearance',()=>{
 for(const mode of ['vertexColors','cutout','preview']){
  const material=new MeshStandardMaterial({color:mode==='vertexColors'?'#ffffff':'#efa23b',vertexColors:mode==='vertexColors',transparent:true,opacity:.28}),mesh=new Mesh(new BufferGeometry(),material);
  mesh.userData={record:{color:'#1025d5'},cutout:mode==='cutout'};const color=material.color.getHexString();
  applyMeshDisplayStyle(mesh,'sand',mode!=='preview');assert.equal(material.color.getHexString(),color);assert.equal(material.opacity,.28);assert.equal(material.transparent,true);assert.equal(material.vertexColors,mode==='vertexColors');
  mesh.geometry.dispose();material.dispose();
 }
});
