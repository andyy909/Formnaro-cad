const {randomUUID}=require('node:crypto');

function drawingPdfInput(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['svg','widthMm','heightMm'].includes(k)))throw Error('Ungültige Zeichnungsdaten.');
  const {svg,widthMm,heightMm}=value;
  if(typeof svg!=='string'||Buffer.byteLength(svg)>20*1024*1024||!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)||!/<\/svg>\s*$/i.test(svg))throw Error('Eine begrenzte SVG-Zeichnung wird benötigt.');
  if(![[210,297],[297,210],[297,420],[420,297]].some(([w,h])=>w===widthMm&&h===heightMm))throw Error('A4 oder A3 in Hoch- oder Querformat wählen.');
  // No executable/foreign markup or resource references enter the print page.
  // CSP, disabled JavaScript and an isolated in-memory session also enforce
  // this boundary independently of the input validation.
  if(/<!/.test(svg))throw Error('Die Zeichnung enthält externe oder ausführbare Inhalte.');
  for(const match of svg.matchAll(/<\/?\s*([\w:.-]+)/g))if(!['svg','g','path','line','polyline','polygon','circle','ellipse','text','tspan','rect','defs','marker','title','desc','clipPath'].includes(match[1]))throw Error('Nicht unterstütztes SVG-Zeichnungselement.');
  for(const tag of svg.matchAll(/<[A-Za-z][\w:.-]*\b([^<>]*)>/g)){
    const remaining=tag[1].replace(/\s+([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,(_whole,key,double,single)=>{
      const name=key.toLowerCase(),content=double??single;
      if(/^on/.test(name)||/^(?:.*:)?(?:href|src)$/.test(name)||['style','fill','stroke','filter','clip-path','marker-start','marker-mid','marker-end'].includes(name)&&/url\s*\(|@import|expression\s*\(/i.test(content))throw Error('Die Zeichnung enthält externe oder ausführbare Inhalte.');
      return '';
    });
    if(!/^\s*\/?\s*$/.test(remaining))throw Error('Ungültige SVG-Zeichnungsattribute.');
  }
  return {svg:svg.replace(/^\s*<\?xml[^>]*>\s*/i,''),widthMm,heightMm};
}

// A bounded PDF dictionary scanner. Literal/hex strings, nested resources and
// arrays are skipped as values, so page-key updates cannot alter their contents.
function pdfDictionary(text,start=0){
 const fail=()=>{throw Error('Nicht unterstützte lokale PDF-Struktur.');},white=c=>c!==undefined&&/[\x00\t\n\f\r ]/.test(c),delimiter=c=>c===undefined||white(c)||/[()[\]<>/%]/.test(c);
 function skip(p){while(p<text.length){if(white(text[p]))p++;else if(text[p]==='%'){while(p<text.length&&!/[\r\n]/.test(text[p]))p++;}else break;}return p;}
 function name(p){if(text[p]!=='/')fail();const begin=++p;while(!delimiter(text[p]))p++;if(p===begin)fail();return {end:p,key:text.slice(begin,p).replace(/#([0-9a-fA-F]{2})/g,(_,v)=>String.fromCharCode(parseInt(v,16)))};}
 function value(p,depth=0){p=skip(p);if(depth>32||p>=text.length)fail();
  if(text.startsWith('<<',p)){p+=2;while(true){p=skip(p);if(text.startsWith('>>',p))return p+2;const key=name(p);p=value(key.end,depth+1);}}
  if(text[p]==='['){p++;while(true){p=skip(p);if(text[p]===']')return p+1;p=value(p,depth+1);}}
  if(text[p]==='('){let nested=1;p++;while(p<text.length){if(text[p]==='\\'){p+=2;continue;}if(text[p]==='(')nested++;if(text[p]===')'&&!--nested)return p+1;p++;}fail();}
  if(text[p]==='<'){const end=text.indexOf('>',p+1);if(end<0||!/^[0-9a-fA-F\s]*$/.test(text.slice(p+1,end)))fail();return end+1;}
  if(text[p]==='/')return name(p).end;
  const begin=p;while(!delimiter(text[p]))p++;if(p===begin)fail();const token=text.slice(begin,p);
  if(/^\d+$/.test(token)){const next=skip(p),reference=text.slice(next).match(/^\d+\s+R\b/);if(reference)return next+reference[0].length;}
  return p;
 }
 start=skip(start);if(!text.startsWith('<<',start))fail();const fields=new Map();let p=start+2;
 while(true){p=skip(p);if(text.startsWith('>>',p))return {fields,start,end:p+2,close:p};const keyStart=p,key=name(p),valueStart=skip(key.end),valueEnd=value(valueStart,1);if(fields.has(key.key))fail();fields.set(key.key,{keyStart,valueStart,valueEnd,raw:text.slice(valueStart,valueEnd)});p=valueEnd;}
}
function replacePdfFields(text,parsed,changes){const edits=[];for(const [key,value] of Object.entries(changes)){const field=parsed.fields.get(key);edits.push(field?{start:field.valueStart,end:field.valueEnd,value}:{start:parsed.close,end:parsed.close,value:'/'+key+' '+value+'\n'});}let result=text;for(const edit of edits.toSorted((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.value+result.slice(edit.end);return result;}

// Chromium/Skia quantizes its paper box independently of SVG geometry (A3 can
// become 420.20mm while a 100mm vector remains 100mm). Correct only page space:
// an incremental PDF update retains every original vector/font/content byte.
// The translation keeps the SVG's top-left physical origin after the box edit.
// ISO 32000-1:2008,7.5.4/7.5.6: append changed objects,xref,trailer+Prev.
// https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf
function exactDrawingPdfPage(value,widthMm,heightMm){
 const bytes=Buffer.from(value),text=bytes.toString('latin1'),fail=()=>{throw Error('Die lokale PDF-Seitengröße konnte nicht verlustfrei geprüft werden.');};
 if(!/^%PDF-1\.[0-9]/.test(text))fail();const end=text.match(/startxref\s+(\d+)\s+%%EOF\s*$/);if(!end)fail();const previous=Number(end[1]);if(!Number.isSafeInteger(previous)||previous<0||!text.startsWith('xref',previous))fail();
 const trailerAt=text.indexOf('trailer',previous+4);if(trailerAt<0)fail();const trailer=pdfDictionary(text,trailerAt+7);if(!/^\s*startxref\s+\d+\s+%%EOF\s*$/.test(text.slice(trailer.end))||['Encrypt','Prev','XRefStm'].some(key=>trailer.fields.has(key)))fail();const size=Number(trailer.fields.get('Size')?.raw);if(!Number.isSafeInteger(size)||size<2||size>100000||!/^\d+\s+\d+\s+R$/.test(trailer.fields.get('Root')?.raw??''))fail();
 const lines=text.slice(previous+4,trailerAt).trim().split(/\r?\n/),pages=[];let line=0,zeroEntry=null;
 while(line<lines.length){const header=lines[line++].trim().match(/^(\d+)\s+(\d+)$/);if(!header)fail();const first=Number(header[1]),count=Number(header[2]);if(!Number.isSafeInteger(first)||!Number.isSafeInteger(count)||first+count>size||count<1)fail();
  for(let i=0;i<count;i++){const entry=lines[line++]?.trim().match(/^(\d{10})\s+(\d{5})\s+([nf])$/);if(!entry)fail();const id=first+i;if(id===0){if(entry[3]!=='f'||entry[2]!=='65535')fail();zeroEntry=entry[1]+' '+entry[2]+' f \n';}if(entry[3]==='f')continue;const offset=Number(entry[1]),generation=Number(entry[2]);if(offset>=previous)fail();const object=text.slice(offset,previous),open=object.match(new RegExp('^'+id+' '+generation+' obj\\s*'));if(!open)fail();const raw=object.slice(open[0].length);if(/^<<\s*\/Type\s*\/Page\b/.test(raw)){const parsed=pdfDictionary(raw);if(!/^\s*endobj\b/.test(raw.slice(parsed.end)))fail();pages.push({id,generation,body:raw.slice(0,parsed.end)});}
  }
 }
 if(pages.length!==1||!zeroEntry)fail();const page=pages[0],parsed=pdfDictionary(page.body),numeric='[-+]?(?:\\d+\\.?\\d*|\\.\\d+)',boxExpression=new RegExp('^\\[\\s*('+numeric+')\\s+('+numeric+')\\s+('+numeric+')\\s+('+numeric+')\\s*\\]$'),match=parsed.fields.get('MediaBox')?.raw.match(boxExpression);if(!match||parsed.fields.has('Rotate')&&Number(parsed.fields.get('Rotate').raw)!==0)fail();
 const box=match.slice(1).map(Number),width=widthMm*72/25.4,height=heightMm*72/25.4;if(box.some(v=>!Number.isFinite(v))||box[0]!==0||box[1]!==0||Math.abs(box[2]-width)>72/25.4||Math.abs(box[3]-height)>72/25.4)fail();
 const content=parsed.fields.get('Contents')?.raw;if(!content||! /^(?:\d+\s+\d+\s+R|\[(?:\s*\d+\s+\d+\s+R\s*)+\])$/.test(content))fail();const original=content.replace(/^\[|\]$/g,'').trim(),num=n=>String(Number(n.toFixed(10))),exactBox='[0 0 '+num(width)+' '+num(height)+']',prefix='q\n1 0 0 1 0 '+num(height-box[3])+' cm\n',suffix='Q\n';
 const body=replacePdfFields(page.body,parsed,{MediaBox:exactBox,CropBox:exactBox,Contents:'['+size+' 0 R '+original+' '+(size+1)+' 0 R]'});
 const additions=[{id:page.id,generation:page.generation,body},{id:size,generation:0,body:'<< /Length '+Buffer.byteLength(prefix)+' >>\nstream\n'+prefix+'endstream'},{id:size+1,generation:0,body:'<< /Length '+Buffer.byteLength(suffix)+' >>\nstream\n'+suffix+'endstream'}],chunks=[bytes,Buffer.from('\n')],entries=[];let offset=bytes.length+1;
 for(const object of additions){const chunk=Buffer.from(object.id+' '+object.generation+' obj\n'+object.body+'\nendobj\n','latin1');entries.push({id:object.id,generation:object.generation,offset});chunks.push(chunk);offset+=chunk.length;}
 const xref=offset;let tail='xref\n0 1\n'+zeroEntry;for(const entry of entries.toSorted((a,b)=>a.id-b.id)){if(entry.offset>9999999999)fail();tail+=entry.id+' 1\n'+String(entry.offset).padStart(10,'0')+' '+String(entry.generation).padStart(5,'0')+' n \n';}
 const trailerBody=text.slice(trailer.start,trailer.end),nextTrailer=replacePdfFields(trailerBody,pdfDictionary(trailerBody),{Size:String(size+2),Prev:String(previous)});tail+='trailer\n'+nextTrailer+'\nstartxref\n'+xref+'\n%%EOF\n';chunks.push(Buffer.from(tail,'latin1'));return new Uint8Array(Buffer.concat(chunks));
}

async function printDrawingPdf(value,{BrowserWindow,session,owner,timeoutMs=30000}={}){
  const {svg,widthMm,heightMm}=drawingPdfInput(value),printSession=session.fromPartition('formnaro-drawing-'+randomUUID());
  printSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  printSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:text/html,')}));
  const printWindow=new BrowserWindow({show:false,webPreferences:{session:printSession,sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false,webSecurity:true,images:false}});
  printWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  printWindow.webContents.on('will-navigate',event=>event.preventDefault());
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; font-src 'none'; img-src 'none'"><style>@page{size:${widthMm}mm ${heightMm}mm;margin:0}html,body{margin:0;padding:0;width:${widthMm}mm;height:${heightMm}mm;overflow:hidden}svg{display:block;width:${widthMm}mm;height:${heightMm}mm}</style></head><body>${svg}</body></html>`;
  let timer,rejectClosed;
  const close=()=>rejectClosed?.(Error('PDF-Ausgabe abgebrochen.'));
  owner?.once('closed',close);
  try{
    return await Promise.race([
      (async()=>{await printWindow.loadURL('data:text/html,'+encodeURIComponent(html));const bytes=await printWindow.webContents.printToPDF({pageSize:{width:widthMm/25.4,height:heightMm/25.4},preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,margins:{top:0,bottom:0,left:0,right:0},scale:1});return exactDrawingPdfPage(bytes,widthMm,heightMm);})(),
      new Promise((_,reject)=>{rejectClosed=reject;timer=setTimeout(()=>reject(Error('PDF-Ausgabe hat das Zeitlimit überschritten.')),timeoutMs);})
    ]);
  }finally{clearTimeout(timer);owner?.removeListener('closed',close);if(!printWindow.isDestroyed())printWindow.destroy();printSession.webRequest.onBeforeRequest(null);await printSession.clearStorageData().catch(()=>{});}
}

function installDrawingPdf(win,{ipcMain,BrowserWindow,session}=require('electron')){
  let busy=false;
  ipcMain.handle('cad-drawing:pdf',async(event,args)=>{
    if(event.sender!==win.webContents)return {ok:false,error:'Ungültiges Fenster.'};
    if(busy)return {ok:false,error:'Eine PDF-Ausgabe läuft bereits.'};
    busy=true;
    try{return {ok:true,value:await printDrawingPdf(args,{BrowserWindow,session,owner:win})};}
    catch(error){return {ok:false,error:error.message};}
    finally{busy=false;}
  });
}
module.exports={drawingPdfInput,exactDrawingPdfPage,printDrawingPdf,installDrawingPdf};
