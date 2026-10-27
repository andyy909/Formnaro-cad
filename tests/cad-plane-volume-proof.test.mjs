// Each phase owns a fresh actual native WASM worker. The reader never receives
// a source shape, affine-volume registry, caller stats or display tessellation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';

function phase(data){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:data});
    const timer=setTimeout(()=>{void worker.terminate();reject(Error('Fresh native CAD volume proof exceeded 60 seconds'));},60000);
    worker.on('message',value=>{if(value.progress){console.log('Native proof: '+value.progress);return;}clearTimeout(timer);void worker.terminate();if(value.error)reject(Error(value.error));else resolve(value);});
    worker.once('error',error=>{clearTimeout(timer);reject(error);});
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('Native proof worker exited without evidence: '+code));});
  });
}

if(isMainThread){
  test('Unknown generally affine gear and thread integrate directly after BRep and STEP reads in a fresh native worker',async(t)=>{
    const fixtures=await phase({kind:'generate'}),evidence=await phase({kind:'read',fixtures});
    assert.equal(evidence.length,fixtures.length);assert.equal(evidence.length,4);
    for(const record of evidence){assert.equal(record.solids,1);assert.equal(record.noTriangles,true);assert.ok(record.brepMilliseconds<30000);assert.ok(record.stepMilliseconds<30000);t.diagnostic(JSON.stringify(record));}
  });
}else{
  try{
    const [{loadCadKernel},native,{buildCadGear},{buildCadThread},{exportCadStep,importCadStep},{createCadFinishNative,listCadEdgesNative}]=await Promise.all([
      import('../src/cad-kernel-loader.js'),import('../src/cad-native-kernel.js'),import('../src/cad-recipes.js'),import('../src/cad-screw-surfaces.js'),import('../src/cad-step-io.js'),import('../src/cad-finish-native.js')
    ]),oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
    if(workerData.kind==='generate'){
      const matrix=[1.3,0,0,0,.3,.8,0,0,.1,.2,1.1,0,0,0,0,1],mirror=[...matrix];mirror[0]=-1.3;
      const definitions=[
        {name:'Sheared helical gear',matrix,build:()=>buildCadGear(oc,{teeth:8,helixAngle:25,thickness:2,bore:2,hubDiameter:5,hubHeight:1,keyWidth:1,keyDepth:.5})},
        {name:'Mirrored gear',matrix:mirror,build:()=>buildCadGear(oc,{teeth:8,module:1,thickness:2,bore:0})},
        {name:'Sheared two-start left thread',matrix,build:()=>buildCadThread(oc,{diameter:8,pitch:1.25,length:1.25,leadIn:.2,hand:'left',starts:2,phase:37,bore:2,head:'hex',headHeight:1})}
      ],fixtures=[];
      for(const definition of definitions){
        parentPort.postMessage({progress:'build '+definition.name});
        const source=definition.build(),props=new oc.GProp_GProps();let world;
        try{
          // Independently retain the point-flux GK reference on the original
          // well-conditioned source, before testing the plane-flux integral.
          parentPort.postMessage({progress:'original point-GK '+definition.name});
          const error=oc.BRepGProp.VolumePropertiesGK(source,props,1e-10,true,true,false,false,false);
          assert.ok(Number.isFinite(error)&&error>=0);const expected=native.cadAffineVolume(props.Mass(),definition.matrix);
          // Actual production native transform includes bounded pcurve repair.
          // Its source proof exists only in this generator worker.
          world=native.transformCad(oc,source,definition.matrix);
          parentPort.postMessage({progress:'unknown affine plane-GK/STEP '+definition.name});
          fixtures.push({name:definition.name,expected,bounds:native.cadBounds(oc,world),brep:native.writeCadBrep(oc,world),step:exportCadStep(oc,[{shape:world,name:definition.name,color:'#336699'}])});
        }finally{world?.delete();props.delete();source.delete();}
      }
      parentPort.postMessage({progress:'native chamfer on affine gear'});
      const source=buildCadGear(oc,{teeth:8,module:1,thickness:2,bore:0}),world=native.transformCad(oc,source,matrix),id='isolated-native-finish-gear',edges=listCadEdgesNative(oc,world,{origin:{rootId:id,path:[]}}).filter(record=>Math.abs(record.anchor.samples[4][2]-record.anchor.samples[0][2])>2).sort((a,b)=>b.anchor.point[0]-a.anchor.point[0]);let finished;
      try{
        assert.ok(edges.length);finished=createCadFinishNative({oc})(world,{steps:[{id:'isolated-finish-step',kind:'chamfer',amount:.04,edges:[edges[0].reference]}]},{id,source:'group'});
        // Independent projection direction, at the same native GK epsilon.
        const props=new oc.GProp_GProps(),point=new oc.gp_Pnt(0,0,0),direction=new oc.gp_Dir(0,0,1),plane=new oc.gp_Pln(point,direction);let expected;
        try{const error=oc.BRepGProp.VolumePropertiesGK(finished,props,plane,1e-10,true,true,false,false,false);assert.ok(Number.isFinite(error)&&error>=0);expected=props.Mass();assert.ok(expected<native.cadVolume(oc,world)-1e-5);}finally{plane.delete();direction.delete();point.delete();props.delete();}
        fixtures.push({name:'Chamfered affine gear',expected,bounds:native.cadBounds(oc,finished),brep:native.writeCadBrep(oc,finished),step:exportCadStep(oc,[{shape:finished,name:'Chamfered affine gear',color:'#336699'}])});
      }finally{finished?.delete();world.delete();source.delete();}
      parentPort.postMessage(fixtures);
    }else if(workerData.kind==='read'){
      const evidence=[];
      for(const fixture of workerData.fixtures){
        parentPort.postMessage({progress:'fresh BRep/STEP reader '+fixture.name});
        let start=performance.now();const shape=native.readCadBrep(oc,fixture.brep);let stats;
        try{stats=native.validateCadSolid(oc,shape);}finally{shape.delete();}
        const brepMilliseconds=performance.now()-start;
        assert.ok(Math.abs(stats.volume-fixture.expected)<1e-4,fixture.name+' BRep native mass differs from original point-GK times determinant');
        for(const key of ['min','max'])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(stats.bounds[key][axis]-fixture.bounds[key][axis])<1e-6,fixture.name+' BRep bounds changed');
        start=performance.now();const restored=importCadStep(oc,fixture.step),stepMilliseconds=performance.now()-start;
        assert.ok(Math.abs(restored.stats.volume-fixture.expected)<1e-4,fixture.name+' STEP native mass differs from original point-GK times determinant');
        for(const key of ['min','max'])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(restored.stats.bounds[key][axis]-fixture.bounds[key][axis])<1e-5,fixture.name+' STEP bounds changed');
        assert.equal(restored.stats.solids,1);
        evidence.push({name:fixture.name,solids:stats.solids,noTriangles:native.brepHasNoTriangulation(fixture.brep)&&native.brepHasNoTriangulation(restored.brep.data),brepMilliseconds,stepMilliseconds,expected:fixture.expected,brepVolume:stats.volume,stepVolume:restored.stats.volume});
      }
      parentPort.postMessage(evidence);
    }else throw Error('Unknown CAD proof phase');
  }catch(error){parentPort.postMessage({error:error.stack||error.message});}
}
