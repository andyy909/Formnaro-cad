const labels={auto:['Automatisch · Modellstandard','Automatic · model default'],none:['none · Ohne Denkphase','none · No reasoning'],minimal:['minimal · Minimal','minimal · Minimal'],low:['low · Schnell','low · Fast'],medium:['medium · Ausgewogen','medium · Balanced'],high:['high · Gründlich','high · Thorough'],xhigh:['xhigh · Sehr gründlich','xhigh · Extra thorough'],max:['max · Maximal','max · Maximum']};
export function renderReasoningSelect(select,config,model,language='de'){
 const host=new URL(config.baseUrl).hostname,openai=host==='api.openai.com',mistral=host==='api.mistral.ai',deepseek=host==='api.deepseek.com',en=language==='en';
 const choices=deepseek?['low','high','max']:['auto',...(model?.reasoningEfforts||[])];
 select.replaceChildren();for(const value of choices)select.add(new Option(value==='enabled'?(en?'On · Reasoning enabled':'An · Mit Denkphase'):value==='disabled'?(en?'Off · Reasoning disabled':'Aus · Ohne Denkphase'):labels[value]?.[en?1:0]||value,value));
 const current=mistral?config.mistralReasoningEffort||'auto':openai?config.openAIReasoningEffort||'auto':deepseek?config.reasoningEffort||'high':config.providerReasoningEffort||'auto';
 if(choices.length&&!choices.includes(current)){const missing=new Option(current+(en?' · unavailable':' · nicht verfügbar'),current);missing.disabled=true;select.add(missing);}
 select.value=current;select.setAttribute('aria-label',en?'Reasoning effort':'Denkaufwand / Reasoning');
 const note=choices.length>1?(en?'Higher effort may take longer and use more allowance.':'Mehr Denkaufwand kann länger dauern und mehr Kontingent verbrauchen.'):(en?'Model default. No adjustable reasoning levels confirmed for this model and connection.':'Modellstandard. Für dieses Modell und diesen Zugang sind keine einstellbaren Denkstufen bestätigt.');select.title=note;
 return {visible:true,adjustable:choices.length>1||current!=='auto',note};
}
