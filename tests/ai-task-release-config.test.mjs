import test from 'node:test';import assert from 'node:assert/strict';
import {aiTaskReleaseSettings} from '../scripts/ai-task-release-config.mjs';
test('Task release preserves earlier acceptance suites and uses the explicitly selected distribution mode',()=>{
 const settings=aiTaskReleaseSettings(['r2'],{FORMNARO_RELEASE_BUILD_ROOT:'work/test-build',FORMNARO_REQUIRE_SIGNATURE:'1'});
 assert.equal(settings.FORMNARO_RELEASE_VERSION,'0.111.0');assert.equal(settings.FORMNARO_RELEASE_PROOF,'work/ai-tasks/release-r2');assert.equal(settings.FORMNARO_REQUIRE_SIGNATURE,'0');assert.equal(settings.FORMNARO_RELEASE_CANDIDATE_ONLY,'0');assert.equal(settings.FORMNARO_RELEASE_BUILD_ROOT,'work/test-build');
 for(const name of ['TASK_EVIDENCE','AI_METER','PROGRAM_ASSISTANT','PHOTO','PERSPECTIVE','MULTIVIEW','FEATURE_REFERENCES','FREECAD_DOCUMENT','AI_TASKS'])assert.equal(settings['FORMNARO_RELEASE_'+name],'1');
 assert.throws(()=>aiTaskReleaseSettings(['r1','--skip-tests']));assert.throws(()=>aiTaskReleaseSettings(['../r1']));assert.throws(()=>aiTaskReleaseSettings([],{FORMNARO_SIGNING_PROFILE:'unrequested-profile'}));
});
