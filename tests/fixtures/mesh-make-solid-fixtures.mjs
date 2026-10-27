import fs from 'node:fs';
import {meshSelectionGeometryDigest} from '../../src/mesh-selection-data.js';
export const makeSolidFixture=()=>JSON.parse(fs.readFileSync(new URL('../../backend/mesh-make-solid-fixture.json',import.meta.url),'utf8'));
export function makeSolidNode({protectedRegion=false}={}){const f=makeSolidFixture(),n={id:'technical',kind:'mesh',name:'Synthetisches schadhaftes Bohrteil',meshRole:'solid',mesh:structuredClone(f.mesh),transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],color:'#447788',opacity:.8,layerId:'default',folderId:null,metadata:{notes:'Synthetisches Make-Solid-Prüfteil'}};if(protectedRegion)n.metadata.meshProtection={format:'FormnaroMeshProtection',version:1,regions:[{id:'contact',name:'Anlagefläche',purpose:'contact',geometryDigest:meshSelectionGeometryDigest(n),triangleIds:[0]}]};return n;}
export function makeSolidOptions(n,set={}){return {method:'voxel-wrap-v1',geometryDigest:meshSelectionGeometryDigest(n),...makeSolidFixture().options,...set};}
