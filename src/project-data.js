import {horizontalPlane,validWorkplane} from './coordinates.js';
import {defaultOrganization,validateOrganization,repairAssignments} from './organization.js';
export function migrateProject(input){
  const s=structuredClone(input);if(typeof s.name==='string')s.name=s.name.slice(0,200);if(s.version!==undefined&&![1,2,3,4].includes(s.version))throw new Error('Nicht unterstützte Projektversion.');if(s.version>=2&&(!s.workplane||!s.layers||!s.folders||!s.coordinateMode))throw new Error('Projektversion 2 enthält unvollständige Einstellungen.');
  if(!s.workplane){s.workplane=horizontalPlane(s.planeZ||0);if(s.ruler)s.ruler.origin[2]-=s.workplane.origin[2];}if(!s.coordinateMode)s.coordinateMode='plane';
  if(!s.layers){const org=defaultOrganization();Object.assign(s,org);repairAssignments(s.nodes,org);}
  s.activeLayerId??='default';s.activeFolderId??=null;
  if(!validWorkplane(s.workplane)||!['plane','world'].includes(s.coordinateMode))throw new Error('Ungültige Arbeitsebene oder Koordinatenwahl.');
  validateOrganization(s,s.nodes);if(s.workplane.reference&&!s.nodes.some(n=>n.id===s.workplane.reference.objectId))throw new Error('Die Bezugsform der Arbeitsebene fehlt.');s.version=4;return s;
}
