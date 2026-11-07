export function benchmarkEntries(entries,scope='all',query=''){
 const q=query.trim().toLocaleLowerCase();
 return entries.filter(r=>r.scope===scope&&[r.modelName,r.model,r.providerId].join(' ').toLocaleLowerCase().includes(q))
  .sort((a,b)=>a.modelName.localeCompare(b.modelName)||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function modelBenchmarks(entries,providerId,model){
 // Exact provider and model identity; aliases and other access modes stay separate.
 return benchmarkEntries(entries).filter(r=>r.providerId===providerId&&r.model===model);
}
const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export function benchmarkDescription(r,language='de'){
 const en=language==='en',t=(de,enText)=>en?enText:de;
 const label=(en?r.labelEn:r.label)||r.label;
 const state=r.status==='completed'?t('abgeschlossen','completed'):r.status==='paused'?t('pausiert · Teilstand','paused · partial'):t('Teilstand','partial');
 const basis=r.kind==='lab'?t('Rohversuche','raw attempts'):t('geplante Tests','planned tests');
 return label+(r.suiteVersion?' '+r.suiteVersion:'')+' · '+r.date+' · '+r.effort+' · '+r.passed+'/'+r.total+' '+t('bestätigt','confirmed')+' ('+basis+') · '+state;
}
export function renderBenchmarkChart(host,entries,language='de'){
 const en=language==='en',t=(de,enText)=>en?enText:de;host.replaceChildren();
 if(!entries.length){host.append(node('p','ai-model-empty',t('Für diese Auswahl liegen noch keine Messwerte vor.','No measurements are available for this selection.')));return;}
 const plot=node('div','ai-benchmark-plot');plot.setAttribute('role','list');plot.setAttribute('aria-label',t('Bestätigte Ergebnisse pro Testreihe, Skala 0 bis 100 Prozent','Confirmed results per test series, scale 0 to 100 percent'));
 for(const r of entries){
  const percent=r.total?100*r.passed/r.total:0;
  const column=node('div','ai-benchmark-column');column.setAttribute('role','listitem');column.setAttribute('aria-label',r.modelName+' · '+benchmarkDescription(r,language));
  column.dataset.benchmarkId=r.id;
  column.append(node('strong','ai-benchmark-value',r.passed+' / '+r.total));
  const track=node('div','ai-benchmark-track'),bar=node('div','ai-benchmark-bar');
  bar.style.height=Math.max(0,Math.min(100,percent))+'%';track.append(bar);track.setAttribute('aria-hidden','true');column.append(track);
  column.append(node('strong','ai-benchmark-model',r.modelName),node('small','',((en?r.labelEn:r.label)||r.label)+(r.suiteVersion?' '+r.suiteVersion:'')),
   node('small','',r.date+' · '+r.effort),node('small','ai-benchmark-state',r.status==='completed'?t('abgeschlossen','completed'):t('Teilstand','partial')));
  column.title=benchmarkDescription(r,language);plot.append(column);
 }
 host.append(plot);
 const details=node('details','ai-benchmark-details');details.append(node('summary','',t('Testumfang und Ergebnisse im Detail','Test scope and detailed results')));
 for(const r of entries)details.append(renderBenchmarkDetail(r,language));host.append(details);
}
export function renderBenchmarkDetail(r,language='de'){
 const en=language==='en',t=(de,enText)=>en?enText:de;
 const row=node('article','ai-benchmark-detail');row.append(node('strong','',r.modelName),node('p','',benchmarkDescription(r,language)));
 const counts=r.byOutcome??{},labels={failed:t('ohne bestätigten Abschluss','without confirmed completion'),unverified:t('ungeprüft','unverified'),infrastructure:t('Infrastruktur','infrastructure'),
  'model-unverified':t('Modellidentität ungeprüft','model identity unverified'),interrupted:t('unterbrochen','interrupted'),pending:t('offen','pending')};
 const info=Object.entries(labels).filter(([key])=>counts[key]>0).map(([key,label])=>counts[key]+' '+label);
 if(r.finished!==undefined)info.unshift(r.finished+'/'+r.total+' '+t('beendet','finished'));
 if(r.rawAttempts!==undefined)info.push(r.rawAttempts+' '+t('Rohversuche','raw attempts'));
 if(Number.isFinite(r.medianSuccessfulMs))info.push(t('Erfolgsdauer (Median): ','Successful duration (median): ')+Math.round(r.medianSuccessfulMs/1000)+' s');
 if(r.sourceVersion)info.push('Formnaro '+r.sourceVersion);
 if(r.monitor)info.push(t('Überwacher: ','Monitor: ')+r.monitor);
 if(info.length)row.append(node('p','',info.join(' · ')));
 row.append(node('small','',r.origin==='local'?t('Gespeicherter lokaler Benchmark','Saved local benchmark'):t('Mitgelieferter Prüfstand','Bundled test results')));
 if(r.note)row.append(node('p','',en?(r.noteEn||r.note):r.note));
 if(r.suiteHash){const hash=node('small','ai-benchmark-hash','Suite SHA-256: '+r.suiteHash);row.append(hash);}
 return row;
}
