import limits from '../backend/ai-input-limits.json';
export {limits as CAD_AI_INPUT_LIMITS};
export function cadAIHistory(history,images=[]){
  const result=history.slice(-limits.maxHistory);
  const fits=()=>{const all=[...result.flatMap(t=>t.images??[]),...images];return all.length<=limits.maxImages&&all.reduce((sum,image)=>sum+(image.dataUrl.length-image.dataUrl.indexOf(',')-1)*.75,0)<=limits.maxTotalImageBytes;};
  while(result.length&&!fits())result.shift();return result.map(t=>({role:t.role,text:t.text,...(t.images?.length?{images:t.images}:{} )}));
}
export async function readCadAIImage(file){
  if(!file||!limits.imageTypes.includes(file.type))throw Error('Bitte ein PNG-, JPEG- oder WebP-Bild wählen.');
  if(!file.size||file.size>limits.maxImageBytes)throw Error('Ein Bild darf höchstens 5 MB groß sein.');
  const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reader.onabort=()=>reject(Error('Das Bild konnte nicht gelesen werden.'));reader.readAsDataURL(file);});
  const image=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Das Bild ist beschädigt oder hat ein nicht unterstütztes Format.'));image.src=dataUrl;});
  if(image.naturalWidth*image.naturalHeight>16000000)throw Error('Das Bild ist zu groß. Bitte auf höchstens 16 Megapixel verkleinern.');
  const canvas=document.createElement('canvas'),scale=Math.min(1,96/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  return {name:(file.name||'Bild.png').slice(0,200),mimeType:file.type,dataUrl,thumbnail:canvas.toDataURL('image/png'),bytes:file.size};
}
