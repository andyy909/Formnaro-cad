// Actual local Electron print gate. The independent Python reader checks paper
// boxes, unchanged vector scale/origin and original PDF byte preservation.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {app,BrowserWindow,session}=require('electron');
const {printDrawingPdf}=require('../backend/drawing-pdf.cjs');
const out=path.resolve(process.argv.find(v=>v.startsWith('--out='))?.slice(6)??'work/cad-drawings/pdf-physical-'+Date.now());
if(fs.existsSync(out))throw Error('Physical PDF output must be new.');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'isolated-profile'));app.setPath('sessionData',path.join(out,'isolated-profile'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const reports=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 try{
  for(const [paper,widthMm,heightMm] of [['A4-portrait',210,297],['A4-landscape',297,210],['A3-portrait',297,420],['A3-landscape',420,297]]){
   let original;class PrintWindow{constructor(options){const win=new BrowserWindow(options),print=win.webContents.printToPDF.bind(win.webContents);win.webContents.printToPDF=async options=>{original=await print(options);return original;};return win;}}
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}"><rect x="20" y="20" width="100" height="100" fill="none" stroke="black" stroke-width="0.1"/><rect x="140" y="20" width="50" height="50" fill="none" stroke="black" stroke-width="0.1"/><text x="20" y="135" font-size="4">${paper} · 100 mm und 50 mm · Maß Ø 6</text></svg>`,bytes=Buffer.from(await printDrawingPdf({svg,widthMm,heightMm},{BrowserWindow:PrintWindow,session}));
   if(!bytes.subarray(0,original.length).equals(original))throw Error('Original content/font/resource bytes changed.');
   const file=path.join(out,paper+'.pdf'),rawFile=path.join(out,paper+'-raw.pdf');fs.writeFileSync(file,bytes);fs.writeFileSync(rawFile,original);reports.push({paper,widthMm,heightMm,file,rawFile,sha256:sha(bytes),rawSha256:sha(original),originalPrefixPreserved:true,expectedRectangles:[{xMm:20,topMm:20,widthMm:100,heightMm:100},{xMm:140,topMm:20,widthMm:50,heightMm:50}]});
  }
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,isolatedProfile:true,electronVersion:process.versions.electron,papers:reports,reference:'ISO 32000-1:2008,7.5.4 and7.5.6;https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf'},null,2));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:false,error:error.stack??error.message,papers:reports},null,2));app.exit(1);}
});
