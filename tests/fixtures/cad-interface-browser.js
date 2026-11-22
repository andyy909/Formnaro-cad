import '../../src/style.css';
import '../../src/settings.css';
import {createCadController} from '../../src/cad-controller.js';
import {createCadInterface} from '../../src/cad-interface.js';
import {createCadToolsUI} from '../../src/cad-tools-ui.js';
import {CAD_SHAPES} from '../../src/cad-shapes.js';
import {CAD_QUALITY_DEFAULTS,validateCadQuality} from '../../src/cad-quality.js';
import {DEFAULTS} from '../../src/preferences.js';
import {CAD_LIBRARY_KEY} from '../../src/cad-persistence.js';
import {cadFormLocalDimensions} from '../../src/cad-interface-state.js';
const $=id=>document.getElementById(id);
const check=(value,message)=>{if(!value)throw Error(message);};
const near=(a,b,e=1e-5)=>check(Math.abs(a-b)<=e,`${a} vs ${b}`);
window.runCadInterfaceProof=async({finishStepsOnly=false}={})=>{
  const messages=[],jobs=new Set(),reads=[],writes=[],values=new Map([['offlinecad-library-v1','poisoned-old-mesh-library']]),storage={getItem:key=>(reads.push(key),values.get(key)??null),setItem:(key,value)=>{writes.push(key);values.set(key,value);}},customPack={format:'OfflineCAD-Plugin',version:1,id:'browser',name:'Browser CAD Pack',shapes:[{id:'bored',name:'CAD cylinder with original hole',nodes:[{type:'cylinder',size:[16,16,8]},{type:'cylinder',size:[4,4,10],solid:false}]}]};
  let selection=[],scene={objects:[]},preferences={...DEFAULTS},quality=structuredClone(CAD_QUALITY_DEFAULTS),plugins=[],ui,tools,workers=0,mounts=[];
  const controller=createCadController({createWorker:()=>{workers++;return new Worker(new URL('../../src/cad-worker.js',import.meta.url),{type:'module'});},onChange:()=>ui?.refresh()});
  const safe=fn=>{try{const promise=Promise.resolve(fn()).catch(error=>{messages.push(error.message);});jobs.add(promise);promise.finally(()=>jobs.delete(promise));return promise;}catch(error){messages.push(error.message);}};
  const sync=async()=>{while(jobs.size)await Promise.all([...jobs]);scene=await controller.query('scene');ui?.refresh();};
  const execute=async(operation,options)=>{const result=await controller.execute(operation,options);scene=await controller.query('scene');ui?.refresh();return result;};
  const mutate=async(fn,label)=>{const draft=controller.snapshot();await fn(draft);const proposal=await controller.preview(undefined,{project:draft,label}),result=controller.apply(proposal);scene=await controller.query('scene');ui?.refresh();return result;};
  const select=(targets,append=false)=>{selection=append?[...selection,...targets]:targets;ui?.refresh();};
  const modal=(title,html)=>{$('modal-title').textContent=title;$('modal-body').innerHTML=html;if(!$('modal').open)$('modal').showModal();};
  const add=async type=>{await execute({kind:'batch',commands:[{op:'create',type,as:'created'}]});select([{rootId:controller.snapshot().nodes.at(-1).id,path:[]}]);};
  const input=async(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new Event('change'));$(id).dispatchEvent(new Event('blur'));await sync();};
  ui=createCadInterface({controller,storage,getPreferences:()=>({...preferences}),setPreferences:next=>{preferences=next;ui.refresh();},getPlugins:()=>structuredClone(plugins),setPlugins:next=>{plugins=next;ui.refresh();},getSelection:()=>structuredClone(selection),select,getScene:()=>scene,execute,mutate,modal,safe,toast:()=>{},download:()=>{},fit:()=>{},onFinishStep:(bodyId,stepId)=>tools.openEdges('round',{bodyId,stepId}),onAddShape:add,onAddPlugin:async(manifest,shapeId)=>{await execute({kind:'plugin',manifest,shapeId});select([{rootId:controller.snapshot().nodes.at(-1).id,path:[]}]);},mountAI:root=>mounts.push(root.id),mountLayout:root=>mounts.push(root.id),getQuality:()=>structuredClone(quality),setQuality:next=>{quality=validateCadQuality(next);}});
  const toolHost=document.createElement('div'),toolCanvas=document.createElement('canvas');
  toolCanvas.hidden=true;toolHost.append(toolCanvas);document.body.append(toolHost);
  tools=createCadToolsUI({controller,view:{canvas:toolCanvas,allows:()=>true,setEdges:()=>{},setInteraction:()=>{},clearPreview:()=>{},setPreview:()=>{},restoreView:()=>{},clearSource:()=>{},invalidate:()=>{},projectPoint:value=>value,camera:()=>null,fit:()=>{},groups:{measurements:{children:[]}}},marksView:{clearPreview:()=>{},draw:()=>{}},getSelection:()=>structuredClone(selection),getScene:()=>scene,select,execute,mutate,modal,safe,toast:()=>{},download:()=>{},getQuality:()=>structuredClone(quality.display),storage});
  try{
    if (finishStepsOnly) {
      const finishBodyId = 'finish-tree-body';
      await execute({
        kind: 'create',
        recipe: { type: 'cylinder', size: [30, 30, 20] },
        options: { id: finishBodyId, name: 'K02-Zylinder' },
      });
      for (const [stepId, rim, amount] of [
        ['round-top', 'cylinder-rim-top', 3],
        ['round-bottom', 'cylinder-rim-bottom', 1.5],
      ]) {
        const { edges } = await controller.query('edges', { nodeId: finishBodyId });
        const edge = edges.find((entry) => entry.reference.origin.featureId === rim);
        check(edge, 'Native cylinder rim: ' + rim);
        await execute({
          kind: 'finish',
          target: finishBodyId,
          step: { id: stepId, kind: 'round', amount, edges: [edge.reference] },
        });
      }
      const neighborId = 'finish-tree-neighbor';
      await execute({
        kind: 'create',
        recipe: { type: 'cylinder', size: [20, 20, 20] },
        options: { id: neighborId, name: 'K02-Zylinder' },
      });
      await controller.open(controller.serialize());
      let finishRow = document.querySelector(`[data-root-id="${finishBodyId}"][data-path="[]"]`);
      const findNeighbor = () => document.querySelector(`[data-root-id="${neighborId}"][data-path="[]"]`);
      check(finishRow && findNeighbor(), 'Both same-named cylinders have their own object-tree row');
      const finishRevision = controller.revision(),
        finishUndo = controller.state().undo;
      finishRow.click();
      const finishSteps = ui.getSelectedFinishSteps();
      check(
        JSON.stringify(finishSteps) === JSON.stringify([
          { bodyId: finishBodyId, stepId: 'round-top', kind: 'round', amount: 3 },
          { bodyId: finishBodyId, stepId: 'round-bottom', kind: 'round', amount: 1.5 },
        ]),
        'Selected body exposes both saved rounds in operation order',
      );
      finishRow = document.querySelector(`[data-root-id="${finishBodyId}"][data-path="[]"]`);
      let stepRows = [...document.querySelectorAll('.finish-step-item')];
      check(stepRows.length === 2, 'Selected body shows two separate step rows');
      check(
        finishRow?.nextElementSibling === stepRows[0] && stepRows[0].nextElementSibling === stepRows[1],
        'Both step rows sit directly under their body in saved order',
      );
      check(
        stepRows.every((row) => row.dataset.finishBodyId === finishBodyId),
        'Step rows carry their body identity',
      );
      const finishStepIds = stepRows.map((row) => row.dataset.finishStepId);
      check(
        JSON.stringify(finishStepIds) === JSON.stringify(['round-top', 'round-bottom']) &&
          new Set(stepRows.map((row) => row.dataset.treeKey)).size === 2,
        'Each step row carries a different saved step ID',
      );
      const stepLabels = stepRows.map((row) => row.querySelector('.object-label')?.textContent);
      check(
        stepLabels[0] && stepLabels.every((label) => label === stepLabels[0]),
        'Equal labels do not merge the step rows',
      );
      findNeighbor().dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      check(ui.getSelectedFinishSteps().length === 0, 'Multiple selected bodies yield no finish steps');
      check(
        document.querySelectorAll('.finish-step-item').length === 0,
        'Multiple selection shows no foreign step rows',
      );
      findNeighbor().click();
      check(ui.getSelectedFinishSteps().length === 0, 'Same-named neighbor has no finish steps');
      check(
        document.querySelectorAll('.finish-step-item').length === 0,
        'Same-named neighbor shows no foreign step rows',
      );
      check(
        controller.revision() === finishRevision && controller.state().undo === finishUndo,
        'Read-only finish-step lookup leaves revision and Undo unchanged',
      );
      check(messages.length === 0, 'No object-tree errors: ' + JSON.stringify(messages));
      finishRow = document.querySelector(`[data-root-id="${finishBodyId}"][data-path="[]"]`);
      finishRow.click();
      stepRows = [...document.querySelectorAll('.finish-step-item')];
      check(
        JSON.stringify(stepRows.map((row) => row.dataset.finishStepId)) === JSON.stringify(finishStepIds),
        'Reselecting the body restores the same two row identities',
      );
      const openedRevision = controller.revision(), openedUndo = controller.state().undo, projectBeforeEditor = controller.serialize();
      stepRows[1].click();
      await sync();
      const editor = tools.state(),
        editorPanel = document.getElementById('cad-tools-panel');
      check(
        editor?.kind === 'edges' &&
          editor.nodeId === finishBodyId &&
          editor.bodyId === finishBodyId &&
          editor.stepId === 'round-bottom' &&
          editor.stepKind === 'round' &&
          Math.abs(editor.stepAmount - 1.5) < 1e-9,
        'Second saved step opens the existing edge editor with body and step identity',
      );
      check(
        editorPanel && !editorPanel.hidden &&
          editorPanel.dataset.edgeBodyId === finishBodyId &&
          editorPanel.dataset.edgeStepId === 'round-bottom' &&
          Math.abs(Number(editorPanel.dataset.edgeStepAmount) - 1.5) < 1e-9 &&
          /1[,.]5 mm/.test(editorPanel.querySelector('[data-edge-saved]').textContent),
        'Saved step shows the round-bottom measure 1,5 mm instead of round-top 3 mm',
      );
      check(
        !editorPanel.querySelector('[data-edge-preview], [data-edge-apply], [data-edge-remove]'),
        'Saved-step context contains no change, apply or remove action',
      );
      check(
        document.querySelectorAll('#cad-tools-panel').length === 1,
        'The existing edge editor is reused instead of a second editor',
      );
      check(tools.practiceEdgeState() === null, 'Saved step does not start edge selection');
      for (const remove of [false, true]) {
        await tools.previewEdges(remove).then(
          () => { throw Error('Saved-step context allowed preview'); },
          error => check(/zur Ansicht geöffnet/.test(error.message), 'Saved-step write rejected before preview'),
        );
      }
      check(
        controller.revision() === openedRevision && controller.state().undo === openedUndo,
        'Opening the saved step changes neither revision nor Undo',
      );
      editorPanel.querySelector('[data-edge-close]').click();
      await sync();
      check(tools.state() === null, 'Closing the saved-step editor clears its state');
      check(
        controller.revision() === openedRevision && controller.state().undo === openedUndo,
        'Closing the saved-step editor changes neither revision nor Undo',
      );
      await tools.openEdges('round');
      check(
        tools.state()?.kind === 'edges' &&
          tools.state()?.nodeId === finishBodyId &&
          tools.state()?.stepId === null,
        'Normal new edge command opens without a saved-step identity',
      );
      check(
        controller.revision() === openedRevision && controller.state().undo === openedUndo,
        'Normal new edge command opening remains read-only',
      );
      tools.close();
      await sync();
      check(controller.serialize() === projectBeforeEditor, 'Opening and closing the editor leaves the model unchanged');
      check(messages.length === 0, 'No saved-step editor errors: ' + JSON.stringify(messages));
      return {
        ready: true,
        finishSteps,
        finishStepIds,
        neighborId,
        finishRevision,
        finishUndo,
        openedStep: {
          bodyId: editor.bodyId,
          stepId: editor.stepId,
          stepKind: editor.stepKind,
          stepAmount: editor.stepAmount,
        },
        projectText: controller.serialize(),
      };
    }
    check(document.querySelectorAll('.shape-tile').length===23,'Palette count');check($('shape-count').textContent==='23','Shape count');
    document.querySelector('[data-type="box"]').click();await sync();const boxId=selection[0].rootId;check(controller.snapshot().nodes[0].name===CAD_SHAPES[0].name,'Original shape name');
    await mutate(draft=>{draft.nodes[0].transform=[-1.5,.2,0,0,.3,1.1,0,0,.1,.15,1.2,0,8,-3,15,1];},'Isolated affine placement');
    const resizeUndo=controller.state().undo;await input('size-0',35);check(controller.state().undo===resizeUndo+1,'Blur/change produces one native commit');near(cadFormLocalDimensions(controller.snapshot().nodes[0])[0],35);
    const old=controller.snapshot().nodes[0].transform,gram=matrix=>[0,1,2].flatMap(a=>[0,1,2].map(b=>[0,1,2].reduce((sum,row)=>sum+matrix[a*4+row]*matrix[b*4+row],0)));await input('rot-2',25);gram(old).forEach((v,i)=>near(v,gram(controller.snapshot().nodes[0].transform)[i]));
    await input('object-notes','Browser native metadata');await input('object-opacity',65);check(controller.snapshot().nodes[0].metadata.notes==='Browser native metadata','Notes');near(controller.snapshot().nodes[0].opacity,.65);
    await execute({kind:'batch',commands:[{op:'create',type:'box',size:[30,30,10],as:'outer'},{op:'create',type:'polygon',size:[8,8,14],params:{sides:8},solid:false,as:'hole'},{op:'group',targets:['$outer','$hole'],as:'group',name:'Native source group'}]});
    const group=controller.snapshot().nodes.at(-1),hole=group.children.find(node=>!node.solid),target={rootId:group.id,path:[hole.id]};select([target]);check(!$('history-panel').hidden&&$('history-path').textContent.includes('Native source group'),'Source inspector breadcrumb');check(!$('resolution-panel').hidden,'Polygon control visible');const groupVolume=group.stats.volume;
    await input('segments',3);check(controller.snapshot().nodes.at(-1).children.find(node=>node.id===hole.id).recipe.params.sides===3,'Polygon source edit');check(Math.abs(controller.snapshot().nodes.at(-1).stats.volume-groupVolume)>1,'Native grouped hole rebuild');
    $('history-suppress').checked=true;$('history-suppress').dispatchEvent(new Event('change'));await sync();near(controller.snapshot().nodes.at(-1).stats.volume,9000);$('history-done').click();check(selection[0].path.length===0,'Return to finished root');
    document.querySelector('[data-type="text"]').click();await sync();const textId=selection[0].rootId;await input('shape-text','O');await input('text-font','serif');const text=controller.snapshot().nodes.at(-1);check(text.recipe.topologyCertified&&text.recipe.font==='serif'&&text.recipe.contours.reduce((sum,c)=>sum+c.holes.length,0)===1,'Original font O hole');check($('resolution-panel').hidden,'No curved primitive tessellation parameter');
    ui.openLibrary();$('library-save').click();$('template-name').value='Native O template';$('template-save').click();await sync();check(values.has(CAD_LIBRARY_KEY),'Separate CAD library key');check(!reads.includes('offlinecad-library-v1'),'Old mesh library untouched');const template=ui.library.persistence.listTemplates()[0],nodesBefore=controller.snapshot().nodes.length;await ui.library.insert(template.id);await sync();check(controller.snapshot().nodes.length===nodesBefore+1,'Native template insert');check(controller.snapshot().nodes.at(-1).id!==textId,'Fresh template IDs');check(controller.snapshot().nodes.at(-1).recipe.contours[0].holes.length===1,'Template original holes preserved');
    await execute({kind:'batch',commands:[{op:'create',type:'box',size:[40,40,10],name:'Formula body',as:'body'},{op:'create',type:'cylinder',size:[6,6,14],name:'Formula hole',solid:false,as:'hole'},{op:'group',targets:['$body','$hole'],name:'Formula group',as:'group'}]});const formulaGroup=controller.snapshot().nodes.at(-1);select([{rootId:formulaGroup.id,path:[]}]);ui.openLibrary();$('library-save').click();$('template-name').value='Formula hole template';$('template-control-add').click();const control=$('template-controls').firstElementChild;control.querySelector('[aria-label="Parametername"]').value='diameter';control.querySelector('[aria-label="Standardmaß"]').value='8';
    const bindDiameter=(row,axis)=>{const target=row.querySelector('select'),option=[...target.options].find(option=>option.textContent==='Formula hole · size.'+axis);check(option,'Formula hole binding target');target.value=option.value;row.querySelector('[aria-label="Maßformel"]').value='diameter';};bindDiameter($('template-bindings').firstElementChild,0);$('template-binding-add').click();bindDiameter($('template-bindings').lastElementChild,1);$('template-save').click();await sync();const formulaEntry=ui.library.persistence.listTemplates().find(item=>item.name==='Formula hole template');check(formulaEntry.controls[0].name==='diameter'&&formulaEntry.bindings.length===2,'Template editor stores controls and multiple formulas');ui.library.insert(formulaEntry.id);$('template-values').querySelector('input').value='10';const formulaUndo=controller.state().undo;$('template-insert').click();await sync();const formulaInstance=controller.snapshot().nodes.at(-1);near(formulaInstance.stats.volume,16000-Math.PI*25*10);near(cadFormLocalDimensions(formulaInstance.children.find(node=>!node.solid))[0],10);check(controller.state().undo===formulaUndo+1,'Parametric template insert is one native Undo');
    $('layer-add').click();$('container-name').value='Native Layer';$('container-confirm').click();await sync();const layerId=controller.snapshot().activeLayerId;select([{rootId:boxId,path:[]}]);$('container-assign').click();await sync();check(controller.snapshot().nodes.find(node=>node.id===boxId).layerId===layerId,'Layer assignment');const lockButton=document.querySelector(`[data-container-id="${layerId}"]`).querySelectorAll('button')[1];lockButton.click();await sync();check($('size-0').disabled,'Inherited layer lock disables inspector');lockButton.isConnected||check(true,'old DOM removed');await mutate(draft=>{draft.layers.find(layer=>layer.id===layerId).locked=false;},'Isolated layer unlock');
    const tile=document.querySelector('[data-type="cylinder"]');tile.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));await sync();$('favorites-only').click();check(document.querySelectorAll('.shape-tile').length===1,'Palette favorites preserved');$('favorites-only').click();
    $('settings-open').click();check(!document.getElementById('settings-segments'),'Settings has separate CAD quality');check(mounts.includes('ai-settings-page')&&mounts.includes('layout-settings-page'),'AI and layout mounts');const revision=controller.revision(),undo=controller.state().undo;await input('settings-export-deflection',.005);check(controller.revision()===revision&&controller.state().undo===undo&&quality.export.deflection===.005&&quality.display.deflection===.02,'Display/export quality does not modify CAD model');
    const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(customPack)],'isolated.ocplugin',{type:'application/json'}));ui.settings.file.files=transfer.files;ui.settings.file.dispatchEvent(new Event('change'));await sync();check(plugins.length===1&&document.querySelectorAll('.plugin-shape').length===1,'Native validated local pack loads');$('settings-done').click();document.querySelector('.plugin-shape').click();await sync();const packed=controller.snapshot().nodes.at(-1);check(packed.metadata.plugin.id==='browser'&&packed.children.length===2,'Plugin metadata and editable sources');near(packed.stats.volume,Math.PI*(64-4)*8);
    await mutate(draft=>{draft.nodes.push({id:'isolated-browser-reference',kind:'referenceMesh',name:'Original reference',transform:[-1.2,.1,0,0,.3,.8,0,0,.1,.2,1.1,0,3,5,8,1],mesh:{verts:[-2,-3,-1,2,-3,-1,-2,3,1],triangles:[0,1,2]}});},'Isolated reference import');select([{rootId:'isolated-browser-reference',path:[]}]);check(!$('size-0').disabled&&!$('pos-0').disabled&&!$('rot-2').disabled,'Reference inspector editable');check($('solid-btn').disabled&&$('hole-btn').disabled&&$('shape-parameters').hidden&&$('text-panel').hidden,'Reference excludes CAD construction controls');const refBefore=controller.snapshot().nodes.at(-1),refGram=gram(refBefore.transform);await input('rot-2',35);refGram.forEach((value,i)=>near(value,gram(controller.snapshot().nodes.at(-1).transform)[i]));await input('pos-0',25);await input('size-0',12);const refAfter=controller.snapshot().nodes.at(-1);near(cadFormLocalDimensions(refAfter)[0],12);check(refAfter.kind==='referenceMesh'&&!refAfter.brep&&!refAfter.recipe,'Reference transform creates no CAD recipe');check(JSON.stringify(refAfter.mesh)===JSON.stringify(refBefore.mesh),'Reference retains original triangles');await ui.actions.hide();await sync();check(controller.snapshot().nodes.at(-1).hidden,'Reference hide');await ui.actions.lock();await sync();check(controller.snapshot().nodes.at(-1).locked&&$('size-0').disabled,'Reference lock');await controller.preview({kind:'batch',commands:[{op:'group',targets:['isolated-browser-reference',boxId]}]}).then(()=>{throw Error('Reference entered CAD group');},error=>check(/Netz|Referenz|CAD/.test(error.message),'Explicit reference CAD rejection'));
    check(messages.length===0,'No UI operation failures: '+JSON.stringify(messages));check(workers===1,'One persistent CAD worker');check(!controller.serialize().includes('"vertices"'),'Confirmed state no display buffers');select([{rootId:packed.id,path:[]}]);ui.refresh();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {ready:true,palette:23,workers,sourceEdits:true,affineRetained:true,originalTextHole:true,originalTemplateHole:true,templateFormulas:true,referenceInspector:true,organization:true,independentQuality:true,validatedPlugin:true,oldMeshLibraryRead:false,nodes:controller.snapshot().nodes.length,undo:controller.state().undo,storageKeys:[...values.keys()],messages};
  }finally{ui.dispose();controller.dispose();}
};
