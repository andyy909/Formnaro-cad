import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {buildCadThread,cadThreadDefinition,buildCadTwistedSurface,twistedSurfaceDefinition} from '../src/cad-screw-surfaces.js';
import {buildCadRecipe,buildCadGear,gearContour,cadRecipeVolume,cadRecipeBounds} from '../src/cad-recipes.js';
import {cadContourSignedArea} from '../src/cad-original-contours.js';
import {validateCadSolid,writeCadBrep,readCadBrep,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
import {exportCadStep,importCadStep} from '../src/cad-step-io.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),TAU=2*Math.PI;
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b} (allowance ${e})`);
function check(shape){assert.equal(validateCadSolid(oc,shape).solids,1);assert.ok(brepHasNoTriangulation(writeCadBrep(oc,shape)));}
function meridianVertices(shape){
  const point=new oc.gp_Pnt(0,0,0),normal=new oc.gp_Dir(1,0,0),plane=new oc.gp_Pln(point,normal),section=new oc.BRepAlgoAPI_Section(shape,plane,true),cross=section.Shape(),explorer=new oc.TopExp_Explorer(cross,oc.TopAbs_ShapeEnum.TopAbs_VERTEX),result=[];
  try{assert.equal(section.HasErrors(),false);while(explorer.More()){const raw=explorer.Current(),vertex=oc.TopoDS.Vertex(raw),p=oc.BRep_Tool.Pnt(vertex);try{const xyz=[p.X(),p.Y(),p.Z()];if(!result.some(q=>Math.hypot(...q.map((v,k)=>v-xyz[k]))<1e-6))result.push(xyz);}finally{p.delete();vertex.delete();raw.delete();}explorer.Next();}return result;}finally{explorer.delete();cross.delete();section.delete();plane.delete();normal.delete();point.delete();}
}
function expectedThreadVolume(d){return Math.PI*d.p.length/d.p.pitch*(2*d.crest*d.major**2+2*d.flank*(d.minor**2+d.minor*d.major+d.major**2)/3+2*d.gap*d.minor**2);}
function checkThreadSection(shape,d){
  const vertices=meridianVertices(shape),lead=(d.p.hand==='right'?1:-1)*d.d.lead;
  for(const [theta,sign] of [[Math.PI/2,1],[3*Math.PI/2,-1]])for(let n=-12;n<=12;n++)for(const [radius,width] of [[d.major,d.crest],[d.minor,d.crest+d.flank]])for(const side of [-1,1]){
    const z=d.phaseOffset+n*d.p.pitch+lead*theta/TAU+side*width;if(z<=-d.p.length/2+1e-3||z>=d.p.length/2-1e-3)continue;
    const target=[0,sign*radius,z];assert.ok(vertices.some(p=>Math.hypot(...p.map((v,k)=>v-target[k]))<=2e-4),`Missing analytic flank/crest endpoint ${target}`);
  }
}
test('Native thread parameter matrix preserves exact meridian profile, phase, pitch, direction and multiple starts',()=>{
  for(const params of [
    {profile:'metric',hand:'right',starts:1},
    {profile:'metric',hand:'left',starts:2},
    {profile:'trapezoid',hand:'right',starts:3},
    {profile:'custom',hand:'left',starts:4,flankAngle:40,depth:.4,crest:.2},
  ]){
    const p={...params,length:1.25,phase:37,leadIn:0,clearance:.08},d=cadThreadDefinition(p),shape=buildCadThread(oc,p);
    try{check(shape);near(cadRecipeBounds(oc,shape).size[2],p.length,2e-6);near(cadRecipeVolume(oc,shape),expectedThreadVolume(d),Math.PI*p.length*(2*d.major*d.tolerance+d.tolerance**2));checkThreadSection(shape,d);}finally{shape.delete();}
  }
});
test('CAD heads, axial bores, exterior introduction chamfers, nuts and interior clearance remain native and dimensioned',()=>{
  for(const head of ['hex','round']){
    const p={length:1.25,leadIn:0,head,headHeight:1.5,bore:2},d=cadThreadDefinition(p),shape=buildCadThread(oc,p),headArea=head==='hex'?3*Math.sqrt(3)/2*(d.p.headDiameter/2)**2:Math.PI*(d.p.headDiameter/2)**2;
    try{check(shape);near(cadRecipeBounds(oc,shape).size[2],2.75,2e-6);near(cadRecipeVolume(oc,shape),expectedThreadVolume(d)+headArea*1.5-Math.PI*(1.25+1.5),.004);}finally{shape.delete();}
  }
  const unchamfered=buildCadThread(oc,{length:1.25,leadIn:0}),chamfered=buildCadThread(oc,{length:1.25,leadIn:.3});
  try{check(chamfered);assert.ok(cadRecipeVolume(oc,chamfered)<cadRecipeVolume(oc,unchamfered));const points=meridianVertices(chamfered);for(const z of [-.625,.625])for(const sign of [-1,1])assert.ok(points.filter(p=>Math.abs(p[2]-z)<1e-5&&Math.sign(p[1])===sign).every(p=>Math.abs(p[1])<=3.7001));}finally{unchamfered.delete();chamfered.delete();}
  for(const outerShape of ['hex','round']){
    const p={kind:'nut',outerShape,length:1.25,leadIn:0,clearance:.15},d=cadThreadDefinition(p),nut=buildCadThread(oc,p),hole=buildCadThread(oc,{...p,kind:'cutter'}),area=outerShape==='hex'?3*Math.sqrt(3)/2*7.5**2:Math.PI*7.5**2;
    try{check(nut);check(hole);near(cadRecipeVolume(oc,nut)+cadRecipeVolume(oc,hole),area*1.25,1e-5);checkThreadSection(hole,d);near(d.major,4.15);near(cadRecipeBounds(oc,nut).size[2],1.25,2e-6);}finally{nut.delete();hole.delete();}
  }
  const nut=buildCadRecipe(oc,{type:'nut',size:[15,15,1.25],params:{length:1.25,leadIn:.3}});try{check(nut);}finally{nut.delete();}
});
test('Native rational circle and original Bezier tensor rotation surfaces retain full analytic error and exact height',()=>{
  const segment={kind:'arc',start:[5,0],through:[5*Math.cos(.4),5*Math.sin(.4)],end:[5*Math.cos(.8),5*Math.sin(.8)]};
  for(const twist of [-.5,.5]){
    const options={height:4,twist,constructionBudget:5e-5},d=twistedSurfaceDefinition(segment,options),surface=buildCadTwistedSurface(oc,segment,options);
    try{assert.equal(surface.UDegree(),2);near(surface.Weight(2,1),Math.cos(.4),1e-12);for(const u of [0,.25,.5,.75,1])for(let i=0;i<=40;i++){
      const v=i/40,b=[(1-u)**2,2*u*(1-u),u*u],den=b.reduce((sum,x,j)=>sum+x*d.profile.weights[j],0),profile=[0,1].map(k=>b.reduce((sum,x,j)=>sum+x*d.profile.weights[j]*d.profile.points[j][k],0)/den),expected=[profile[0]*Math.cos(twist*v)-profile[1]*Math.sin(twist*v),profile[0]*Math.sin(twist*v)+profile[1]*Math.cos(twist*v),4*(v-.5)],point=surface.Value(u,v);
      try{near(point.Z(),expected[2],1e-12);assert.ok(Math.hypot(point.X()-expected[0],point.Y()-expected[1])<=d.interpolationBound*(1+1e-7));}finally{point.delete();}
    }}finally{surface.delete();}
  }
});
test('Both helical gear hands preserve the normal-module profile, volume, end rotations, bore, hub and key',()=>{
  for(const helixAngle of [-25,25]){
    const params={teeth:8,helixAngle,module:1.5,thickness:3,bore:0,backlash:.1},outline=gearContour(params,{constructionBudget:5e-5}),shape=buildCadGear(oc,params),area=outline.segments.reduce((sum,segment)=>sum+(segment.kind==='arc'?.5*Math.hypot(...segment.start)**2*((Math.atan2(segment.end[1],segment.end[0])-Math.atan2(segment.start[1],segment.start[0])+TAU)%TAU):cadContourSignedArea([segment])),0),rp=outline.dimensions.pitch/2,twist=params.thickness*Math.tan(helixAngle*Math.PI/180)/rp;
    try{check(shape);near(cadRecipeVolume(oc,shape),area*3,.03);near(cadRecipeBounds(oc,shape).size[2],3,1e-6);
      const sectionPoints=meridianVertices(shape);assert.ok(sectionPoints.length>=4);
      // Native planar sections at each end provide the actual end contours.
      for(const [z,angle] of [[-1.5,0],[1.5,twist]]){
        const origin=new oc.gp_Pnt(0,0,z),normal=new oc.gp_Dir(0,0,1),plane=new oc.gp_Pln(origin,normal),cut=new oc.BRepAlgoAPI_Section(shape,plane,true),end=cut.Shape(),ex=new oc.TopExp_Explorer(end,oc.TopAbs_ShapeEnum.TopAbs_VERTEX),actual=[];
        try{while(ex.More()){const raw=ex.Current(),vertex=oc.TopoDS.Vertex(raw),point=oc.BRep_Tool.Pnt(vertex);try{actual.push([point.X(),point.Y(),point.Z()]);}finally{point.delete();vertex.delete();raw.delete();}ex.Next();}for(const segment of outline.segments){const source=segment.start||segment.points[0],target=[source[0]*Math.cos(angle)-source[1]*Math.sin(angle),source[0]*Math.sin(angle)+source[1]*Math.cos(angle),z];assert.ok(actual.some(p=>Math.hypot(...p.map((v,k)=>v-target[k]))<1e-5),`Missing rotated original endpoint ${target}`);}}finally{ex.delete();end.delete();cut.delete();plane.delete();normal.delete();origin.delete();}
      }
    }finally{shape.delete();}
  }
  const gear=buildCadRecipe(oc,{type:'gear',size:[30,30,5],params:{helixAngle:-20,hubDiameter:10,hubHeight:2,keyWidth:2,keyDepth:.5}});try{check(gear);near(cadRecipeBounds(oc,gear).size[2],8,1e-6);}finally{gear.delete();}
});
test('Unrepresentable or invalid screw-generator parameters fail closed before native construction',()=>{
  assert.throws(()=>cadThreadDefinition({depth:10}),/überlappende|tiefe/);
  assert.throws(()=>cadThreadDefinition({bore:7}),/Gewindekern/);
  assert.throws(()=>cadThreadDefinition({head:'hex',headDiameter:6}),/Schraubenkopf/);
  assert.throws(()=>cadThreadDefinition({leadIn:8}),/Einführfase/);
  assert.throws(()=>cadThreadDefinition({kind:'nut',outerDiameter:8}),/Material/);
  assert.throws(()=>cadThreadDefinition({}, {constructionBudget:1e-9}),/zu klein/);
  assert.throws(()=>buildCadGear(oc,{helixAngle:45,thickness:200}),/volle Windung/);
});
test('Complete thread, nut and helical gear STEP bodies retain native surfaces, dimensions and volumes on native reload',()=>{
  for(const [name,construct] of [
    ['CAD-Gewinde',()=>buildCadThread(oc,{length:1.25,leadIn:.2,hand:'left',starts:2,head:'hex',headHeight:1,bore:2})],
    ['CAD-Mutter',()=>buildCadThread(oc,{kind:'nut',length:1.25,leadIn:.2,clearance:.15})],
    ['CAD-Schrägzahnrad',()=>buildCadGear(oc,{teeth:8,helixAngle:25,thickness:2,hubDiameter:5,hubHeight:1,bore:2,keyWidth:1,keyDepth:.5})],
  ]){
    const shape=construct();try{
      const bytes=exportCadStep(oc,[{shape,name,color:'#33aa66'}]),text=new TextDecoder().decode(bytes);assert.match(text,/B_SPLINE_SURFACE_WITH_KNOTS/);assert.doesNotMatch(text,/TRIANGULATED_FACE_SET|FACETED_BREP/);
      const imported=importCadStep(oc,bytes),loaded=readCadBrep(oc,imported.brep.data);try{check(loaded);near(cadRecipeVolume(oc,loaded),cadRecipeVolume(oc,shape),1e-5);const a=cadRecipeBounds(oc,shape),b=cadRecipeBounds(oc,loaded);for(let k=0;k<3;k++)near(a.size[k],b.size[k],1e-5);}finally{loaded.delete();}
    }finally{shape.delete();}
  }
});
