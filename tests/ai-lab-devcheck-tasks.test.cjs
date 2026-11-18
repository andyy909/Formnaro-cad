const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/check-development-tasks.mjs');
test('Werkzeugprüfung meldet für advanced-01 das fehlende tool:group',async()=>{
 const {checkDevelopmentTasks}=await load();
 const lines=checkDevelopmentTasks();
 const line=lines.find(entry=>entry.startsWith('advanced-01:'));
 assert.match(line,/advanced-01: Referenz braucht tool:group, Aufgabe nennt nur tool:drill/);
 assert.ok(lines.find(entry=>entry.startsWith('advanced-04:')).endsWith(': ok'),'advanced-04 nennt tool:group');
 assert.equal(lines.length,15,'alle Entwicklungsaufgaben werden gelistet');
 for(const id of ['thread','drill','sketch','pattern','shell','drawing','assembly'])assert.ok(lines.includes(id+': keine Referenz'),id+' hat keine Referenz');
});
test('Ein Lauf ohne Referenz meldet keine Werkzeuglücke',async()=>{
 const {checkDevelopmentTasks}=await load();
 assert.deepEqual(checkDevelopmentTasks(['drill']),['drill: keine Referenz']);
});
