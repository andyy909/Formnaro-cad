import test from 'node:test';import assert from 'node:assert/strict';
import {advancedModelingReleaseSettings} from '../scripts/advanced-modeling-release-config.mjs';
test('P6 release keeps all prior suites and uses a new isolated output without a signing prerequisite',()=>{
 const s=advancedModelingReleaseSettings(['r1'],{});assert.equal(s.FORMNARO_RELEASE_VERSION,'0.112.0');assert.equal(s.FORMNARO_RELEASE_NAME,'CAD-Kurven');assert.equal(s.FORMNARO_RELEASE_PROOF,'work/advanced-modeling/release-r1');assert.equal(s.FORMNARO_REQUIRE_SIGNATURE,'0');for(const k of ['ADVANCED_MODELING','AI_TASKS','FREECAD_DOCUMENT','FEATURE_REFERENCES','MULTIVIEW','PERSPECTIVE','PHOTO','PROGRAM_ASSISTANT','AI_METER','TASK_EVIDENCE'])assert.equal(s['FORMNARO_RELEASE_'+k],'1');assert.throws(()=>advancedModelingReleaseSettings(['../r1']));assert.throws(()=>advancedModelingReleaseSettings(['r1','--skip-tests']));
});
