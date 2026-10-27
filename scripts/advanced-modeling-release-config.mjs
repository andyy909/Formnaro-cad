import assert from 'node:assert/strict';
import {aiTaskReleaseSettings} from './ai-task-release-config.mjs';
export function advancedModelingReleaseSettings(args,env={}){
 const [revision='r1',...extra]=args;assert.match(revision,/^r\d+$/);assert.equal(extra.length,0);
 return {...aiTaskReleaseSettings([revision],env),FORMNARO_RELEASE_VERSION:'0.112.0',FORMNARO_RELEASE_NAME:'CAD-Kurven',FORMNARO_RELEASE_LABEL:'Kurven und erweiterte CAD-Merkmale',FORMNARO_RELEASE_PROOF:'work/advanced-modeling/release-'+revision,FORMNARO_RELEASE_ADVANCED_MODELING:'1'};
}
