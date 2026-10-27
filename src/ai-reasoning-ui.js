const labels={auto:['Automatisch · Modellstandard','Automatic · model default'],none:['none · Ohne Denkphase','none · No reasoning'],minimal:['minimal · Minimal','minimal · Minimal'],low:['low · Schnell','low · Fast'],medium:['medium · Ausgewogen','medium · Balanced'],high:['high · Gründlich','high · Thorough'],xhigh:['xhigh · Sehr gründlich','xhigh · Extra thorough'],max:['max · Maximal','max · Maximum']};
export function renderReasoningSelect(select,config,model,language='de'){
 const host=new URL(config.baseUrl).hostname,openai=host==='api.openai.com',deepseek=host==='api.deepseek.com',en=language==='en';
 const choices=deepseek?['low','high','max']:openai?['auto',...(model?.reasoningEfforts||[])]:[];
 select.replaceChildren();for(const value of choices)select.add(new Option(labels[value]?.[en?1:0]||value,value));
 const current=openai?config.openAIReasoningEffort||'auto':config.reasoningEffort||'high';
 if(choices.length&&!choices.includes(current)){const missing=new Option(current+(en?' · unavailable':' · nicht verfügbar'),current);missing.disabled=true;select.add(missing);}
 select.value=current;select.setAttribute('aria-label',en?'Reasoning effort':'Denkaufwand / Reasoning');
 select.title=en?'Higher effort may take longer and use more allowance.':'Mehr Denkaufwand kann länger dauern und mehr Kontingent verbrauchen.';
 return {visible:openai||deepseek,adjustable:choices.length>1||choices.length>0&&!choices.includes(current)};
}
