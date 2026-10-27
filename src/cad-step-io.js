import {validateCadSolid,writeCadBrep,readCadBrep} from './cad-native-kernel.js';

// XCAF structure is organization, never a Boolean union of overlapping parts.
export function importCadStepAssembly(oc,bytes){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_STEP_BYTES)throw Error('STEP-Import benötigt eine Datei bis 30 MB.');
  if(!/ISO-10303-21\s*;/i.test(new TextDecoder().decode(bytes.subarray(0,256))))throw Error('Keine STEP-Datei im unterstützten Textformat.');
  const path=filePath();
  try{
    oc.FS.writeFile(path,bytes);
    let document;
    try{document=oc.FormnaroCadBridge.ReadStepAssemblyJson(path);}catch{throw Error('STEP-Baugruppe konnte nicht vollständig gelesen werden. Unterstützt werden eigenständige Dateien mit geschlossenen CAD-Teilen, bis 500 Teilen und 12 Ebenen. Externe STEP-Referenzen bitte vorher in eine Datei einbetten.');}
    const roots=JSON.parse(document);let count=0,totalBytes=0;
    function visit(item,depth=0){
      if(++count>1000||depth>11||typeof item.name!=='string'||!item.name.trim()||item.name.length>200)throw Error('STEP-Baum überschreitet die Projektgrenzen (1000 Einträge, 12 Ebenen, Namen bis 200 Zeichen).');
      if(item.children){item.children.forEach(child=>visit(child,depth+1));return;}
      const shape=readCadBrep(oc,item.brep);
      try{const checked=validateCadSolid(oc,shape),data=writeCadBrep(oc,shape);totalBytes+=new TextEncoder().encode(data).length;if(totalBytes>40*1024*1024)throw Error('STEP-Baugruppe überschreitet das CAD-Projektbudget.');item.brep={format:'OpenCascade-BRep',data,triangulation:false};item.stats={bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids};}
      finally{shape.delete();}
    }
    roots.forEach(root=>visit(root));return roots;
  }finally{try{oc.FS.unlink(path);}catch{}}
}

let sequence=0;
const MAX_STEP_BYTES=30*1024*1024;
function scope(){const values=[];return {keep:value=>(values.push(value),value),close:()=>{for(const value of values.reverse())value?.delete?.();}};}
function filePath(){return `/formnaro-cad-${++sequence}.step`;}

// OCCT preserves explicit Part 21 character directives but writes an ordinary
// UTF-8 label literally. Encode the temporary export label for readers of the
// AP214/Part21-2002 string grammar, without changing the actual model name.
export function stepPartName(name){
  if(typeof name!=='string'||!name.length||name.length>1000)throw Error('Ungültiger STEP-Teilename.');
  const points=Array.from(name,v=>v.codePointAt(0));if(points.some(v=>v>=0xd800&&v<=0xdfff))throw Error('STEP-Teilename enthält ein ungültiges Unicode-Zeichen.');
  if(points.every(v=>v>=32&&v<=126&&v!==92))return name;
  const wide=points.some(v=>v>0xffff),digits=wide?8:4;
  return '\\X'+(wide?'4':'2')+'\\'+points.map(v=>v.toString(16).toUpperCase().padStart(digits,'0')).join('')+'\\X0\\';
}

// The imported body remains in original millimetre coordinates. Placement and
// optional centering belong to the caller's full affine matrix, never a mesh.
export function importCadStep(oc,bytes){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_STEP_BYTES)throw Error('STEP-Import benötigt eine Datei bis 30 MB.');
  if(!/ISO-10303-21\s*;/i.test(new TextDecoder().decode(bytes.subarray(0,256))))throw Error('Keine STEP-Datei im unterstützten Textformat.');
  const path=filePath(),objects=scope();
  try{
    oc.FS.writeFile(path,bytes);const reader=objects.keep(new oc.STEPControl_Reader());
    if(reader.ReadFile(path)!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)throw Error('STEP-Datei konnte nicht gelesen werden.');
    reader.SetSystemLengthUnit(1);
    if(!reader.TransferRoots())throw Error('STEP-Datei enthält keine übertragbaren Körper.');
    const shape=objects.keep(reader.OneShape()),checked=validateCadSolid(oc,shape);
    return {brep:{format:'OpenCascade-BRep',data:writeCadBrep(oc,shape),triangulation:false},stats:{bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids}};
  }finally{objects.close();try{oc.FS.unlink(path);}catch{}}
}

