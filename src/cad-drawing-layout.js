// Paper placement is independent of world placement. Keep the centre of the
// entire projected view at its paper anchor without moving any source curve.
function point(value){if(!Array.isArray(value)||value.length!==2||value.some(v=>!Number.isFinite(v)))throw Error('Ungültiger Zeichnungsbezug.');return value;}
function scale(value){if(!Number.isFinite(value)||value<=0)throw Error('Ungültiger Zeichnungsmaßstab.');return value;}
export function cadDrawingProjectionCenter(projection){if(!projection)return [0,0];const min=point(projection.bounds?.min),max=point(projection.bounds?.max);if(max.some((v,k)=>v<min[k]))throw Error('Ungültige Zeichnungsgrenzen.');return min.map((v,k)=>(v+max[k])/2);}
export function cadDrawingUpdatedPosition(position,previousProjection,nextProjection,paperScale){
 point(position);scale(paperScale);if(!nextProjection)throw Error('Die neue Zeichnungsprojektion fehlt.');
 const previous=cadDrawingProjectionCenter(previousProjection),next=cadDrawingProjectionCenter(nextProjection);
 return [position[0]+(previous[0]-next[0])*paperScale,position[1]+(next[1]-previous[1])*paperScale];
}
export function cadDrawingRescaledPosition(position,projection,previousScale,nextScale){
 point(position);scale(previousScale);scale(nextScale);const center=cadDrawingProjectionCenter(projection),difference=previousScale-nextScale;
 return [position[0]+center[0]*difference,position[1]-center[1]*difference];
}
export function cadDrawingNewViewPosition(viewCount,paperSize){
 if(!Number.isInteger(viewCount)||viewCount<0)throw Error('Ungültige Anzahl der Zeichnungsansichten.');const [width,height]=point(paperSize);
 if(width<100||height<100)throw Error('Das Zeichnungsblatt ist zu klein.');if(viewCount===3)return [165,145];
 const rows=Math.max(1,Math.floor((height-65-55)/65)+1);
 return [Math.max(40,Math.min(width-40,55+(viewCount%3)*75)),55+(Math.floor(viewCount/3)%rows)*65];
}
