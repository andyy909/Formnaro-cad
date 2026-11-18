const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const directory=path.join(__dirname,'fixtures','development-check');
const names=['advanced-01','advanced-02','advanced-05','advanced-07','drill'];
for(const name of names)test('Verkleinerter Lauf '+name+' ist vorhanden, klein und ohne Bilder oder absolute Pfade',()=>{
 const file=path.join(directory,name+'.json');
 assert.ok(fs.existsSync(file),'Fixture fehlt: '+file);
 const text=fs.readFileSync(file,'utf8');
 assert.ok(Buffer.byteLength(text)<40*1024,'Fixture ist größer als 40 KB: '+Buffer.byteLength(text));
 const record=JSON.parse(text);
 assert.equal(record.spec.caseId,name,'Die Aufgabe steht im Fixture');
 assert.ok(Array.isArray(record.events)&&record.events.length>0,'Das Fixture enthält Ereignisse');
 for(const forbidden of ['data:image','C:\\','F:\\','apiKey']){
  assert.ok(!text.includes(forbidden),'Verbotener Inhalt '+JSON.stringify(forbidden)+' in '+name);
 }
});
