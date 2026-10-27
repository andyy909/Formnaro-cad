import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cadAIContext} from '../src/cad-ai-context.js';
import {readFileSync} from 'node:fs';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {FORMNARO_VERSION} from '../src/version.js';
const require=createRequire(import.meta.url),{routes}=require('../backend/api-bridge.cjs');
test('Renderer version matches release metadata without importing development metadata into the app',()=>{assert.equal(FORMNARO_VERSION,JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version);});
test('CAD context, generated OpenAPI and actual loopback routes share the native CAD-5/CAD-7 contract',()=>{
  const context=cadAIContext(),openapi=JSON.parse(readFileSync(new URL('../ai/OfflineCAD-KI-OpenAPI.json',import.meta.url)));
  assert.deepEqual(Object.keys(context.endpoints).sort(),Object.keys(routes).sort());assert.equal(context.projectVersion,24);assert.deepEqual(context.supportedProjectVersions,[5,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]);assert.equal(context.version,FORMNARO_VERSION);assert.deepEqual(context.requestSchema,context.commandSchema);assert.ok(context.requestSchema.required.includes('revision'));
  for(const route of Object.keys(routes)){const [method,path]=route.split(' ');assert.ok(openapi.paths[path][method.toLowerCase()]);}
  assert.deepEqual(openapi.paths['/v1/export'].post.requestBody.content['application/json'].schema,context.exportSchema);assert.deepEqual(context.exportSchema.properties.format.enum,['step','stl','obj','3mf','gltf','glb','svg','drawing-svg','drawing-dxf','drawing-pdf']);assert.equal(context.exportSchema.properties.quality.additionalProperties,false);
});

test('Automation scene retains selected source paths, isolated snapshots and current revision checks',()=>{
  const revision='1234567890abcdef',selection=[{rootId:'group',path:['nested','hole']}],native={revision,objects:[]};
  const access=createCadAutomationAccess({controller:{revision:()=>revision},getSelection:()=>selection,getScene:()=>native});
  const scene=access.scene();assert.deepEqual(scene.selection,['group']);assert.deepEqual(scene.selectionTargets,selection);scene.selectionTargets[0].path.push('tampered');scene.objects.push({id:'tampered'});assert.deepEqual(access.scene().selectionTargets,selection);assert.deepEqual(native.objects,[]);
  native.revision='stale';assert.throws(()=>access.scene(),/aktualisiert/);
});
