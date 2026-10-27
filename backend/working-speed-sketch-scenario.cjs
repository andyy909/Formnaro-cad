// Work-only scenario for the root isolated Electron verification harness.
// executeJavaScript(setup), wait for layout, executeJavaScript(measureWheel).
// No profile data, disk writes or benchmark API in the shipped product.
exports.setup=`(async()=>{
 const a=window.__cadTest;
 await a.resetProject();a.workbenchUI.setMode('normal');
 const points=Array.from({length:128},(_,i)=>[Math.cos(i/128*2*Math.PI)*50,Math.sin(i/128*2*Math.PI)*50]);
 const elements=points.map((start,i)=>({id:'speed-line-'+i,type:'line',start:start.map(String),end:points[(i+1)%points.length].map(String),construction:false}));
 const sketch={version:2,kind:'profile',variables:[],dimensions:{height:'5'},elements,loops:[{id:'outer',role:'outer',elements:elements.map(e=>e.id)}]};
 await a.execute({kind:'batch',commands:[{op:'sketch',as:'speed',sketch}]});await a.settled();
 a.select([{rootId:a.getModel().nodes.at(-1).id,path:[]}]);await a.settled();a.sketchUI.open(true);
 document.getElementById('sketch-expand').click();
 window.__speedSketchConfirmed=a.serialize();window.__speedSketchDraft=JSON.stringify(a.sketchUI.state().sketch);
 return {elements:a.sketchUI.state().sketch.elements.length,svgChildren:document.getElementById('sketch-board').children.length};
})()`;

exports.measureWheel=`(()=>{
 const a=window.__cadTest,b=document.getElementById('sketch-board'),rect=b.getBoundingClientRect(),samples=[];
 function pair(){for(const deltaY of [2,-2])b.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,deltaY,cancelable:true}));}
 for(let i=0;i<8;i++)pair();
 for(let round=0;round<7;round++){const before=performance.now();for(let i=0;i<20;i++)pair();samples.push((performance.now()-before)/40);}
 samples.sort((a,b)=>a-b);
 if(a.serialize()!==window.__speedSketchConfirmed||JSON.stringify(a.sketchUI.state().sketch)!==window.__speedSketchDraft)throw Error('Sketch view benchmark changed geometry');
 return {operation:'128-line sketch wheel handler including SVG DOM replacement',millisecondsPerEvent:samples[3],samples,svgChildren:b.children.length,validatedModelUnchanged:true,draftUnchanged:true,note:'Synchronous event/DOM handler cost; excludes paint, compositor, GPU, native preview and actual input delivery.'};
})()`;

// For real mouse pan timing, set #sketch-tool to pan, dispatch a native
// mouseDown/mouseMove/mouseUp through win.webContents.sendInputEvent. The
// existing sketch-upgrade verifier already checks camera motion and no draft
// mutations. Wheel is directly benchmarkable without replacing pointer capture.
