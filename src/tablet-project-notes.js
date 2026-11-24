import {validateCadView} from './cad-workspace.js';

const key='offlinecad-tablet-notes-v1';
const fileId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validPoint=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<=32768);
const name=value=>typeof value==='string'&&value.trim()&&value.length<=200;

export function validateTabletNote(value){
  const {version,page,origin,strokes,picture}=value??{};
  if(version!==1||!Number.isInteger(page)||page<1||page>32||typeof origin!=='string'||
    !/^[a-f0-9-]{36}$/.test(origin)||!Array.isArray(strokes)||strokes.length>4096||
    !strokes.every(stroke=>Array.isArray(stroke)&&stroke.length>0&&stroke.length<=4096&&stroke.every(validPoint)))
    throw Error('Ungültige Skizzenblockseite.');
  let background=null;
  if(picture!==null){
    const {image,width,height,view,project}=picture??{};
    if(typeof image!=='string'||image.length>270000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)||
      ![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=1024)||
      ![project?.name,project?.opening,project?.revision].every(name))
      throw Error('Ungültiges Bild in der Skizzenblockseite.');
    background={image,width,height,view:validateCadView(view),
      project:{name:project.name,opening:project.opening,revision:project.revision}};
  }
  if(!strokes.length&&!background)throw Error('Eine Seite mit Skizze oder Bild auswählen.');
  return {version,page,origin,strokes,picture:background};
}

export function createTabletProjectNotes(storage){
  function read(){
    storage.checkReadable?.(key);
    const result=JSON.parse(storage.getItem(key)??'{}');
    if(!result||typeof result!=='object'||Array.isArray(result)||Object.entries(result).some(([id,notes])=>
      !fileId(id)||!Array.isArray(notes)||notes.length>32))
      throw Error('Die gespeicherten Tablet-Notizen konnten nicht gelesen werden.');
    return result;
  }
  const write=data=>storage.setItem(key,JSON.stringify(data));
  function list(id){return fileId(id)?read()[id]??[]:[];}
  function save(id,receipt,value){
    if(!fileId(id))throw Error('Das PC-Projekt zuerst speichern.');
    if(!fileId(receipt))throw Error('Ungültige Notiz-Kennung.');
    const note=validateTabletNote(value);
    const data=read(),previous=data[id]??[];
    const earlier=previous.find(item=>item.receipt===receipt);
    if(earlier){
      if(JSON.stringify(earlier.note)!==JSON.stringify(note))throw Error('Diese Notiz-Kennung gehört zu einem anderen Inhalt.');
      return {receipt,duplicate:true};
    }
    if(previous.length>=32)throw Error('Für das PC-Projekt sind bereits 32 Tablet-Notizen gespeichert.');
    data[id]=[...previous,{receipt,note,savedAt:new Date().toISOString()}];
    write(data);
    return {receipt,duplicate:false};
  }
  function copy(from,to){
    if(!fileId(from)||!fileId(to)||from===to)return;
    const data=read(),source=data[from];
    if(!source?.length)return;
    const target=data[to]??[],existing=new Set(target.map(item=>item.receipt));
    const notes=[...target,...source.filter(item=>!existing.has(item.receipt))];
    if(notes.length>32)throw Error('Für die Notizen ist im Zielprojekt kein Platz mehr.');
    if(notes.length>target.length){data[to]=notes;write(data);}
  }
  return {list,save,copy};
}

export async function renderTabletProjectNote(canvas,note){
  const {picture,strokes}=validateTabletNote(note),ctx=canvas.getContext('2d');
  let width=picture?.width??640,height=picture?.height??420;
  if(!picture)for(const stroke of strokes)for(const [x,y] of stroke){
    width=Math.max(width,Math.min(65536,2*Math.abs(x)+24));
    height=Math.max(height,Math.min(65536,2*Math.abs(y)+24));
  }
  const scale=Math.min(1,760/Math.max(width,height));
  canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(picture){
    const image=new Image();
    image.src=picture.image;
    await image.decode();
    if(image.naturalWidth!==picture.width||image.naturalHeight!==picture.height)
      throw Error('Die Abmessungen des PC-Bildes stimmen nicht.');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
  }
  ctx.setTransform(scale,0,0,scale,canvas.width/2,canvas.height/2);
  ctx.strokeStyle=ctx.fillStyle=picture?'#fa467e':'#274554';
  ctx.lineWidth=2.3;ctx.lineCap=ctx.lineJoin='round';
  for(const stroke of strokes){
    ctx.beginPath();
    ctx.moveTo(...stroke[0]);
    if(stroke.length===1){ctx.arc(...stroke[0],1.15,0,2*Math.PI);ctx.fill();continue;}
    for(const item of stroke.slice(1))ctx.lineTo(...item);
    ctx.stroke();
  }
}
