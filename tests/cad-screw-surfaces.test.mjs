import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {screwSurfaceDefinition,screwSurfacePoint,buildCadScrewSurface,buildCadScrewPiece} from '../src/cad-screw-surfaces.js';
import {cadRecipeVolume} from '../src/cad-recipes.js';
import {validateCadSolid,writeCadBrep,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
const profile=[[3,-.3],[4,0],[3,.3]],TAU=2*Math.PI;
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`);
function value(surface,u,theta){const p=surface.Value(u,theta);try{return [p.X(),p.Y(),p.Z()];}finally{p.delete();}}
function vertices(shape){
  const ex=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_VERTEX),result=[];
  try{while(ex.More()){const raw=ex.Current(),vertex=oc.TopoDS.Vertex(raw),p=oc.BRep_Tool.Pnt(vertex);try{const xyz=[p.X(),p.Y(),p.Z()];if(!result.some(q=>Math.hypot(...q.map((v,k)=>v-xyz[k]))<1e-6))result.push(xyz);}finally{p.delete();vertex.delete();raw.delete();}ex.Next();}return result;}finally{ex.delete();}
}
function section(shape){const point=new oc.gp_Pnt(0,0,0),normal=new oc.gp_Dir(1,0,0),plane=new oc.gp_Pln(point,normal),cut=new oc.BRepAlgoAPI_Section(shape,plane,true);try{assert.equal(cut.HasErrors(),false);return cut.Shape();}finally{cut.delete();plane.delete();normal.delete();point.delete();}}
function stepRoundtrip(shape){
  const path='/cad-screw-proof.step',writer=new oc.STEPControl_Writer(),progress=new oc.Message_ProgressRange(),reader=new oc.STEPControl_Reader();
  try{
    oc.Interface_Static.SetCVal('write.step.unit','MM');assert.equal(writer.Transfer(shape,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress),oc.IFSelect_ReturnStatus.IFSelect_RetDone);assert.equal(writer.Write(path),oc.IFSelect_ReturnStatus.IFSelect_RetDone);
    const text=new TextDecoder().decode(oc.FS.readFile(path));assert.match(text,/B_SPLINE_SURFACE_WITH_KNOTS/);
    assert.equal(reader.ReadFile(path),oc.IFSelect_ReturnStatus.IFSelect_RetDone);assert.ok(reader.TransferRoots());return reader.OneShape();
  }finally{reader.delete();progress.delete();writer.delete();try{oc.FS.unlink(path);}catch{}}
}
test('Actual native B-spline tensor surfaces satisfy the analytic screw-error bound with exact axial lead',()=>{
  const segment=[[3,-.3],[4,0]];
  for(const hand of ['right','left'])for(const starts of [1,2,4]){
    const options={pitch:1.25,starts,hand,thetaStart:.7,thetaEnd:TAU*2+.7},definition=screwSurfaceDefinition(segment,options),surface=buildCadScrewSurface(oc,segment,options);
    try{
      assert.equal(surface.UDegree(),1);assert.equal(surface.VDegree(),3);assert.ok(definition.interpolationBound<=definition.tolerance/2);
      let maximum=0;
      for(const u of [0,.25,.5,.75,1])for(let i=0;i<=180;i++){
        const theta=options.thetaStart+(options.thetaEnd-options.thetaStart)*i/180,expected=screwSurfacePoint(segment,u,theta,options),actual=value(surface,u,theta);
        maximum=Math.max(maximum,Math.hypot(...actual.map((v,k)=>v-expected[k])));near(actual[2],expected[2],1e-12);
      }
      assert.ok(maximum<=definition.interpolationBound*(1+1e-7));
      const first=value(surface,.5,1),next=value(surface,.5,1+TAU);near(next[2]-first[2],(hand==='right'?1:-1)*1.25*starts,1e-12);
      const lower=value(surface,0,Math.PI/2),upper=value(surface,1,Math.PI/2),angle=Math.atan2(upper[2]-lower[2],Math.hypot(upper[0],upper[1])-Math.hypot(lower[0],lower[1]));near(angle,Math.atan2(.3,1),1e-5);
    }finally{surface.delete();}
  }
});
test('Closed triangular screw-profile bodies sew exact shared seams, remain valid, and retain section orientation through STEP',()=>{
  for(const hand of ['right','left'])for(const starts of [1,3]){
    const options={pitch:2,starts,hand},shape=buildCadScrewPiece(oc,profile,options);
    try{
      assert.equal(validateCadSolid(oc,shape).solids,1);near(cadRecipeVolume(oc,shape),TAU,1e-4);assert.ok(brepHasNoTriangulation(writeCadBrep(oc,shape)));
      const imported=stepRoundtrip(shape);
      try{
        // Compare the same native point-flux integral on source and STEP read.
        // A different divergence-equivalent projection has an independent GK
        // error estimate; the fresh-worker plane proof covers that path.
        near(cadRecipeVolume(oc,imported),cadRecipeVolume(oc,shape),1e-8);validateCadSolid(oc,imported);
        const cross=section(imported);try{
          const actual=vertices(cross),lead=(hand==='right'?1:-1)*2*starts,expected=[...profile.map(([r,z])=>[0,r,z+lead/4]),...profile.map(([r,z])=>[0,-r,z+3*lead/4])];
          assert.equal(actual.length,6);
          for(const target of expected)assert.ok(actual.some(p=>Math.hypot(...p.map((v,k)=>v-target[k]))<1e-4),`Section misses ${target}`);
        }finally{cross.delete();}
      }finally{imported.delete();}
    }finally{shape.delete();}
  }
});
test('Screw surface construction fails explicitly for precision limits, bad profiles and overlapping turns',()=>{
  assert.throws(()=>screwSurfaceDefinition([[3,0],[4,.5]],{constructionBudget:1e-9}),/zu klein/);
  assert.throws(()=>screwSurfaceDefinition([[0,0],[4,.5]]),/positiven Radius/);
  assert.throws(()=>screwSurfaceDefinition([[3,0],[3,0]]),/degeneriert/);
  assert.throws(()=>buildCadScrewPiece(oc,[[3,-2],[4,0],[3,2]],{thetaEnd:TAU*2,pitch:2}),/überlappen/);
});
