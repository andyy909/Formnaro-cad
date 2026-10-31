// Shared native/FNPACK scope. Drawing views retain their explicit source list;
// removed or excluded referenced copies must never be silently dropped.
export function planCadPatternDrawings(project,patterns,additionalRootIds=[]){
 const copies=new Set([...patterns.flatMap(pattern=>pattern.instances.map(item=>item.id)),...additionalRootIds]),views=[],roots=new Set();
 for(const sheet of project.drawings?.sheets??[])for(const view of sheet.views)if(view.sourceIds.some(id=>copies.has(id))){views.push({sheetId:sheet.id,viewId:view.id});for(const id of view.sourceIds)roots.add(id);}
 return {views,requiredRootIds:[...roots]};
}

export function patternDrawingReferenceScope(drawings,views,affected,retained){
 if(!drawings||!views?.length)return drawings;const approved=new Set(views.map(view=>JSON.stringify([view.sheetId,view.viewId]))),remaining=structuredClone(drawings);
 for(const sheet of remaining.sheets){const removed=new Set();sheet.views=sheet.views.filter(view=>{if(!approved.has(JSON.stringify([sheet.id,view.id])))return true;if(!view.sourceIds.some(id=>affected.has(id)))throw Error('Die Muster-Zeichnungsfreigabe gehört zu keiner betroffenen Kopie.');if(view.sourceIds.some(id=>affected.has(id)&&!retained.has(id)))throw Object.assign(Error('Eine gezeichnete Musterkopie würde entfallen. Zuerst die Ansicht ausdrücklich ändern oder die Kopie lösen.'),{code:'PATTERN_DRAWING_SOURCE_LOST'});removed.add(view.id);return false;});sheet.annotations=sheet.annotations.filter(annotation=>annotation.kind==='label'||!removed.has(annotation.viewId));}
 return remaining;
}
