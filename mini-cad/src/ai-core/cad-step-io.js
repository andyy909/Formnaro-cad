import {validateCadSolid,writeCadBrep} from './cad-native-kernel.js';

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
