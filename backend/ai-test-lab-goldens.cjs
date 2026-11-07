// Local verifier references only. Never add these solutions to model requests.
function goldenCommands(task,before,{mutation=false}={}){
 const s=task.geometry.scale,o=task.geometry.origin,position=v=>v.map((n,i)=>n*s+o[i]),size=v=>v.map(n=>n*s),target=before.scene.selectionTargets[0]?.rootId??before.scene.selection?.[0];
 if(task.id==='assembly')return [{op:'update',target,set:{size:size([14,14,80]),sizeAnchor:'center',...(mutation?{pos:position([-1,-1,40])}:{})}}];
 if(task.id==='drill')return [{op:'drill',target,reference:{ray:{origin:position([mutation?3:0,0,40]),direction:[0,0,-1]}},diameter:6*s,through:true}];
 if(task.id==='shell')return [{op:'create',type:'box',as:'cut',size:size([36,26,20]),pos:position([0,0,12]),solid:false},{op:'group',targets:[target,'$cut']}];
 if(task.id==='thread')return [{op:'delete',target},{op:'create',type:'thread',size:size([16,16,40]),pos:position([0,0,mutation?45:40]),params:{kind:'external',profile:'trapezoid',diameter:16*s,pitch:4*s,length:40*s,hand:'right',leadIn:0}},...[10,70].map(z=>({op:'create',type:'cylinder',size:size([16,16,20]),pos:position([0,0,z])}))];
 if(task.id==='pattern')return Array.from({length:5},(_,i)=>{const a=(i+1)*(mutation?Math.PI/4:Math.PI/3);return {op:'create',type:'cylinder',size:size([6,6,10]),pos:position([20*Math.cos(a),20*Math.sin(a),5])};});
 if(task.id==='sketch'){
  if(mutation)return [{op:'create',type:'box',as:'plate',size:size([40,30,5]),pos:position([0,0,2.5])},{op:'drill',target:'$plate',reference:{ray:{origin:position([0,0,40]),direction:[0,0,-1]}},diameter:10*s,through:true}];
  const corners=[[-20,-15],[20,-15],[20,15],[-20,15]].map(v=>v.map(n=>n*s)),elements=corners.map((start,i)=>({id:'e'+i,type:'line',start,end:corners[(i+1)%4]}));
  return [{op:'sketch',frame:[1,0,0,0,0,1,0,0,0,0,1,0,...o,1],sketch:{version:2,kind:'profile',variables:[],dimensions:{height:5*s},elements:[...elements,{id:'hole',type:'circle',center:[0,0],diameter:10*s}],loops:[{id:'outer',role:'outer',elements:elements.map(e=>e.id)},{id:'inner',role:'hole',elements:['hole']}]}}];
 }
 if(task.id==='drawing')return [{op:'drawing',action:'put',sheet:{id:'sheet',name:'Referenz',paper:'A4',orientation:'landscape',scale:1,titleBlock:{title:mutation?'Falscher Titel':task.geometry.title},views:['front','top','side'].map((kind,i)=>({id:kind,kind,sourceIds:[target],position:[50+i*65,80]})),annotations:[]}},{op:'drawing',action:'update',sheetId:'sheet'}];
 throw Error('Keine lokale Referenz für Aufgabe.');
}
module.exports={goldenCommands};
