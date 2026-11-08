// Deterministic local CAD references for verifier calibration, never sent to a provider.
const make=(type,size,pos,extra={})=>({op:'create',type,size,pos,...extra});
function referenceCommands(id,target,{wrong=false}={}){
 const cuts=[];
 if(id==='advanced-01')cuts.push(...[[wrong?-7:-8,-15,8],[24,-15,6],[10,6,10]].map(([x,y,d])=>make('cylinder',[d,d,12],[x,y,10],{solid:false})));
 if(id==='advanced-02')cuts.push(make('box',[18,12,10],[-10,-14,8],{solid:false}),make('box',[12,20,10],[wrong?26:24,-4,8],{solid:false}));
 if(id==='advanced-04')return [make('box',[20,40,16],[-10,-5,16],{as:'step'}),{op:'group',targets:[target,'$step'],as:'joined'},make('cylinder',[6,6,wrong?12:26],[-10,-5,12],{solid:false,as:'cut'}),{op:'group',targets:['$joined','$cut']}];
 if(id==='advanced-05')cuts.push(make('box',[54,34,28],[10,-5,20],{solid:false}),make('box',[10,wrong?50:8,12],[10,wrong?-5:-25,18],{solid:false}));
 if(id==='advanced-06')cuts.push(make('box',[20,16,wrong?10:8],[-5,-5,wrong?15:16],{solid:false}),make('cylinder',[8,8,12],[28,8,14],{solid:false}));
 if(cuts.length)return [...cuts.map((c,i)=>({...c,as:'cut'+i})),{op:'group',targets:[target,...cuts.map((_c,i)=>'$cut'+i)]}];
 if(id==='advanced-03'){
  const commands=[{op:'delete',target}];
  for(let i=0;i<8;i++){const radius=wrong?31:30,p=[7+radius*Math.cos(i*Math.PI/4),7+radius*Math.sin(i*Math.PI/4),9];commands.push(make('cylinder',[10,10,12],p,{as:'body'+i}),make('cylinder',[4,4,14],p,{as:'cut'+i,solid:false}),{op:'group',targets:['$body'+i,'$cut'+i]});}
  return commands;
 }
 if(id==='advanced-07'){
  const points=[[-30,-20],[30,-20],[30,5],[10,5],[10,20],[-30,20]].map(([x,y])=>[x+7,y-9]);
  const lines=points.map((start,i)=>({id:'e'+i,type:'line',start,end:points[(i+1)%points.length]}));
  const circles=[{id:'h1',type:'circle',center:[-8,-9],diameter:8},...wrong?[]:[{id:'h2',type:'circle',center:[22,-19],diameter:6}]];
  return [{op:'delete',target},{op:'sketch',name:'Aufgabenteil',as:'profile',sketch:{version:2,kind:'profile',variables:[],dimensions:{height:6},elements:[...lines,...circles],loops:[{id:'outer',role:'outer',elements:lines.map(e=>e.id)},...circles.map(c=>({id:c.id,role:'hole',elements:[c.id]}))]}},{op:'update',target:'$profile',set:{pos:[7,-9,7]}}];
 }
 throw Error('Keine geometrische Referenz für '+id);
}
function referenceSheet(target,{wrong=false}={}){
 return {id:'advanced-sheet',name:'Aufbauhalter',paper:'A3',orientation:'landscape',scale:wrong?1:.5,titleBlock:{title:'Aufbauhalter',number:'AB-08',revision:'B'},
  views:['front','top','side','section'].map((kind,i)=>({id:'view'+i,kind,sourceIds:[target],position:[[50,65],[50,125],[150,65],[150,125]][i],...(kind==='section'?{section:{axis:1,offset:-5}}:{})})),annotations:[]};
}
module.exports={referenceCommands,referenceSheet};
