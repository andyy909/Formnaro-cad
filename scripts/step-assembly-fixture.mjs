// Synthetic analytic fixture, deliberately independent of the new reader.
import {buildCadRecipe} from '../src/cad-recipes.js';
import {stepPartName} from '../src/cad-step-io.js';
export function stepAssemblyFixture(oc,{rotateNested=false}={}){
  const values=[],keep=v=>(values.push(v),v),path='/assembly-fixture.step';
  try{
    const doc=keep(new oc.TDocStd_Document(keep(new oc.TCollection_ExtendedString('BinXCAF',true)))),main=keep(doc.Main()),shapes=keep(oc.XCAFDoc_DocumentTool.ShapeTool(main)),colors=keep(oc.XCAFDoc_DocumentTool.ColorTool(main));
    oc.XCAFDoc_DocumentTool.SetLengthUnit(doc,.001);
    const name=(l,n)=>keep(oc.TDataStd_Name.Set(l,keep(new oc.TCollection_ExtendedString(stepPartName(n),true))));
    const color=(l,hex,alpha=1)=>{const c=keep(new oc.Quantity_ColorRGBA());oc.Quantity_ColorRGBA.ColorFromHex(hex,c,true);c.SetAlpha(alpha);colors.SetColor(l,c,oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);};
    const root=keep(shapes.NewShape()),nested=keep(shapes.NewShape()),box=keep(buildCadRecipe(oc,{type:'box',size:[20,10,2]})),cylinder=keep(buildCadRecipe(oc,{type:'cylinder',size:[4,4,8]})),plate=keep(shapes.AddShape(box,false,true)),pin=keep(shapes.AddShape(cylinder,false,true));
    name(root,'Prüfbaugruppe');name(nested,'Unterbau');name(plate,'Platte ä');name(pin,'Stift 日本語');color(plate,'#1266cc',.7);color(pin,'#ee4411');
    const explorer=keep(new oc.TopExp_Explorer(box,oc.TopAbs_ShapeEnum.TopAbs_FACE)),face=keep(explorer.Current()),label=keep(shapes.AddSubShape(plate,face));color(label,'#ffcc22');
    function add(parent,part,xyz,title,hex,angle=0){const t=keep(new oc.gp_Trsf()),v=keep(new oc.gp_Vec(...xyz));if(angle){const axis=keep(new oc.gp_Ax1(keep(new oc.gp_Pnt(0,0,0)),keep(new oc.gp_Dir(0,0,1))));t.SetRotation(axis,angle);t.SetTranslationPart(v);}else t.SetTranslation(v);const loc=keep(new oc.TopLoc_Location(t)),l=keep(shapes.AddComponent(parent,part,loc));name(l,title);if(hex)color(l,hex);return l;}
    add(root,plate,[5,10,3],'Boden');add(root,nested,[40,0,0],'Unterbau links',undefined,rotateNested?Math.PI/2:0);
    add(nested,pin,[0,0,2],'Stift 1');add(nested,pin,[12,0,2],'Stift 2','#22bb55');
    shapes.UpdateAssemblies();
    const writer=keep(new oc.STEPCAFControl_Writer()),progress=keep(new oc.Message_ProgressRange());writer.SetColorMode(true);writer.SetNameMode(true);oc.Interface_Static.SetCVal('write.step.unit','MM');oc.Interface_Static.SetIVal('write.step.schema',4);
    if(!writer.Perform(doc,path,progress))throw Error('Fixture STEP writer failed');return oc.FS.readFile(path).slice();
  }finally{for(const v of values.reverse())v?.delete?.();try{oc.FS.unlink(path);}catch{}}
}
