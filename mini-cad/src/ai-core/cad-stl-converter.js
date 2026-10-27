export const hasLocalStlConverter=()=>typeof globalThis.window?.offlinecadDesktop?.convertStl==='function';
export function conversionControls(prefix){return `<label class="dialog-label">Abweichungsbudget (mm)<input id="${prefix}-tolerance" type="number" min="0.0001" max="100" step="0.01" value="0.15"></label><label class="dialog-label">Verfahren<select id="${prefix}-mode"><option value="auto">Automatisch · Flächen, Profile und Freiformen</option><option value="smooth">Gekrümmte Flächen</option><option value="planar">Planare Näherung</option><option value="exact">Originalfacetten</option></select></label><label class="check-line"><input id="${prefix}-fallback" type="checkbox" checked> Facetten als Rückfall erlauben</label><p class="small-note">Zusammenhängende Ebenen, Zylinder, Kegel und geeignete Freiformen werden geprüft. Schwierige Bereiche können facettiert bleiben. Abweichungen sind beidseitige Stichproben gegen die Original-STL, keine garantierten Maximalfehler. Konstruktionshistorie wird nicht wiederhergestellt.</p>`;}
export function readConversionControls(prefix){
 const element=suffix=>document.getElementById(prefix+'-'+suffix),tolerance=Number(element('tolerance').value);
 if(!Number.isFinite(tolerance)||tolerance<.0001||tolerance>100)throw Error('Die Toleranz muss zwischen 0,0001 und 100 mm liegen.');
 return {tolerance,mode:element('mode').value,fallback:element('fallback').checked};
}
export function conversionSummary(report){
 const max=Number(report.deviation?.sampled_max_mm),allowance=Number(report.tessellation_allowance_mm);
 const methods=[...new Set(report.bodies.map(body=>body.method))].join('; '),faceted=report.bodies.some(body=>body.stage==='exact');
 return `STL-Konverter ${report.version}: ${report.input_triangles} Dreiecke → ${report.output_faces} CAD-Flächen, ${report.solids} Körper. ${methods}. Stichproben-Abstand maximal ${max.toFixed(6)} mm; Vernetzungsreserve ${allowance.toFixed(6)} mm; Budget ${report.options.tolerance} mm.${faceted?' Rundungen bleiben facettiert.':''} Keine ursprüngliche Konstruktionshistorie.`;
}
export function createLocalStlConversion({desktop=globalThis.window?.offlinecadDesktop,onProgress=()=>{}}={}){
 const id=crypto.randomUUID();let cancelled=false;
 const unsubscribe=desktop.onStlProgress?.(value=>{if(value.id===id&&!cancelled)onProgress(value.message);})??(()=>{});
 const abort=()=>{if(cancelled){const e=Error('Konvertierung abgebrochen.');e.name='AbortError';throw e;}};
 return {cancel:()=>{cancelled=true;unsubscribe();return desktop.cancelStl({id});},
  run:async(file,options)=>{try{const bytes=new Uint8Array(await file.arrayBuffer());abort();const result=await desktop.convertStl({id,name:file.name,bytes,options});abort();return result;}finally{unsubscribe();}}};
}

export function createLocalStlAnalysis({desktop=globalThis.window?.offlinecadDesktop,onProgress=()=>{}}={}){
 const id=crypto.randomUUID();let cancelled=false;
 const unsubscribe=desktop.onStlProgress?.(value=>{if(value.id===id&&!cancelled)onProgress(value.message);})??(()=>{});
 const abort=()=>{if(cancelled){const e=Error('Flächenanalyse abgebrochen.');e.name='AbortError';throw e;}};
 return {cancel:()=>{cancelled=true;unsubscribe();return desktop.cancelStl({id});},
  run:async(file,options,{edits=null,commands=[]}={})=>{try{const bytes=new Uint8Array(await file.arrayBuffer());abort();const result=await desktop.analyseStl({id,name:file.name,bytes,options,edits,commands});abort();return result.analysis;}finally{unsubscribe();}}};
}
