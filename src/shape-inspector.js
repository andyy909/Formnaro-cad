import {SCHEMAS,defaults,parameters,parameterNote,GENERATORS,validParameters} from './parameters.js';
export function createShapeInspector({getSelection,mutate,safe,fitParameters,isLocked=n=>n.locked}){
  const root=document.getElementById('shape-parameters'),fields=document.createElement('div'),note=document.createElement('p'),buttons=document.createElement('div');
  root.append(fields,note,buttons);note.className='small-note';buttons.className='two-buttons';
  const reset=document.createElement('button'),original=document.createElement('button');reset.textContent='Parameter zurücksetzen';original.textContent='Originalgröße';buttons.append(reset,original);
  let signature='',inputs=new Map(),rows=new Map();
  function selected(){const list=getSelection();if(list.length!==1||isLocked(list[0]))throw new Error('Eine einzelne entsperrte Grundform auswählen.');return list[0];}
  function change(key,value){const n=selected(),p=parameters(n);if(value===p[key]&&n.params)return;
    const params={...p,[key]:value};if(!validParameters({...n,params}))throw new Error('Der Parameter liegt außerhalb des zulässigen Bereichs.');
    return mutate(()=>{n.params=params;if(n.type==='torus'&&key==='wall')n.size[2]=value;fitParameters(n);if(key==='kind')n.solid=value!=='cutter';});
  }
  reset.onclick=()=>safe(()=>{const n=selected();return mutate(()=>{n.params=defaults(n.type);fitParameters(n);if(n.type==='thread'||n.type==='nut')n.solid=n.params.kind!=='cutter';});});
  original.onclick=()=>safe(()=>{const n=selected();return mutate(()=>fitParameters(n));});
  function refresh(){
    const list=getSelection(),n=list[0],schema=n&&!n.mesh&&SCHEMAS[n.type];root.hidden=list.length!==1||!schema;if(root.hidden)return;
    const key=n.id+':'+n.type;
    if(signature!==key){signature=key;inputs.clear();rows.clear();fields.replaceChildren();
      const title=document.createElement('div');title.className='section-title';title.textContent='Formparameter';fields.append(title);
      if(n.type==='thread'||n.type==='nut'){
        const presets=document.createElement('select');presets.id='thread-preset';presets.setAttribute('aria-label','Metrische Gewindevorlage');presets.append(new Option('Metrische Vorlage wählen …',''));
        for(const [dia,pitch]of [[3,.5],[4,.7],[5,.8],[6,1],[8,1.25],[10,1.5],[12,1.75],[16,2],[20,2.5],[24,3]])presets.append(new Option(`M${dia} × ${String(pitch).replace('.',',')}`,`${dia}:${pitch}`));
        presets.disabled=isLocked(n);presets.onchange=()=>safe(()=>{if(!presets.value)return;const current=selected(),[diameter,pitch]=presets.value.split(':').map(Number);return mutate(()=>{current.params={...parameters(current),diameter,pitch,profile:'metric',depth:0,crest:.125,outerDiameter:diameter*1.9,headDiameter:diameter*1.65};fitParameters(current);});presets.value='';});fields.append(presets);
      }
      const advanced=document.createElement('details');advanced.className='advanced-parameters';const summary=document.createElement('summary');summary.textContent='Weitere Parameter';advanced.append(summary);const basic=new Set(n.type==='gear'?['teeth','module','thickness','bore','backlash']:['kind','diameter','pitch','length','clearance','outerDiameter']);if(schema.length>8)fields.append(advanced);
      for(const f of schema){const row=document.createElement('label');row.className='parameter-row';const text=document.createElement('span');text.textContent=f.label+(f.unit?` (${f.unit})`:'');row.append(text);let input;
        if(f.options){input=document.createElement('select');for(const [v,label]of f.options)input.append(new Option(label,v));}
        else {input=document.createElement('input');input.type='text';input.inputMode='decimal';input.title=`${f.min} bis ${f.max}${f.unit?' '+f.unit:''}`;}
        input.id='param-'+f.key;input.dataset.parameter=f.key;input.setAttribute('aria-label',f.label);input.onfocus=()=>input.select?.();if(!f.options)input.onclick=()=>input.select();
        const commit=()=>{const value=f.options?input.value:Number(input.value.trim().replace(',','.'));if(!f.options&&!input.value.trim()){input.value=String(parameters(selected())[f.key]);return;}try{return change(f.key,value);}catch(e){input.value=String(parameters(selected())[f.key]);refresh();throw e;}};
        input.onchange=()=>safe(commit);if(!f.options){input.onblur=()=>safe(commit);input.onkeydown=e=>{if(e.key==='Enter'){input.blur();}if(e.key==='Escape'){input.value=String(parameters(selected())[f.key]);input.blur();e.stopPropagation();}};}
        row.append(input);(schema.length>8&&!basic.has(f.key)?advanced:fields).append(row);inputs.set(f.key,input);rows.set(f.key,row);
      }
    }
    const p=parameters(n);
    const preset=document.getElementById('thread-preset');if(preset)preset.disabled=isLocked(n);
    for(const [key,input]of inputs){if(document.activeElement!==input)input.value=String(p[key]).replace('.',document.documentElement.lang==='de'?',':'.');input.disabled=isLocked(n)||(key==='flankAngle'&&p.profile!=='custom');
      const irrelevant=(['edgeSize','edgeScope','edgeSteps'].includes(key)&&p.edgeStyle==='none')||(key==='edgeSteps'&&p.edgeStyle!=='round')||(['outerShape','outerDiameter'].includes(key)&&p.kind!=='nut')||(['head','bore'].includes(key)&&['thread','nut'].includes(n.type)&&p.kind!=='external')||(['headDiameter','headHeight'].includes(key)&&(p.kind!=='external'||p.head==='none'));
      rows.get(key).hidden=irrelevant;
    }
    let text=parameterNote(n);if(GENERATORS.has(n.type)&&n.parameterSize&&n.size.some((v,i)=>Math.abs(v-n.parameterSize[i])>.001))text+=' Aktuell skaliert: „Originalgröße“ stellt die berechneten Maße wieder her.';
    if(!n.params&&n.type==='gear')text='Altes dekoratives Zahnrad. Eine Parameteränderung ersetzt es durch den Evolventen-Generator. '+text;
    note.textContent=document.documentElement.lang==='de'?text.replace(/(\d)\.(\d)/g,'$1,$2'):text;reset.disabled=isLocked(n);original.disabled=isLocked(n);original.hidden=!GENERATORS.has(n.type);
  }
  return {refresh,change};
}
