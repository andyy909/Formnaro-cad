import assert from 'node:assert/strict';

// A normal release always requires the verified signing identity. The explicit
// candidate mode has its own folder and can only produce technical test evidence.
export function featureReleaseSettings(args,env={}){
  const [revision='r1',...options]=args;
  assert.match(revision,/^r\d+$/);
  assert(options.length<=1&&options.every(v=>v==='--candidate-only'),'Unknown release option');
  const candidate=options.includes('--candidate-only');
  if(candidate)assert(!env.FORMNARO_SIGNING_PROFILE,'Unsigned candidate mode cannot use a signing profile');
  const settings={
    FORMNARO_RELEASE_VERSION:'0.109.0',
    FORMNARO_RELEASE_NAME:candidate?'KI-Merkmale-Testkandidat':'KI-Merkmale',
    FORMNARO_RELEASE_LABEL:candidate?'Gezielte KI-Merkmaländerungen – unsignierter Testkandidat':'Gezielte KI-Merkmaländerungen',
    FORMNARO_RELEASE_PROOF:'work/ai-feature-references/'+(candidate?'candidate-':'release-')+revision,
    FORMNARO_RELEASE_BUILD_ROOT:env.FORMNARO_RELEASE_BUILD_ROOT??'work/release-build',
    FORMNARO_RELEASE_OUTPUT_ROOT:env.FORMNARO_RELEASE_OUTPUT_ROOT??'output',
    FORMNARO_RELEASE_CANDIDATE_ONLY:candidate?'1':'0',
    FORMNARO_REQUIRE_SIGNATURE:candidate?'0':'1'
  };
  for(const key of ['TASK_EVIDENCE','AI_METER','PROGRAM_ASSISTANT','PHOTO','PERSPECTIVE','MULTIVIEW','FEATURE_REFERENCES'])settings['FORMNARO_RELEASE_'+key]='1';
  return settings;
}
