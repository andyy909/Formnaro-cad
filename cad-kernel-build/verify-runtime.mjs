import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const runtime=path.join(path.dirname(fileURLToPath(import.meta.url)),'runtime'),manifest=JSON.parse(fs.readFileSync(path.join(runtime,'integrity.json'),'utf8'));
if(manifest.schema!=='Formnaro-CAD-runtime-integrity-v1'||manifest.proof.exitCode!==0)throw Error('Kernel runtime integrity manifest is invalid.');
for(const [file,expected] of Object.entries(manifest.files)){
  const target=path.resolve(runtime,file);if(!target.startsWith(runtime+path.sep))throw Error('Runtime path escapes package.');
  const data=fs.readFileSync(target);if(data.length!==expected.bytes||createHash('sha256').update(data).digest('hex')!==expected.sha256)throw Error(`Kernel runtime checksum mismatch: ${file}`);
}
console.log(JSON.stringify({verified:true,files:Object.keys(manifest.files).length,wasmSha256:manifest.files['formnaro_cad.wasm'].sha256}));
