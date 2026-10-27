export function meshLidReportText(report,language='de'){
 const items=report?.meshOperations?.filter(r=>r.tool==='lid')??[];
 const en=language==='en',number=v=>Number(v.toFixed(3)).toLocaleString(en?'en-US':'de-DE');
 return items.filter(r=>r.solidProven===true&&r.storedLipClearanceVerified===true).map(r=>[
  en?'Lid geometry checked':'Deckelgeometrie geprüft',
  en?`${r.fasteners.length} measured screw positions · holes Ø ${number(r.holeDiameter)} mm · plate ${number(r.thickness)} mm`:`${r.fasteners.length} gemessene Schraubenpositionen · Löcher Ø ${number(r.holeDiameter)} mm · Platte ${number(r.thickness)} mm`,
  en?`Guide rim ${number(r.lipHeight)} mm deep · clearance ${number(r.clearance)} mm`:`Führungsrand ${number(r.lipHeight)} mm tief · Spiel ${number(r.clearance)} mm`,
  en?'Source retained. The stored rim was checked against the source surfaces. Physical fit and screw threads still need checking.':'Original bleibt erhalten. Der gespeicherte Führungsrand wurde gegen die Quellflächen geprüft. Reale Passung und Schraubgewinde sind noch zu prüfen.'
 ]);
}
export function appendMeshLidReports(host,report,language='de'){
 for(const lines of meshLidReportText(report,language)){
  const box=document.createElement('div');box.className='ai-lid-report';box.dataset.noTranslate='';
  for(const [i,text]of lines.entries()){const e=document.createElement(i?'p':'strong');e.textContent=text;box.append(e);}host.append(box);
 }
 for(const item of report?.meshOperations?.filter(r=>['counterpart','mesh-counterpart'].includes(r.tool)&&r.solidProven&&r.storedClearanceVerified)??[]){
  const box=document.createElement('div'),heading=document.createElement('strong'),text=document.createElement('p');box.className='ai-lid-report';box.dataset.noTranslate='';
  heading.textContent=language==='en'?'Counterpart geometry checked':'Gegenstückgeometrie geprüft';
  text.textContent=language==='en'?`Depth ${item.depth} mm, clearance ${item.clearance} mm. Original retained. Stored insertion surfaces checked. Physical fit remains untested.`:`Tiefe ${item.depth} mm, Spiel ${item.clearance} mm. Original bleibt erhalten. Gespeicherter Einsteckbereich gegen Quellflächen geprüft. Reale Passung noch prüfen.`;
  box.append(heading,text);host.append(box);
 }
 for(const item of report?.meshOperations?.filter(r=>r.tool==='script')??[]){
  const box=document.createElement('details'),heading=document.createElement('summary'),note=document.createElement('p'),output=document.createElement('pre');box.dataset.noTranslate='';
  heading.textContent=(language==='en'?'Local model calculation':'Lokale Modellberechnung')+' · '+(item.name??'');
  note.textContent=language==='en'?`${item.operations} tool calls in this proposal. Calculation output is not an independent dimensional check.`:`${item.operations} Werkzeugaufrufe in diesem Vorschlag. Rechenausgaben sind keine unabhängige Sollmaßprüfung.`;
  output.textContent=JSON.stringify(item.result,null,2)?.slice(0,10000)??'';box.append(heading,note,output);host.append(box);
 }
}
