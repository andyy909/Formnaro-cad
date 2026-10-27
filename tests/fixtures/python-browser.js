import {runCadPython} from '../../src/cad-python.js';
import {createCadController} from '../../src/cad-controller.js';
import {parseCadProject} from '../../src/cad-project.js';
import {createCadAutomationAccess} from '../../src/cad-automation-access.js';
window.pythonSmoke=()=>runCadPython({code:'import math\nresult = {"answer": math.sqrt(1764)}',timeoutMs:30000,call:()=>{throw Error('Unexpected model operation');}});

window.runPythonProof=async()=>{
 const checks=[],check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const smoke=await window.pythonSmoke();check(smoke.value.answer===42&&smoke.pythonVersion.startsWith('3.14.'),'Echtes offline Python mit Standardbibliothek');
 const boundary=await runCadPython({code:`import js, os
result = {"node": bool(js.Reflect.has(js.globalThis, "process")), "desktop": bool(js.Reflect.has(js.globalThis, "offlinecadDesktop"))}
for name, url in [("network", "http://127.0.0.1:9/formnaro-private"), ("file", "file:///C:/formnaro-private-sentinel.txt")]:
    try:
        await js.fetch(url)
        result[name] = False
    except Exception:
        result[name] = True
try:
    open("C:/formnaro-private-sentinel.txt").read()
    result["host_file"] = False
except OSError:
    result["host_file"] = True
try:
    js.indexedDB.open("private-profile")
    result["storage"] = False
except Exception:
    result["storage"] = True
print("Lokale Python-Berechnung")`,call:()=>{throw Error('Unexpected capability');}});
 check(!boundary.value.node&&!boundary.value.desktop&&boundary.value.network&&boundary.value.file&&boundary.value.host_file&&boundary.value.storage,'Python erhält weder Hostdateien, Netzwerk, Programmspeicher noch Desktop-Bridge');
 check(boundary.stdout.includes('Lokale Python-Berechnung'),'Python-Ausgabe bleibt verfügbar');
 const create=()=>createCadController({createWorker:()=>new Worker(new URL('../../src/cad-worker.js',import.meta.url),{type:'module'})});
 const cad=create(),artifacts={};
 try{
  const before=cad.serialize();
  const p=await cad.preview({kind:'batch',commands:[{op:'python',code:`from formnaro import model
platte = model.box(60,40,6,origin=(-30,-20,0),name="Python-Platte")
bohrungen = [model.cylinder(2.5,8,origin=(x,0,-1),hole=True) for x in (-20,20)]
teil = model.cut(platte,*bohrungen,name="Python-Bohrplatte")
scene = await model.query("cad","scene")
result = {"width": scene["objects"][0]["worldBounds"]["size"][0], "holes": len(bohrungen)}`} ]});
  check(cad.serialize()===before&&cad.state().undo===0,'Python verändert vor der Übernahme nur die Vorschau');
  const n=p.project.nodes[0],result=p.report.meshOperations.find(r=>r.tool==='python').result;
  check(p.project.nodes.length===1&&n.stats.solids===1&&Math.abs(n.stats.volume-(14400-2*Math.PI*6.25*6))<1e-5,'Python erstellt eine native Platte mit analytisch geprüften Bohrungen');
  check(n.children.length===3&&n.children.every(c=>c.source==='native')&&result.value.width===60&&result.value.holes===2,'Native Quellen und gemessene Python-Abfragen erhalten');
  cad.apply(p);const after=cad.serialize();artifacts.project=JSON.parse(after);artifacts.step=Array.from((await cad.exportModel({format:'step'})).data);artifacts.stl=Array.from((await cad.exportModel({format:'stl'})).data);
  check(cad.state().undo===1,'Eine Übernahme ist genau ein Undo-Schritt');cad.undo();check(cad.serialize()===before,'Python-Undo stellt Original exakt wieder her');cad.redo();check(cad.serialize()===after,'Python-Redo erhält Quellen und Ergebnis exakt');
  await cad.open(parseCadProject(after));check(cad.serialize()===after,'Gespeicherte Python-Ergebnisse lassen sich ohne Python-Prozess wieder öffnen');
  const original=cad.serialize();
  try{await cad.preview({kind:'batch',commands:[{op:'python',code:'from formnaro import model\nmodel.box(3,4,5)\nawait model.flush()\nraise RuntimeError("Geplanter Rechenfehler")'}]});throw Error('Fehler ignoriert');}catch(error){check(error.message.includes('Geplanter Rechenfehler')&&cad.serialize()===original&&cad.state().previews===0,'Python-Fehler nach echtem CAD-Aufruf verwirft alle Zwischenänderungen');}
  const locked=cad.snapshot();locked.layers[0].locked=true;await cad.open(locked);const lockedBefore=cad.serialize();
  try{await cad.preview({kind:'batch',commands:[{op:'python',code:`from formnaro import model\nmodel.get(${JSON.stringify(n.id)}).edit(name="Verboten")`}]});throw Error('Sperre ignoriert');}catch(error){check(cad.serialize()===lockedBefore&&/gesperrt|geschützt/.test(error.message),'Python respektiert geerbte Quellensperren');}
  locked.layers[0].locked=false;await cad.open(locked);
  const access=createCadAutomationAccess({controller:cad}),proposal=await access.preview({revision:cad.revision(),commands:[{op:'python',code:'from formnaro import model\nmodel.cylinder(2,10,origin=(50,0,0),normal=(1,0,0))'}]});
  await cad.execute({kind:'batch',commands:[{op:'create',type:'box',name:'Spätere Änderung',size:[2,3,4],pos:[90,0,2]}]});
  try{await access.apply(proposal);throw Error('Veraltete Vorschau angewandt');}catch(error){check(cad.snapshot().nodes.some(n=>n.name==='Spätere Änderung')&&/geändert|veraltet|revision/i.test(error.message),'Veraltete Python-Vorschau überschreibt keine spätere Änderung');}
 }finally{cad.dispose();}
 const named=create();let namedScene;const namedRefresh=async()=>{namedScene=await named.describe();};
 try{
  await namedRefresh();const access=createCadAutomationAccess({controller:named,getScene:()=>namedScene,refresh:namedRefresh});
  const proposal=await access.preview({revision:named.revision(),commands:[{op:'python',code:'from formnaro import model\np=model.box(20,30,4)\nh=model.cylinder(2,6,origin=(10,15,-1),hole=True)\nmodel.cut(p,h,alias="result")'}],checks:[{kind:'size',target:'$result',space:'worldAxes',expected:[20,30,4]},{kind:'volume',target:'$result',expected:2400-Math.PI*4*4,tolerance:.001},{kind:'solids',target:'$result',expected:1}]});
  check(proposal.aliases.result&&proposal.verification.checks.length===3,'Benannter Python-Ergebnisalias erreicht die echten äußeren Maß- und Volumenprüfungen');
  await access.apply(proposal);check(named.snapshot().nodes[0].children.length===2&&named.state().undo===1,'Benannter Python-Alias erzeugt keine zusätzliche Kopie und erhält alle Quellen');
 }finally{named.dispose();}
 const multiple=await runCadPython({code:'from formnaro import Model\na=Model()\nb=Model()\na.box(1,2,3)\nb.box(3,2,1)\nresult={"ok":True}',call:async(method,args)=>({method,args})});check(multiple.value.ok,'Mehrere Python-Modelle können automatisch und geordnet abgeschlossen werden');
 try{await runCadPython({code:'while True:\n    pass',timeoutMs:2500,call:async()=>null});throw Error('Timeout fehlt');}catch(error){check(error.code==='AI_SCRIPT_TIMEOUT','Endloses Python beendet ohne blockierte Oberfläche');}
 const abort=new AbortController();let reached;const started=new Promise(resolve=>reached=resolve);
 const stopped=runCadPython({code:'from formnaro import model\nawait model.snapshot()',signal:abort.signal,call:async()=>{reached();return new Promise(()=>{});}});await started;abort.abort();
 try{await stopped;throw Error('Abbruch fehlt');}catch(error){check(error.code==='ABORTED','Laufendes Python mit ausstehender Modellabfrage lässt sich abbrechen');}
 check(document.querySelectorAll('iframe').length===0,'Python-Worker nach Erfolg, Fehler, Abbruch und Zeitlimit entfernt');
 return {ok:true,checks,artifacts};
};
