export function mountSketchPractice({anchor,startPractice,cancelPractice,t,snapshot,show,restore}){
 const panel=document.createElement('details');
 panel.id='sketch-practice';
 const heading=document.createElement('summary');
 heading.textContent=t('Mit diesem Skizzenentwurf üben');
 const label=document.createElement('label');
 label.textContent=t('Was möchtest du an der Skizze üben?');
 const prompt=document.createElement('textarea');
 prompt.id='sketch-practice-prompt';
 prompt.rows=2;
 prompt.maxLength=4000;
 label.append(prompt);
 const actions=document.createElement('div');
 actions.className='ai-controls';
 const button=(id,label,run)=>{
  const element=document.createElement('button');
  element.type='button';
  element.id='sketch-practice-'+id;
  element.textContent=t(label);
  element.onclick=run;
  actions.append(element);
  return element;
 };
 const status=document.createElement('p');
 status.id='sketch-practice-status';
 status.setAttribute('role','status');
 const say=(text,error=false)=>{
  status.textContent=text;
  status.classList.toggle('ai-error',error);
 };
 let busy=false,requesting=false,disposed=false,result=null,reviewed=false;
 const start=button('start','Übung starten',()=>{
  const goal=prompt.value.trim();
  if(!goal){say(t('Zuerst ein Übungsziel eingeben.'),true);return;}
  void work(async()=>{
   reset();
   const draft=snapshot();
   requesting=true;
   update();
   say(t('Die Skizze wird in einem separaten Fenster vorgeführt …'));
   try{
    const reply=await startPractice(goal,draft);
    if(disposed){reply.release?.();return;}
    if(reply.review)result=reply;
    say(reply.message||(result?t('Die Übung ist abgeschlossen. Du kannst die Änderungen ansehen.'):t('Die Übung hat kein Ergebnis erzeugt.')));
   }finally{requesting=false;}
  });
 });
 const cancel=button('cancel','Übung abbrechen',()=>{
  Promise.resolve(cancelPractice()).catch(error=>say(error.message,true));
 });
 const review=button('review','Änderungen ansehen',()=>void work(async()=>{
  const proposal=await result.review();
  await show(proposal);
  if(disposed)return;
  reviewed=true;
  const part=proposal.practiceDelta.parts[0];
  const change=part.status==='added'?t('Neue Skizze'):t('Geänderte Skizze');
  const size=proposal.project.nodes.find(node=>node.id===part.id).recipe.size;
  apply.textContent=t(proposal.report?.featureDependencies?.requiresAcceptance?'Mit Folgeänderungen übernehmen':'Übernehmen');
  say(change+' · '+part.name+' · '+size.map(value=>Number(value.toFixed(3))).join(' × ')+' mm');
 }));
 const apply=button('apply','Übernehmen',()=>void work(async()=>{await result.apply();reset();}));
 const discard=button('discard','Verwerfen',()=>{
  reset();
  say(t('Die Übungsänderung wurde verworfen.'));
  update();
 });
 const update=()=>{
  start.disabled=busy;
  cancel.hidden=!requesting;
  review.hidden=!result||reviewed;
  apply.hidden=!reviewed;
  discard.hidden=!result;
  for(const control of [review,apply,discard])control.disabled=busy;
 };
 function reset(){
  if(reviewed)restore();
  result?.release();
  result=null;
  reviewed=false;
 }
 async function work(run){
  if(disposed||busy)return;
  busy=true;update();
  try{await run();}
  catch(error){
   if(error.code==='STALE_REVISION')reset();
   if(!disposed)say(error.message,true);
  }finally{busy=false;if(!disposed)update();}
 }
 panel.append(heading,label,actions,status);
 anchor.before(panel);
 update();
 return {dispose(){
  disposed=true;
  if(requesting)Promise.resolve(cancelPractice()).catch(()=>{});
  reset();
 }};
}
