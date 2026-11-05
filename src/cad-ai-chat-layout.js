// Presentation only: keep the existing controls and event handlers.
export function createCadAIChatLayout(root,{language=()=> 'de'}={}){
 const en=()=>language()==='en',text=(de,english)=>en()?english:de;
 const find=id=>root.querySelector('#'+id);
 const trigger=document.createElement('button');
 trigger.id='ai-chat-options';trigger.type='button';trigger.textContent='⚙';
 trigger.title=text('Chat-Einstellungen','Chat settings');
 trigger.setAttribute('aria-label',trigger.title);
 trigger.setAttribute('aria-haspopup','dialog');
 trigger.setAttribute('aria-controls','ai-chat-options-dialog');
 root.querySelector('.ai-chat-heading').append(trigger);
 const dialog=document.createElement('dialog');
 dialog.id='ai-chat-options-dialog';dialog.className='ai-chat-options-dialog';
 dialog.setAttribute('aria-labelledby','ai-chat-options-title');
 dialog.innerHTML=`<header><h2 id="ai-chat-options-title">${trigger.title}</h2><button type="button" data-close-options aria-label="${text('Schließen','Close')}">×</button></header><div class="ai-chat-options-content"></div>`;
 root.append(dialog);
 const content=dialog.querySelector('.ai-chat-options-content');
 const columns=Array.from({length:2},()=>document.createElement('div'));
 content.append(...columns);
 const close=()=>{if(dialog.open)dialog.close();};
 trigger.onclick=()=>{if(!dialog.open)dialog.showModal();};
 dialog.querySelector('[data-close-options]').onclick=close;
 function section(id,label,column=0){
  const section=document.createElement('section'),heading=document.createElement('h3');
  section.id=id;heading.textContent=label;section.append(heading);columns[column].append(section);return section;
 }
 const models=section('ai-chat-model-picker-host',text('Modell, Denkaufwand & Zugang','Model, reasoning effort & connection'));
 models.append(find('ai-chat-settings'));
 section('ai-chat-model-options',text('Aufträge, Agent & Modellprüfungen','Tasks, agent & model checks'),1);
 const tools=section('ai-chat-tools',text('Anhänge, Übung & Sprache','Attachments, practice & speech'));
 const toolActions=document.createElement('div');toolActions.className='ai-chat-tool-actions';
 for(const id of ['ai-chat-image','ai-chat-project-photos','ai-chat-features','ai-chat-model-image','ai-chat-practice','ai-chat-practice-files']){
  const control=find(id);if(control)toolActions.append(control);
 }
 const projectPractice=find('ai-chat-practice-from-project');
 tools.append(toolActions);
 if(projectPractice)tools.append(projectPractice.closest('label'));
 const view=section('ai-chat-view-options',text('Chat & Ansicht','Chat & view'),1);
 const viewActions=document.createElement('div');viewActions.className='ai-chat-tool-actions';
 viewActions.append(find('ai-chat-new'),find('ai-chat-workshop'));view.append(viewActions);
 const usage=document.createElement('details'),summary=document.createElement('summary');
 usage.id='ai-chat-usage-details';summary.id='ai-chat-usage-summary';summary.dataset.noTranslate='';
 summary.textContent=text('Tokens & Versuche','Tokens & attempts');
 usage.append(summary,find('ai-chat-usage'));view.append(usage,root.querySelector('.ai-chat-notice'));
 // Return to the composer before actions that type there or open another workspace.
 const returnToChat=new Set(['ai-chat-new','ai-chat-workshop','ai-chat-settings','ai-chat-practice','ai-chat-image','ai-chat-project-photos','ai-chat-features','ai-chat-model-image','ai-chat-practice-files','ai-chat-windows-dictation','ai-chat-focus','ai-chat-expand']);
 dialog.addEventListener('click',event=>{
  if(returnToChat.has(event.target.closest('button')?.id))close();
 },true);
 const expand=document.createElement('button');expand.id='ai-chat-expand';expand.type='button';expand.setAttribute('aria-controls','ai-chat-body');expand.setAttribute('aria-pressed','false');
 function setExpanded(value){root.classList.toggle('chat-expanded',value);expand.setAttribute('aria-pressed',String(value));expand.title=text(value?'Chat verkleinern':'Chat vergrößern',value?'Reduce chat':'Enlarge chat');expand.setAttribute('aria-label',expand.title);expand.textContent=expand.title;}
 const focus=document.createElement('button');focus.id='ai-chat-focus';focus.type='button';focus.textContent=text('Fokus','Focus');focus.title=text('Arbeitsfläche und Chat nebeneinander','Show workspace and chat side by side');viewActions.append(focus);
 let manualFocus=false,working=false;
 function updateFocus(){const active=manualFocus||working;root.classList.toggle('chat-focus',active);focus.setAttribute('aria-pressed',String(active));}
 focus.onclick=()=>{manualFocus=!root.classList.contains('chat-focus');working=false;if(manualFocus)setExpanded(false);updateFocus();};
 updateFocus();
 setExpanded(false);expand.onclick=()=>{manualFocus=working=false;updateFocus();setExpanded(!root.classList.contains('chat-expanded'));};viewActions.append(expand);
 return {close,dialog,tools,toolActions,setExpanded,setWorking(value){if(value&&!working)setExpanded(false);working=value;updateFocus();},clearFocus(){manualFocus=working=false;updateFocus();},setUsage(value,compact){find('ai-chat-usage').textContent=value;summary.textContent=compact||text('Tokens & Versuche','Tokens & attempts');},dispose(){close();setExpanded(false);}};
}
