const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/check-development-tasks.mjs');
test('Der Entwicklungscheck kündigt alle vom Referenzmodell benötigten Gruppierungen an',async()=>{
 const {checkDevelopmentTasks}=await load();
 const lines=checkDevelopmentTasks();
 for(const id of ['advanced-01','advanced-03'])assert.ok(lines.includes(id+': ok'),id+' bietet tool:group an');
 assert.ok(lines.find(entry=>entry.startsWith('advanced-04:')).endsWith(': ok'),'advanced-04 nennt tool:group');
 assert.equal(lines.length,15,'alle Entwicklungsaufgaben werden gelistet');
 for(const id of ['thread','drill','sketch','pattern','shell','drawing','assembly'])assert.ok(lines.includes(id+': keine Referenz'),id+' hat keine Referenz');
});
test('Ein Lauf ohne Referenz meldet keine Werkzeuglücke',async()=>{
 const {checkDevelopmentTasks}=await load();
 assert.deepEqual(checkDevelopmentTasks(['drill']),['drill: keine Referenz']);
});
test('Only selected development tasks contribute geometry grouping guidance',async()=>{
 const {quickPlan}=await import('../ai/lab-quick-plans.mjs');
 const {expandPlan}=require('../backend/ai-test-lab-plan.cjs');
 const modeler={providerId:'current',model:'deepseek-flash'};
 for(const [id,description] of [['advanced-01','Platte 60'],['advanced-03','Zylinder Ø10']]){
  const plan=quickPlan('development',modeler,'low',[id]);
  const expanded=expandPlan(plan);
  assert.deepEqual(expanded.rows.map(row=>row.caseId),[id]);
  assert.match(expanded.rows[0].customContext,/"id":"tool:group"/);
  assert.ok(expanded.rows[0].customContext.includes(description));
 }
 assert.equal(quickPlan('development',modeler,'low',['advanced-06']).customContext,'');
 const {verifySuite}=require('../backend/ai-lab-benchmark.cjs');
 assert.equal(verifySuite(undefined,'core').available,true);
 assert.equal(verifySuite(undefined,'advanced').available,true);
});
