import assert from 'node:assert/strict';
import {advancedModelingReleaseSettings} from './advanced-modeling-release-config.mjs';
export function surfacesReleaseSettings(args,env={}){
 const [revision='r1',...extra]=args;assert.match(revision,/^r\d+$/);assert.equal(extra.length,0);
 return {...advancedModelingReleaseSettings([revision],env),FORMNARO_RELEASE_VERSION:'0.113.0',FORMNARO_RELEASE_NAME:'CAD-Flaechen',FORMNARO_RELEASE_LABEL:'Flächen und Prägungen',FORMNARO_RELEASE_PROOF:'work/surfaces/release-'+revision,FORMNARO_RELEASE_SURFACES:'1'};
}
