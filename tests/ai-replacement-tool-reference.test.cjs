const test=require('node:test'),assert=require('node:assert/strict');
const {reference}=require('../backend/ai-tool-reference.cjs');
test('replacement sketch reference exposes the existing visible delete route without a Boolean workaround',async()=>{
 const context={practiceOnly:true};
 const sketch=await reference({tool:'tool:sketch'},context);
 assert(sketch.tool.relatedTools.includes('tool:delete'));
 assert(sketch.tool.steps.some(s=>s.includes('ui:tool:delete')&&s.includes('Ersetzen')));
 const deletion=await reference({tool:'tool:delete'},context);
 assert.equal(deletion.tool.practiceTarget,'ui:tool:delete');
 assert(deletion.tool.steps.some(s=>s.includes('kind:select')&&s.includes('ui:tool:delete')));
 assert(deletion.tool.steps.some(s=>s.includes('Obere Werkzeugleiste')));
 assert(!deletion.tool.modelExample);
});
