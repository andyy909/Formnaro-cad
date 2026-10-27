import catalog from './fonts/catalog.json' with {type:'json'};
export const CAD_FONT_KEY='offlinecad-fonts-v1';
export const CAD_FONT_LIMITS=Object.freeze({count:50,fileBytes:5*1024*1024,totalBytes:20*1024*1024});
export const CAD_FONTS=Object.freeze([{id:'regular',name:'Sans',category:'legacy'},{id:'bold',name:'Sans Bold',category:'legacy'},{id:'serif',name:'Optimer',category:'legacy'},...catalog]);
export function cadFontBytes(base64){
  if(typeof base64!=='string'||!base64.length||base64.length>Math.ceil(CAD_FONT_LIMITS.fileBytes/3)*4||base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('Ungültige Schriftdatei; maximal 5 MB je TTF/OTF.');
  const raw=atob(base64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length>CAD_FONT_LIMITS.fileBytes||btoa(raw)!==base64)throw Error('Ungültige Schriftdatei.');return bytes;
}
export function validateCadFontLibrary(value){
  if(!Array.isArray(value)||value.length>CAD_FONT_LIMITS.count)throw Error('Bis zu 50 eigene Schriften erlaubt.');const ids=new Set();let total=0;
  return value.map(font=>{if(!font||Object.keys(font).some(k=>!['id','name','base64'].includes(k))||!/^custom-[a-f0-9]{64}$/.test(font.id)||typeof font.name!=='string'||!font.name.trim()||font.name.length>200||ids.has(font.id))throw Error('Ungültige Schriftbibliothek.');ids.add(font.id);total+=cadFontBytes(font.base64).length;if(total>CAD_FONT_LIMITS.totalBytes)throw Error('Eigene Schriften dürfen zusammen höchstens 20 MB groß sein.');return {id:font.id,name:font.name,base64:font.base64};});
}
export function createCadFontLibrary(storage){
  let values=[],error='';try{const raw=storage.getItem(CAD_FONT_KEY);if(raw!==null)values=validateCadFontLibrary(JSON.parse(raw));}catch(e){error='Schriftbibliothek konnte nicht geladen werden: '+e.message;}
  const save=next=>{if(error)throw Error(error);const valid=validateCadFontLibrary(next);storage.setItem(CAD_FONT_KEY,JSON.stringify(valid));values=valid;};
  return {list:()=>[...CAD_FONTS,...values.map(({id,name})=>({id,name,category:'custom'}))],resources:()=>structuredClone(values),error:()=>error,add:font=>{save([...values.filter(v=>v.id!==font.id),font]);},remove:id=>save(values.filter(v=>v.id!==id))};
}
