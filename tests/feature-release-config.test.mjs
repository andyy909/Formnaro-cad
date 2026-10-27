import test from 'node:test';
import assert from 'node:assert/strict';
import {featureReleaseSettings} from '../scripts/feature-release-config.mjs';

test('Normal feature release enforces signing despite inherited candidate overrides',()=>{
  const s=featureReleaseSettings(['r3'],{FORMNARO_REQUIRE_SIGNATURE:'0',FORMNARO_RELEASE_CANDIDATE_ONLY:'1'});
  assert.equal(s.FORMNARO_REQUIRE_SIGNATURE,'1');assert.equal(s.FORMNARO_RELEASE_CANDIDATE_ONLY,'0');
  assert.equal(s.FORMNARO_RELEASE_NAME,'KI-Merkmale');assert.equal(s.FORMNARO_RELEASE_FEATURE_REFERENCES,'1');
});
test('Explicit unsigned candidate has a separate output and proof identity',()=>{
  const s=featureReleaseSettings(['r2','--candidate-only']);
  assert.equal(s.FORMNARO_REQUIRE_SIGNATURE,'0');assert.equal(s.FORMNARO_RELEASE_CANDIDATE_ONLY,'1');
  assert.equal(s.FORMNARO_RELEASE_NAME,'KI-Merkmale-Testkandidat');assert.match(s.FORMNARO_RELEASE_PROOF,/candidate-r2$/);
});
test('Candidate cannot silently consume a configured signing identity or ambiguous options',()=>{
  assert.throws(()=>featureReleaseSettings(['r1','--candidate-only'],{FORMNARO_SIGNING_PROFILE:'private/profile.json'}));
  for(const args of [['../r1'],['r1','--unsigned'],['r1','--candidate-only','--candidate-only']])assert.throws(()=>featureReleaseSettings(args));
});
