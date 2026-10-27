import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1],inventory=JSON.parse(fs.readFileSync(value('--inventory'),'utf8')),output=path.resolve(value('--output'));fs.mkdirSync(output,{recursive:true});
const models=[...inventory.selected];if(args.includes('--reference'))models.push({path:path.resolve(value('--reference')),name:'reference-compartment',sha256:'local-reference'});
const sources=['src/cad-stl-surfaces.js','src/cad-stl-input.js','src/cad-stl-housing.js','src/cad-service.js','tests/fixtures/cad-stl-corpus-worker.mjs','scripts/compare-stl-cad.py'],manifest=()=>Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),sourceManifest=manifest();
function run(executable,argv,log,timeout=180000){return new Promise(resolve=>{const fd=fs.openSync(log,'w'),child=spawn(executable,argv,{windowsHide:true,stdio:['ignore',fd,fd]}),timer=setTimeout(()=>child.kill(),timeout);child.on('error',error=>{clearTimeout(timer);fs.closeSync(fd);resolve({code:-1,error:error.message});});child.on('exit',code=>{clearTimeout(timer);fs.closeSync(fd);resolve({code});});});}
const prior=args.includes('--retry-failed')?JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8')):null;
if(prior&&(!prior.sourceCurrent||JSON.stringify(prior.sourceManifest)!==JSON.stringify(sourceManifest)||prior.results.length!==models.length||prior.results.some((r,i)=>r.path!==models[i].path)))throw Error('Retry requires the same completed corpus and unchanged geometry sources.');
if(prior)fs.copyFileSync(path.join(output,'report.json'),path.join(output,'report-before-retry-'+Date.now()+'.json'));
const results=[];
for(let i=0;i<models.length;i++){
 const model=models[i],old=prior?.results[i];
 if(old&&(old.ok&&old.independentComparison||!old.mandatory&&['STL_INVALID','STL_LIMIT','STL_UNSUPPORTED','STL_QUALITY'].includes(old.code))){results.push(old);continue;}
 const directory=path.join(output,String(i).padStart(2,'0')+(prior?'-retry-'+Date.now():''));fs.mkdirSync(directory,{recursive:true});console.log('STL '+(i+1)+'/'+models.length+': '+model.name);
 const native=await run(process.execPath,['tests/fixtures/cad-stl-corpus-worker.mjs',model.path,directory],path.join(directory,'native.log'));
 let result=fs.existsSync(path.join(directory,'result.json'))?JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8')):{ok:false,code:'TEST_TIMEOUT',message:'Native corpus process did not complete'};
 if(result.ok){const compare=await run('python',['scripts/compare-stl-cad.py','--source',model.path,'--candidate',path.join(directory,'mesh.json'),'--output',path.join(directory,'comparison.json'),'--dependencies','work/pydeps'],path.join(directory,'compare.log'));result.independentComparison=compare.code===0;if(!result.independentComparison)result.testFailure=true;}
 const mandatory=inventory.mandatory.some(n=>n.toLowerCase()===model.name.toLowerCase())||model.name==='reference-compartment';results.push({...model,...result,mandatory,directory,exitCode:native.code});
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({completed:results.length,total:models.length,results},null,2));console.log('  '+(result.ok?'CAD + comparison '+result.independentComparison:result.code));
}
const sourceCurrent=JSON.stringify(sourceManifest)===JSON.stringify(manifest()),ok=sourceCurrent&&results.every(r=>r.ok?r.independentComparison:!r.mandatory&&['STL_INVALID','STL_LIMIT','STL_UNSUPPORTED','STL_QUALITY'].includes(r.code));
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok,sourceCurrent,sourceManifest,completed:results.length,total:models.length,converted:results.filter(r=>r.ok).length,rejected:results.filter(r=>!r.ok).length,results},null,2));console.log(JSON.stringify({ok,total:results.length,converted:results.filter(r=>r.ok).length}));if(!ok)process.exitCode=1;
