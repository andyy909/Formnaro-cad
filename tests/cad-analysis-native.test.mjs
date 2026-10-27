import test from 'node:test';
import assert from 'node:assert/strict';
import OCModule from 'replicad-opencascadejs';
import {createCadService} from '../src/cad-service.js';
import {createCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
import {cadCollisionNative,cadColorRecordsNative} from '../src/cad-analysis-native.js';
import {brepHasNoTriangulation} from '../src/cad-native-kernel.js';
const oc=await OCModule({print:()=>{},printErr:()=>{}}),close=(a,b,error=1e-6)=>assert.ok(Math.abs(a-b)<error,`${a} versus ${b}`);
const moved=x=>{const m=cadIdentity();m[12]=x;return m;};

test('Collisions use exact CAD intersection volume and ignore display tessellation',()=>{
  const service=createCadService({oc});try{
    const a=service.nativeNode({type:'box',size:[10,10,10]},{id:'a'}),b=service.nativeNode({type:'box',size:[10,10,10]},{id:'b',transform:moved(5)});
    const first=cadCollisionNative(oc,a,b);close(first.volume,500);assert.equal(first.intersects,true);service.display(createCadProject({nodes:[a,b]}),{deflection:1,angleDegrees:40});assert.deepEqual(cadCollisionNative(oc,a,b),first);
    b.transform=moved(10);assert.deepEqual(cadCollisionNative(oc,a,b),{intersects:false,volume:0,bounds:null});b.transform=moved(20);assert.equal(cadCollisionNative(oc,a,b).intersects,false);
    assert.throws(()=>cadCollisionNative(oc,a,{kind:'referenceMesh'}),/Netzreferenzen/);
  }finally{service.dispose();}
});

test('CAD color partition retains bore cavities and assigns overlapping material once in source order',async()=>{
  const service=createCadService({oc});try{
    const a=service.nativeNode({type:'box',size:[10,10,10]},{id:'a',color:'#ff0000'}),b=service.nativeNode({type:'box',size:[10,10,10]},{id:'b',color:'#0000ff',transform:moved(5)}),hole=service.nativeNode({type:'cylinder',size:[2,2,20]},{id:'hole',solid:false});
    const group={id:'group',kind:'cad',source:'group',name:'Mehrfarbgruppe',solid:true,multicolor:true,transform:cadIdentity(),operation:'union',children:[a,b,hole],brep:a.brep,stats:a.stats},project=await service.rebuild(createCadProject({nodes:[group]})),records=cadColorRecordsNative(oc,project.nodes[0]);
    assert.deepEqual(records.map(part=>part.color),['#ff0000','#0000ff']);close(records[0].volume,1000-10*Math.PI);close(records[1].volume,500);close(records.reduce((sum,p)=>sum+p.volume,0),project.nodes[0].stats.volume);assert.ok(records.every(part=>brepHasNoTriangulation(part.brep)));
    const reversed=structuredClone(project);reversed.nodes[0].children=[b,a,hole];const rebuilt=await service.rebuild(reversed),changed=cadColorRecordsNative(oc,rebuilt.nodes[0]);assert.deepEqual(changed.map(p=>p.color),['#0000ff','#ff0000']);close(changed.reduce((sum,p)=>sum+p.volume,0),project.nodes[0].stats.volume);
  }finally{service.dispose();}
});
