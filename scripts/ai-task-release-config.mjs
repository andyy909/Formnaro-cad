import assert from 'node:assert/strict';
import {freeCADDocumentReleaseSettings} from './freecad-document-release-config.mjs';

export function aiTaskReleaseSettings(args,env={}){
 const [revision='r1',...options]=args;assert.match(revision,/^r\d+$/);assert.equal(options.length,0,'Unknown task release option');
 assert(!env.FORMNARO_SIGNING_PROFILE,'Task releases use the distribution mode selected by the project owner');
 return {...freeCADDocumentReleaseSettings([revision,'--candidate-only'],env),
  FORMNARO_RELEASE_VERSION:'0.111.0',FORMNARO_RELEASE_NAME:'KI-Auftraege',
  FORMNARO_RELEASE_LABEL:'Gespeicherte KI-Aufträge und sichere Fortsetzung',
  FORMNARO_RELEASE_PROOF:'work/ai-tasks/release-'+revision,
  FORMNARO_RELEASE_CANDIDATE_ONLY:'0',FORMNARO_REQUIRE_SIGNATURE:'0',
  FORMNARO_RELEASE_AI_TASKS:'1'
 };
}
