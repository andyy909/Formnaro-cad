import fs from 'node:fs';

// Common floors for both modes. The converter additionally checks the source
// files in source mode; its own verifier enforces that check and reports 75.
const minimumChecks={native:46,mixed:21,mesh:33,workspace:36,tools:45,converter:74,'cad-copy':36,'mesh-copy':39,unified:61,'shared-ai':24,'ai-checks':24,'easy-complete':98,'easy-auto':22,'easy-domain':35,workbench:14,selection:59,inspector:24,repair:27,hole:25,partition:25,connectors:27,reduce:27,remesh:28,smooth:28,'erase-fill':28,'make-solid':24,hollow:27,supplemental:17,chains:35,interactions:305,soak:31,limits:6,recovery:1};
export const surfaceSuites = [
  ['native','local'],['mixed','mixed'],['mesh','mesh'],['workspace','workspace'],['tools','tools'],
  ['converter','converter-workspace'],['stl-integration','stl-integration'],['cad-copy','cad-mesh-copy'],['mesh-copy','mesh-to-cad'],
  ['unified','unified-workflows'],['shared-ai','shared-ai'],['ai-checks','ai-result-checks'],
  ['easy-complete','easy-complete'],['easy-auto','easy-auto-repair'],['easy-domain','easy-domain'],['workbench','workbench'],
  ['selection','mesh-selection'],['inspector','mesh-inspector'],['repair','mesh-simple-repair'],['hole','mesh-hole-fill'],
  ['partition','mesh-partition'],['connectors','mesh-connectors'],['reduce','mesh-reduce'],['remesh','mesh-remesh'],
  ['smooth','mesh-smooth'],['erase-fill','mesh-erase-fill'],['make-solid','mesh-make-solid'],['hollow','mesh-hollow'],
  ['workflow','release-workflow'],['chains','all-functions','chains'],['supplemental','all-functions','supplemental'],['interactions','all-functions','interactions'],['soak','all-functions','soak'],
  ['limits','all-functions','limits'],['recovery','all-functions','recovery-write'],
].map(([id,flag,phase])=>({id,flag,phase,minimum:minimumChecks[id]??1,timeoutMs:id==='soak'?35*60000:['converter','stl-integration','mesh-copy','workflow','native','chains'].includes(id)?20*60000:10*60000,heavy:['soak','limits'].includes(id)}));

export function unitSuites(root='.') {
  return fs.readdirSync(root+'/tests').filter(name=>/\.(mjs|cjs)$/.test(name)).filter(name=>{
    const source=fs.readFileSync(root+'/tests/'+name,'utf8');
    return source.includes('node:test')&&!/(?:require\(['"]electron|from ['"]electron)/.test(source);
  }).sort().map(name=>({id:'unit:'+name.replace(/\.test\.(mjs|cjs)$/,''),file:'tests/'+name,timeoutMs:10*60000}));
}

export function testInventory(root='.') {
  const units=unitSuites(root),files=fs.readdirSync(root+'/tests').filter(n=>/\.(mjs|cjs|py)$/.test(n));
  return files.map(name=>{
    const unit=units.find(s=>s.file==='tests/'+name);
    if(unit)return {file:'tests/'+name,classification:'current-node-suite',suite:unit.id};
    if(/config|fixture|preflight|stage-|exports|read-exports/.test(name))return {file:'tests/'+name,classification:'support',reason:'Build configuration, fixture or historical preflight; substantive checks live in current suites.'};
    return {file:'tests/'+name,classification:'historical-or-specialized-harness',replacement:'native,mixed,tools,workflow,easy-complete,interactions and focused unit suites',reason:'Original launcher retained. Current application verification runs through the real Electron entry with an isolated profile; avoids overwriting historical proof folders or requiring personal import inventories.'};
  });
}
