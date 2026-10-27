// Presentation only: keep the existing controls and event handlers.
export function createCadAIChatLayout(root,{language=()=> 'de'}={}){
 const en=()=>language()==='en',text=(de,english)=>en()?english:de;
 const find=id=>root.querySelector('#'+id),body=find('ai-chat-body');
 function group(id,label){const details=document.createElement('details'),summary=document.createElement('summary');details.id=id;details.className='ai-chat-category';summary.textContent=label;details.append(summary);return details;}
 const model=group('ai-chat-model-options',text('Modell & Einstellungen','Model & settings'));body.prepend(model);const pickerHost=document.createElement('div');pickerHost.id='ai-chat-model-picker-host';model.append(pickerHost);
 const tools=group('ai-chat-tools',text('Bilder, Bezüge & Sprache','Images, references & speech'));
 const toolActions=document.createElement('div');toolActions.className='ai-chat-tool-actions';
 for(const id of ['ai-chat-image','ai-chat-project-photos','ai-chat-features','ai-chat-model-image']){const control=find(id);if(control)toolActions.append(control);}
 tools.append(toolActions);find('ai-chat-prompt').before(tools);
 const usage=group('ai-chat-usage-details',text('Tokens & Versuche','Tokens & attempts'));
 const summary=usage.querySelector('summary');summary.id='ai-chat-usage-summary';summary.dataset.noTranslate='';
 find('ai-chat-usage').before(usage);usage.append(find('ai-chat-usage'),root.querySelector('.ai-chat-notice'));
 const expand=document.createElement('button');expand.id='ai-chat-expand';expand.type='button';expand.setAttribute('aria-controls','ai-chat-body');expand.setAttribute('aria-pressed','false');
 function setExpanded(value){root.classList.toggle('chat-expanded',value);expand.setAttribute('aria-pressed',String(value));expand.title=text(value?'Chat verkleinern':'Chat vergrößern',value?'Reduce chat':'Enlarge chat');expand.setAttribute('aria-label',expand.title);expand.textContent=value?'⤡':'⤢';}
 setExpanded(false);expand.onclick=()=>setExpanded(!root.classList.contains('chat-expanded'));find('ai-chat-toggle').after(expand);
 for(const category of [model,tools,usage])category.addEventListener('toggle',()=>{if(category.open){for(const other of [model,tools,usage])if(other!==category)other.open=false;if(root.getBoundingClientRect().height<420)setExpanded(true);}});
 // Speech mounts after the layout; move its existing node without recreating it.
 const observer=new MutationObserver(()=>{const select=find('ai-chat-model');model.querySelector('summary').title=select?.selectedOptions[0]?.textContent??'';const speech=root.querySelector('.speech-input');if(speech&&speech.parentElement!==tools)tools.append(speech);});
 observer.observe(root,{childList:true,subtree:true});
 return {setExpanded,setUsage(value,compact){find('ai-chat-usage').textContent=value;summary.textContent=compact||text('Tokens & Versuche','Tokens & attempts');},dispose(){observer.disconnect();setExpanded(false);}};
}
