const fs=require('node:fs'),path=require('node:path');
async function labReport({directory,records,pricing,seriesId,reviews=[],format='json'}){
 if(seriesId!==undefined&&!/^[a-f0-9-]{36}$/.test(seriesId))throw Error('Ungültige Serienkennung.');
 if(!['json','md','csv'].includes(format))throw Error('Ungültiges Exportformat.');
 const chosen=records.filter(r=>r.spec.experiment==='lab'&&(!seriesId||r.spec.seriesId===seriesId));
 const {summarizeLab}=await import('../ai/test-lab-summary.mjs');const summary=summarizeLab(chosen);
 const {usagePrice,usageTotals}=await import('../ai/diagnostic-costs.mjs');
 const usage=chosen.flatMap(r=>r.usageEvents.map(e=>({role:e.role??'modeler',value:usagePrice(e.usage,e.rates??r.rates??pricing,e.at,e.billing)})));
 const includedReviews=reviews.filter(r=>!seriesId||r.evidence?.runs?.some(x=>x.seriesId===seriesId)||r.seriesIds?.includes(seriesId));
 for(const r of includedReviews)for(const e of r.usageEvents??[])usage.push({role:'reviewer',value:usagePrice(e.usage,e.rates??pricing,e.at,e.billing)});
 const total=usageTotals(usage.map(u=>u.value)),roles=Object.fromEntries(['modeler','supervisor','reviewer'].map(role=>[role,usageTotals(usage.filter(u=>u.role===role).map(u=>u.value))]));
 const manifests=fs.readdirSync(directory).filter(n=>/^Serie-[a-f0-9-]{36}\.json$/.test(n)&&(!seriesId||n==='Serie-'+seriesId+'.json')).map(n=>JSON.parse(fs.readFileSync(path.join(directory,n),'utf8')));
 const report={format:'FormnaroTestLabReport',version:1,createdAt:new Date().toISOString(),summary,total,roles,reviews:includedReviews,unsettledRequests:chosen.reduce((n,r)=>n+(r.unsettledRequests??0),0)+includedReviews.reduce((n,r)=>n+(r.unsettledRequests??0),0),manifests,runs:chosen,limits:'Reported provider usage only; canceled requests may add unreported cost. Tariff estimate, not provider invoice. No cost saving claim without a valid counterfactual.'};
 const escape=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const fields=['seriesId','dataset','variant','effort','workflow','sceneScope','imageMode','stage','trials','preparationErrors','finished','checked','nativePassed','schemaValid','relevantProposals','medianMs','medianSuccessfulMs','medianPreviewMs','formatRepairs','timeouts','aborted','errors','supervisorJudgments','falseStops','correctStops','unknownStops'];
 const preparationErrors=summary.groups.reduce((n,g)=>n+(g.preparationErrors??0),0);
 const md='# Formnaro KI-Testlabor\n\n'+summary.warnings.join('\n\n')+'\n\n'+'Vorbereitungsfehler vor erster Modellanfrage: '+preparationErrors+'. Diese sind keine bewertete Modellierleistung.\n\n'+chosen.length+' Versuche; gemeldete Kosten '+total.min.toFixed(6)+'–'+total.max.toFixed(6)+' USD.\nModellieragent '+roles.modeler.min.toFixed(6)+'–'+roles.modeler.max.toFixed(6)+' USD; Versuchsleiter '+roles.supervisor.min.toFixed(6)+'–'+roles.supervisor.max.toFixed(6)+' USD; Abschlussauswerter '+roles.reviewer.min.toFixed(6)+'–'+roles.reviewer.max.toFixed(6)+' USD.\nAnfragen ohne Endverbrauch: '+report.unsettledRequests+'.\n\n| Serie | Kontext | Denken | Modus | Datensatz | Vollständig nativ richtig / Läufe | Schema gültig | Median s | Falsche Stopps / nicht beurteilbar |\n|---|---|---|---|---|---:|---:|---:|---|\n'+summary.groups.map(g=>'| '+[g.seriesId,g.variant,g.effort,g.workflow,g.dataset,g.nativePassed+' / '+g.finished,g.schemaValid,(g.medianMs/1000).toFixed(1),g.falseStops+' / '+g.unknownStops].join(' | ')+' |').join('\n')+'\n';
 const text=format==='json'?JSON.stringify(report,null,2):format==='md'?md:'\ufeff'+fields.join(';')+'\r\n'+summary.groups.map(g=>fields.map(f=>escape(g[f])).join(';')).join('\r\n');
 const file=path.join(directory,'Testlabor-'+(seriesId??'Gesamt')+'.'+format);fs.writeFileSync(file,text);return {path:file,summary,total,roles,unsettledRequests:report.unsettledRequests};
}
module.exports={labReport};