// The caller owns the verified, placed CAD bodies. XCAF writes names and colors
// on separate part labels; no display tessellation enters the STEP document.
export function exportCadStep(oc,parts){
  if(!Array.isArray(parts)||!parts.length||parts.length>500)throw Error('STEP-Export benötigt mindestens einen sichtbaren CAD-Körper.');
  const path=filePath(),objects=scope();
  try{
    const format=objects.keep(new oc.TCollection_ExtendedString('BinXCAF',true)),document=objects.keep(new oc.TDocStd_Document(format)),main=objects.keep(document.Main()),shapes=objects.keep(oc.XCAFDoc_DocumentTool.ShapeTool(main)),colors=objects.keep(oc.XCAFDoc_DocumentTool.ColorTool(main));
    oc.XCAFDoc_DocumentTool.SetLengthUnit(document,.001);
    for(const part of parts){
      validateCadSolid(oc,part.shape);
      if(typeof part.name!=='string'||!part.name.length||part.name.length>1000)throw Error('Ungültiger STEP-Teilename.');
      if(part.color!==undefined&&!/^#[\da-f]{6}$/i.test(part.color))throw Error('Ungültige STEP-Farbe.');
      if(part.opacity!==undefined&&(!Number.isFinite(part.opacity)||part.opacity<0||part.opacity>1))throw Error('Ungültige STEP-Transparenz.');
      const label=objects.keep(shapes.AddShape(part.shape,false,true)),name=objects.keep(new oc.TCollection_ExtendedString(stepPartName(part.name),true));objects.keep(oc.TDataStd_Name.Set(label,name));
      if(part.color){const color=objects.keep(new oc.Quantity_ColorRGBA());if(!oc.Quantity_ColorRGBA.ColorFromHex(part.color,color,true))throw Error('STEP-Farbe konnte nicht übertragen werden.');color.SetAlpha(part.opacity??1);colors.SetColor(label,color,oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);}
      if(part.faceColors?.length){
        const reference=objects.keep(new oc.TDF_Label()),isReference=oc.XCAFDoc_ShapeTool.GetReferredShape(label,reference),definition=isReference?reference:label,definitionShape=objects.keep(oc.XCAFDoc_ShapeTool.GetShape(definition)),explorer=objects.keep(new oc.TopExp_Explorer(definitionShape,oc.TopAbs_ShapeEnum.TopAbs_FACE)),faces=[],buckets=new Map();
        while(explorer.More()){const raw=explorer.Current(),hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)??[];if(!bucket.some(f=>f.IsSame(raw))){objects.keep(raw);faces.push(raw);bucket.push(raw);buckets.set(hash,bucket);}else raw.delete();explorer.Next();}
        for(const style of part.faceColors){const face=faces[style.faceIndex-1];if(!face)throw Error('STEP-Flächenfarbe besitzt keine zugehörige Fläche.');const sub=objects.keep(shapes.AddSubShape(definition,face)),rgba=objects.keep(new oc.Quantity_ColorRGBA());if(!oc.Quantity_ColorRGBA.ColorFromHex(style.color,rgba,true))throw Error('Ungültige STEP-Flächenfarbe.');rgba.SetAlpha(style.opacity);colors.SetColor(sub,rgba,oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);}
      }

    }
    const writer=objects.keep(new oc.STEPCAFControl_Writer()),progress=objects.keep(new oc.Message_ProgressRange());writer.SetColorMode(true);writer.SetNameMode(true);
    // The first writer registers these parameters. Configuring them before
    // construction silently leaves the first export at its default schema.
    if(!oc.Interface_Static.SetCVal('write.step.unit','MM')||!oc.Interface_Static.SetIVal('write.step.schema',4))throw Error('STEP-Exporter konnte Millimeter/AP214 nicht einstellen.');
    // Perform uses the native null multi-file prefix. Passing an empty string
    // to Transfer would still select external files and omit body geometry.
    if(!writer.Perform(document,path,progress))throw Error('Direkter CAD-STEP-Export fehlgeschlagen.');
    const bytes=oc.FS.readFile(path).slice();if(bytes.length>MAX_STEP_BYTES)throw Error('STEP-Ausgabe überschreitet die Dateigrenze.');return bytes;
  }finally{objects.close();try{oc.FS.unlink(path);}catch{}}
}
