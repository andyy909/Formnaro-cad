// Synthetic fixtures only. Called exclusively by isolated acceptance harnesses.
const assert=require('node:assert/strict');
async function verifyExchange(win,{cad=false}={}){
 const fixtures=require('./exchange-fixtures.json'),js=source=>win.webContents.executeJavaScript(source,true),checks=[];
 await js(`window.__exchangeFixtures=${JSON.stringify(fixtures)}`);
 const result=await js(`(${async function(cad){
  const a=window.__cadTest,checks=[],check=(v,m)=>{if(!v)throw Error(m);checks.push(m);window.__exchangePhase=m;},sleep=()=>new Promise(r=>setTimeout(r,20));
  const nodes=()=>a.snapshot().nodes,depth=()=>a.undoDepth(),encoded=()=>cad?a.serialize():JSON.stringify({format:'OfflineCAD',...a.snapshot()});
  const original=encoded();
  if(cad){await a.resetProject();await a.settled();}else a.restore({...a.snapshot(),nodes:[]});
  const bytes=base64=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  async function start(data,name,companions=[]){
   const previous=document.getElementById('exchange-import'),input=document.getElementById('import-file'),dt=new DataTransfer();dt.items.add(new File([data],name));for(const f of companions)dt.items.add(new File([bytes(f.base64)],f.name));input.files=dt.files;
   window.__exchangeImportTask=input.onchange();const start=performance.now();while(!document.getElementById('exchange-import')||document.getElementById('exchange-import')===previous||!document.getElementById('modal').open){if(performance.now()-start>10000)throw Error('Importdialog fehlt: '+name);await sleep();}
  }
  async function apply(){if(cad){const kind=document.getElementById('exchange-kind');if(kind){kind.value='reference';kind.dispatchEvent(new Event('change',{bubbles:true}));}}await document.getElementById('exchange-import').onclick();await a.settled();const status=document.getElementById('exchange-status');if(document.getElementById('modal').open&&status?.textContent)throw Error(status.textContent);await window.__exchangeImportTask;}
  async function open(text){const dt=new DataTransfer(),input=document.getElementById('open-file');dt.items.add(new File([text],'Austauschpruefung.ocad'));input.files=dt.files;await input.onchange();await a.settled();}
  function metrics(n){if(!cad)return {size:n.size,center:n.pos};const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],m=n.transform;for(let i=0;i<n.mesh.verts.length;i+=3){const p=n.mesh.verts.slice(i,i+3),v=[0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]);for(let k=0;k<3;k++){min[k]=Math.min(min[k],v[k]);max[k]=Math.max(max[k],v[k]);}}return {size:max.map((v,i)=>v-min[i]),center:min.map((v,i)=>(v+max[i])/2)};}
  const near=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<.0002);
  function placed(parts,first=false){const m=parts.map(metrics),lo=[0,1,2].map(k=>Math.min(...m.map(v=>v.center[k]-v.size[k]/2))),hi=[0,1,2].map(k=>Math.max(...m.map(v=>v.center[k]+v.size[k]/2))),x=(lo[0]+hi[0])/2,y=(lo[1]+hi[1])/2;return Math.abs(lo[2])<.0002&&Math.abs(x-y)<.0002&&x>=-.0002&&Math.abs(x/15-Math.round(x/15))<.0002&&(!first||Math.abs(x)<.0002);}
  const baseline=JSON.stringify(nodes()),undo=depth();await start(bytes(window.__exchangeFixtures.threeMF),'Baugruppe.3mf');check(JSON.stringify(nodes())===baseline&&depth()===undo,'Importdialog ändert weder Modell noch Undo');await apply();
  check(nodes().length===2&&a.selection().length===2,'3MF importiert zwei einzeln ausgewählte Teile');check(nodes()[0].color==='#079ca9'&&nodes()[1].color==='#304d96','3MF erhält beide Objektfarben');
  check(nodes().every(n=>cad?n.kind==='referenceMesh':n.type==='import'),'Import verwendet die passende Geometrieart der Zielanwendung');
  const originalCenter=metrics(nodes()[0]).center,relative=metrics(nodes()[1]).center.map((v,k)=>v-originalCenter[k]);check(near(metrics(nodes()[0]).size,[20,12,8])&&(cad?near(relative,[-58,39,19])&&placed(nodes(),true):near(originalCenter,[40,-15,12])&&near(metrics(nodes()[1]).center,[-18,24,31])),'3MF erhält Maße und relative Baugruppenpositionen bei mittiger Bodenplatzierung');check(depth()===undo+1,'Gesamter 3MF-Import ist genau ein Undo-Schritt');
  const imported=JSON.stringify(nodes());await a.actions.undo();await a.settled();check(JSON.stringify(nodes())===baseline,'Undo stellt das vollständige Ausgangsmodell wieder her');await a.actions.redo();await a.settled();check(JSON.stringify(nodes())===imported,'Redo stellt beide Teile mit Originaldaten wieder her');
  const first=nodes()[0];a.select(cad?[{rootId:first.id,path:[]}]:[first.id]);
  if(cad){await a.mutate(draft=>{const n=draft.nodes.find(v=>v.id===first.id);n.transform[12]+=10;n.color='#e25b31';},'Importteil bearbeiten');await a.settled();}
  else{const pos=document.querySelector('#pos-fields input');pos.value='50';await pos.onchange();await a.settled();const input=document.getElementById('object-color');input.value='#e25b31';await input.onchange();await a.settled();}
  check(near(metrics(nodes()[0]).center,originalCenter.map((v,k)=>v+(k===0?10:0)))&&nodes()[0].color==='#e25b31','Importteil lässt sich verschieben und umfärben');
  const height=cad?document.getElementById('size-2'):document.querySelectorAll('#size-fields input')[2];height.value='12';await height.onchange();await a.settled();const edited=metrics(nodes()[0]);check(near(edited.size,[20,12,12]),'Importteil lässt sich mit dem vorhandenen Maßfeld skalieren');
  const saved=encoded(),savedNodes=JSON.stringify(nodes());await open(saved);check(JSON.stringify(nodes())===savedNodes,'Projektdatei erneut geöffnet: Teile, Farben und Maße unverändert');
  const exportMetrics=nodes().map(metrics),exports={};for(const format of ['3mf','gltf','glb']){
   const output=cad?(await a.controller.exportModel({format})).data:(await a.calculations.run({job:'export',nodes:nodes(),format},'Austauschprüfung')).output;
   exports[format]=typeof output==='string'?btoa(unescape(encodeURIComponent(output))):btoa(String.fromCharCode(...output));
   const before=nodes().length;await start(output,'Erneut.'+format);await apply();check(nodes().length===before*2,format+' lässt sich nach Bearbeitung wieder importieren');
   const again=nodes().slice(before),shift=metrics(again[0]).center.map((v,k)=>v-exportMetrics[0].center[k]);check(again[0].color==='#e25b31'&&near(metrics(again[0]).size,edited.size)&&(cad?placed(again)&&again.every((n,i)=>near(metrics(n).size,exportMetrics[i].size)&&near(metrics(n).center,exportMetrics[i].center.map((v,k)=>v+shift[k]))):near(metrics(again[0]).center,edited.center)),format+' erhält bearbeitete Farbe, Maße und relative Lage mit regulärer Importplatzierung');await a.actions.undo();await a.settled();
  }
  await start(bytes(window.__exchangeFixtures.glb),'Standard.glb');await apply();check(nodes().length===4&&nodes()[2].color==='#ff0000'&&nodes()[3].color==='#0000ff','Standard-GLB importiert Teile und Materialfarben');check(cad?near(metrics(nodes()[2]).size,[20,12,8])&&near(metrics(nodes()[3]).center.map((v,k)=>v-metrics(nodes()[2]).center[k]),[-58,39,19])&&placed(nodes().slice(2)):near(metrics(nodes()[2]).center,[40,-15,12]),'GLB rechnet Meter und Y-Achse korrekt in Millimeter und Z-Achse um');await a.actions.undo();await a.settled();
  await start(window.__exchangeFixtures.externalGltf,'Lokal.gltf',window.__exchangeFixtures.companions);await apply();check(nodes().length===4,'glTF mit lokal ausgewählten Binärbegleitdateien importiert');await a.actions.undo();await a.settled();
  const beforeCancel=JSON.stringify(nodes()),cancelDepth=depth();await start(bytes(window.__exchangeFixtures.threeMF),'Abbruch.3mf');document.getElementById('exchange-cancel').click();await window.__exchangeImportTask;check(JSON.stringify(nodes())===beforeCancel&&depth()===cancelDepth,'Abbrechen erhält Modell und Undo');
  if(!cad){await start(bytes(window.__exchangeFixtures.openThreeMF),'Offen.3mf');await document.getElementById('exchange-import').onclick();await a.settled();check(!!document.getElementById('exchange-status').textContent&&JSON.stringify(nodes())===beforeCancel&&depth()===cancelDepth,'Ein offenes Teil verwirft den ganzen Import ohne Teilübernahme');document.getElementById('exchange-cancel').click();await window.__exchangeImportTask;}
  await open(original);return {checks,exports,project:saved,variant:cad?'cad':'mesh'};
 }.toString()})(${JSON.stringify(cad)})`);
 assert.ok(result.checks.length>=20);checks.push(...result.checks);return {ok:true,...result,checks};
}
module.exports={verifyExchange};
