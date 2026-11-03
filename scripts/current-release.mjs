import {converterRuntime} from './portable-runtime-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {verifyWindowsDictation} from './setup-windows-dictation.mjs';
const [mode='package',revision=mode==='test'?'r'+Date.now():'r1',...extra]=process.argv.slice(2);
if(!['package','test'].includes(mode)||extra.length||!/^r\d+$/.test(revision))throw Error('Aufruf: node scripts/current-release.mjs package|test [r1]');
const metadata=JSON.parse(fs.readFileSync('package.json','utf8'));
if(!fs.existsSync('freecad-runtime/runtime/manifest.json'))throw Error('Integrierte CAD-Laufzeit fehlt; zuerst npm run setup:cad-runtime ausführen.');
if(!/^\d+\.\d+\.\d+$/.test(metadata.version))throw Error('Eine vollständige Paketversion ist erforderlich.');
converterRuntime(process.cwd());
for(const file of ['cad-kernel-build/runtime/formnaro_cad.wasm'])if(!fs.existsSync(file))throw Error('Build-Laufzeit fehlt: '+file+'. Vorbereitung siehe docs/BUILD.md.');
const speech=JSON.parse(fs.readFileSync('speech-runtime/manifest.json','utf8'));
for(const row of speech.files.filter(row=>!row.name.endsWith('.bin')))if(!fs.existsSync(path.join('speech-runtime',row.name)))throw Error('Sprachlaufzeit fehlt; zuerst node scripts/setup-speech-runtime.mjs ausführen. Siehe docs/BUILD.md.');
verifyWindowsDictation();
Object.assign(process.env,{
 FORMNARO_RELEASE_BUILD_ROOT:process.env.FORMNARO_RELEASE_BUILD_ROOT??'work/release-build',
 FORMNARO_RELEASE_OUTPUT_ROOT:process.env.FORMNARO_RELEASE_OUTPUT_ROOT??'output',
 FORMNARO_RELEASE_CANDIDATE_ONLY:'0',
 FORMNARO_RELEASE_TASK_EVIDENCE:'1',FORMNARO_RELEASE_AI_METER:'1',FORMNARO_RELEASE_PROGRAM_ASSISTANT:'1',
 FORMNARO_RELEASE_PHOTO:'1',FORMNARO_RELEASE_PERSPECTIVE:'1',FORMNARO_RELEASE_MULTIVIEW:'1',
 FORMNARO_RELEASE_FEATURE_REFERENCES:'1',FORMNARO_RELEASE_FREECAD_DOCUMENT:'1',FORMNARO_RELEASE_AI_TASKS:'1',
 FORMNARO_RELEASE_ADVANCED_MODELING:'1',FORMNARO_RELEASE_SURFACES:'1',
 FORMNARO_RELEASE_CURRENT:'1',FORMNARO_RELEASE_VERSION:metadata.version,FORMNARO_RELEASE_REVISION:revision,
 FORMNARO_RELEASE_NAME:mode==='test'?'Quellpruefung':'Formnaro',
 FORMNARO_RELEASE_LABEL:'Integrierte CAD-Laufzeit',
 FORMNARO_RELEASE_PROOF:'work/current-release/'+revision,
 FORMNARO_RELEASE_TEST_ONLY:mode==='test'?'1':'0'
});
await import('./package-freecad-python.mjs');
