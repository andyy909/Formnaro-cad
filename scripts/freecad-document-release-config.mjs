import {featureReleaseSettings} from './feature-release-config.mjs';

export function freeCADDocumentReleaseSettings(args,env={}){
 const settings=featureReleaseSettings(args,env),candidate=settings.FORMNARO_RELEASE_CANDIDATE_ONLY==='1';
 return {...settings,
  FORMNARO_RELEASE_VERSION:'0.110.0',
  FORMNARO_RELEASE_NAME:candidate?'FreeCAD-Parameter-Testkandidat':'FreeCAD-Parameter',
  FORMNARO_RELEASE_LABEL:candidate?'FreeCAD-Merkmale und Projektparameter – unsignierter Testkandidat':'FreeCAD-Merkmale und Projektparameter',
  FORMNARO_RELEASE_PROOF:'work/freecad-document/'+(candidate?'candidate-':'release-')+(args[0]??'r1'),
  FORMNARO_RELEASE_FREECAD_DOCUMENT:'1'
 };
}
