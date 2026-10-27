import test from 'node:test';
import assert from 'node:assert/strict';
import {freeCADDocumentReleaseSettings} from '../scripts/freecad-document-release-config.mjs';

test('The FreeCAD document release requires signing and every earlier acceptance package despite inherited overrides',()=>{
 const s=freeCADDocumentReleaseSettings(['r3'],{FORMNARO_RELEASE_VERSION:'0.109.0',FORMNARO_REQUIRE_SIGNATURE:'0',FORMNARO_RELEASE_CANDIDATE_ONLY:'1'});
 assert.equal(s.FORMNARO_RELEASE_VERSION,'0.110.0');assert.equal(s.FORMNARO_REQUIRE_SIGNATURE,'1');assert.equal(s.FORMNARO_RELEASE_CANDIDATE_ONLY,'0');
 for(const key of ['TASK_EVIDENCE','AI_METER','PROGRAM_ASSISTANT','PHOTO','PERSPECTIVE','MULTIVIEW','FEATURE_REFERENCES','FREECAD_DOCUMENT'])assert.equal(s['FORMNARO_RELEASE_'+key],'1');
 assert.equal(s.FORMNARO_RELEASE_PROOF,'work/freecad-document/release-r3');assert.equal(s.FORMNARO_RELEASE_NAME,'FreeCAD-Parameter');
});
test('Explicit FreeCAD document candidates stay separate from old versions and signed release evidence',()=>{
 const s=freeCADDocumentReleaseSettings(['r2','--candidate-only'],{FORMNARO_RELEASE_BUILD_ROOT:'build-here',FORMNARO_RELEASE_OUTPUT_ROOT:'out-here'});
 assert.equal(s.FORMNARO_REQUIRE_SIGNATURE,'0');assert.equal(s.FORMNARO_RELEASE_CANDIDATE_ONLY,'1');assert.equal(s.FORMNARO_RELEASE_NAME,'FreeCAD-Parameter-Testkandidat');
 assert.equal(s.FORMNARO_RELEASE_PROOF,'work/freecad-document/candidate-r2');assert.equal(s.FORMNARO_RELEASE_BUILD_ROOT,'build-here');assert.equal(s.FORMNARO_RELEASE_OUTPUT_ROOT,'out-here');
 assert.throws(()=>freeCADDocumentReleaseSettings(['r1','--candidate-only'],{FORMNARO_SIGNING_PROFILE:'private/profile.json'}));
 for(const args of [['../r1'],['r1','--unsigned'],['r1','--candidate-only','--candidate-only']])assert.throws(()=>freeCADDocumentReleaseSettings(args));
});
