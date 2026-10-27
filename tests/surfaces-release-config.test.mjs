import test from 'node:test';import assert from 'node:assert/strict';
import {surfacesReleaseSettings} from '../scripts/surfaces-release-config.mjs';
test('Surface release retains every earlier suite, adds its own gate and preserves the prior output',()=>{
 const s=surfacesReleaseSettings(['r1']);assert.equal(s.FORMNARO_RELEASE_VERSION,'0.113.0');assert.equal(s.FORMNARO_RELEASE_NAME,'CAD-Flaechen');assert.equal(s.FORMNARO_RELEASE_PROOF,'work/surfaces/release-r1');for(const k of ['SURFACES','ADVANCED_MODELING','AI_TASKS','FREECAD_DOCUMENT','FEATURE_REFERENCES','MULTIVIEW','PERSPECTIVE','PHOTO','PROGRAM_ASSISTANT','AI_METER','TASK_EVIDENCE'])assert.equal(s['FORMNARO_RELEASE_'+k],'1');assert.equal(s.FORMNARO_REQUIRE_SIGNATURE,'0');assert.throws(()=>surfacesReleaseSettings(['../r1']));assert.throws(()=>surfacesReleaseSettings(['r1','--skip-tests']));
});
