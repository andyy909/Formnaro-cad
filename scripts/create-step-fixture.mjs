import fs from 'node:fs';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {stepAssemblyFixture} from './step-assembly-fixture.mjs';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});fs.writeFileSync(process.argv[2],stepAssemblyFixture(oc));
