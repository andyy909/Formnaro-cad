const test=require('node:test'),assert=require('node:assert/strict');
const {reference}=require('../backend/ai-tool-reference.cjs');
test('drawing reference exposes landscape, number, revision, section and dimension controls',async()=>{
 const tool=(await reference({tool:'tool:drawing'},{practiceOnly:true})).tool;
 for(const target of ['ui:id:drawing-orientation','ui:id:drawing-scale','ui:label:Zeichnungsnummer','ui:label:Revision','ui:id:drawing-add-kind','ui:id:drawing-add-view','ui:label:Schnittachse','ui:label:Schnittlage (mm)','ui:id:drawing-auto'])assert(tool.controls.some(c=>c.target===target),'Missing actual control: '+target);
 assert.match(JSON.stringify(tool),/landscape/);assert.match(JSON.stringify(tool),/section/);
});
