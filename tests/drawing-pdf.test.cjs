const test=require('node:test'),assert=require('node:assert/strict');
const {drawingPdfInput,exactDrawingPdfPage,printDrawingPdf,installDrawingPdf}=require('../backend/drawing-pdf.cjs');
const input={svg:'<svg xmlns="http://www.w3.org/2000/svg"><text x="20" y="20">Maß Ø 6</text></svg>',widthMm:297,heightMm:210};
function pdfFixture({width=841.91998,height=594.95996,resources='<< /ProcSet [/PDF /Text] >>',extra=''}={}){
 const content='q\n0 0 100 100 re S\nQ\n',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /Resources '+resources+' /MediaBox [0 0 '+width+' '+height+'] /Contents 4 0 R '+extra+' >>','<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'endstream'];let text='%PDF-1.4\n',offsets=[0];objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(text,'latin1'));text+=(i+1)+' 0 obj\n'+body+'\nendobj\n';});const xref=Buffer.byteLength(text,'latin1');text+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R /ID [<0123><4567>] >>\nstartxref\n'+xref+'\n%%EOF\n';return Buffer.from(text,'latin1');
}
test('PDF accepts only bounded local A4/A3 vector drawings and rejects executable/remote markup',()=>{
 assert.deepEqual(drawingPdfInput(input),input);
 assert.doesNotThrow(()=>drawingPdfInput({...input,svg:'<svg aria-label="onshape=Bohrung url(Detail A)"><text>Verweis url(Detail A), Maßtext href=4 und onshape=Bohrung</text></svg>'}));
 assert.throws(()=>drawingPdfInput({...input,svg:'<svg onload=alert(1)></svg>'}));
 for(const change of [{widthMm:300},{svg:'<svg><script>alert(1)</script></svg>'},{svg:'<svg><image href="file:///secret"/></svg>'},{svg:'<svg><text onclick="x()">X</text></svg>'},{svg:'<svg><rect style="fill:url(https://example.org/a)"/></svg>'},{svg:'<svg></svg><iframe></iframe>'},{svg:'<svg><foreignObject/></svg>'},{unknown:true}])assert.throws(()=>drawingPdfInput({...input,...change}));
});
test('PDF print page is ephemeral, offline, zero-margin and uses physical inches for Electron',async()=>{
 let options,html,printOptions,destroyed=false,cleared=false,request;
 class Window{constructor(o){options=o;this.webContents={setWindowOpenHandler(){},on(){},printToPDF:async o=>{printOptions=o;return pdfFixture();}};}async loadURL(url){html=decodeURIComponent(url.slice('data:text/html,'.length));}isDestroyed(){return destroyed;}destroy(){destroyed=true;}}
 const partition={setPermissionRequestHandler(){},webRequest:{onBeforeRequest:fn=>request=fn},clearStorageData:async()=>{cleared=true;}},session={fromPartition:()=>partition};
 const bytes=await printDrawingPdf(input,{BrowserWindow:Window,session});
 assert.match(Buffer.from(bytes).toString(),/^%PDF-1\.4/);assert.match(Buffer.from(bytes).toString(),/\/Prev \d+/);assert.equal(options.show,false);assert.equal(options.webPreferences.javascript,false);assert.equal(options.webPreferences.nodeIntegration,false);assert.equal(options.webPreferences.sandbox,true);
 assert.match(html,/@page\{size:297mm 210mm;margin:0\}/);assert.match(html,/default-src 'none'/);
 assert.equal(printOptions.pageSize.width,297/25.4);assert.equal(printOptions.pageSize.height,210/25.4);assert.deepEqual(printOptions.margins,{top:0,bottom:0,left:0,right:0});assert.equal(printOptions.preferCSSPageSize,true);assert.equal(destroyed,true);assert.equal(cleared,true);assert.equal(request,null);
});
test('physical PDF correction retains original bytes and nested resources and adds valid incremental xref/contents',()=>{
 const resources='<< /ProcSet [/PDF /Text] /Nested << /Note (endobj /MediaBox [1 2 3 4] and escaped \\(text\\)) /Hex <456e646f626a> >> >>',original=pdfFixture({width:841.91998,height:1191.12,resources}),corrected=Buffer.from(exactDrawingPdfPage(original,297,420)),tail=corrected.subarray(original.length).toString('latin1');assert.ok(corrected.subarray(0,original.length).equals(original));assert.ok(tail.includes(resources));assert.match(tail,/\/MediaBox \[0 0 841\.8897637795 1190\.5511811024\]/);assert.match(tail,/\/CropBox \[0 0 841\.8897637795 1190\.5511811024\]/);assert.match(tail,/\/Contents \[5 0 R 4 0 R 6 0 R\]/);assert.match(tail,/1 0 0 1 0 -0\.5688188976 cm/);assert.match(tail,/\/ID \[<0123><4567>\]/);assert.match(tail,/\/Size 7/);
 const text=corrected.toString('latin1'),start=Number(text.match(/startxref\s+(\d+)\s+%%EOF\s*$/)[1]);assert.equal(text.slice(start,start+4),'xref');const entries=text.slice(start).matchAll(/(\d+) 1\n(\d{10}) (\d{5}) n /g);let count=0;for(const entry of entries){count++;assert.ok(text.startsWith(entry[1]+' '+Number(entry[3])+' obj',Number(entry[2])));}assert.equal(count,3);assert.throws(()=>exactDrawingPdfPage(corrected,297,420),/PDF/);
});
test('physical PDF correction rejects unsupported/malformed or multi-page structures without changing input',()=>{
 const original=pdfFixture(),copy=Buffer.from(original);for(const value of [Buffer.from('%PDF-test'),Buffer.from(original.toString().replace('/Type /Page /','/Type /Pages /')),Buffer.from(original.toString().replace('startxref','brokenref')),pdfFixture({width:10}),pdfFixture({extra:'/Rotate 90'}),pdfFixture({extra:'/MediaBox [0 0 1 1]'})])assert.throws(()=>exactDrawingPdfPage(value,297,210));assert.ok(original.equals(copy));
});
test('closing the owning app aborts PDF printing and clears the ephemeral print window',async()=>{
 const {EventEmitter}=require('node:events'),owner=new EventEmitter();let destroyed=false,cleared=false;class Window{constructor(){this.webContents={setWindowOpenHandler(){},on(){},printToPDF:()=>new Promise(()=>{})};}async loadURL(){}isDestroyed(){return destroyed;}destroy(){destroyed=true;}}
 const partition={setPermissionRequestHandler(){},webRequest:{onBeforeRequest(){}},clearStorageData:async()=>{cleared=true;}},pending=printDrawingPdf(input,{BrowserWindow:Window,session:{fromPartition:()=>partition},owner});owner.emit('closed');await assert.rejects(pending,/abgebrochen/);assert.equal(destroyed,true);assert.equal(cleared,true);assert.equal(owner.listenerCount('closed'),0);
});
test('Only the owning renderer can invoke the PDF bridge',async()=>{
 let handler;const win={webContents:{}};installDrawingPdf(win,{ipcMain:{handle:(_name,fn)=>handler=fn}});
 assert.equal((await handler({sender:{}},input)).ok,false);
});
