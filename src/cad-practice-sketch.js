export function practiceSketchPoint(value) {
  return Array.isArray(value)&&value.length===2&&[value[0],value[1]].every(n=>Number.isFinite(n)&&Math.abs(n)<=10000);
}

export function practiceSketchGesture(value) {
  return !!value&&Object.keys(value).every(key=>['kind','point','to','add','text'].includes(key))&&
    practiceSketchPoint(value.point)&&(value.to===undefined||practiceSketchPoint(value.to))&&
    (value.add===undefined||typeof value.add==='boolean')&&
    (value.text===undefined||typeof value.text==='string'&&value.text.length<=600);
}

// Use the same SVG coordinate system as the editor's native pointer handler.
// Only points on the currently visible, unobstructed sketch board are valid.
export function locatePracticeSketchGesture(document,{point,to},{checkHit=true}={}) {
  const board=document.querySelector('dialog[open].sketch-modal #sketch-board');
  const rect=board?.getBoundingClientRect();
  const matrix=board?.getScreenCTM();
  if(!rect?.width||!rect.height||!matrix)throw Error('Die sichtbare Skizzenfläche fehlt.');
  const project=value=>{
    if(!practiceSketchPoint(value))throw Error('Ungültiger Skizzenpunkt in Millimetern.');
    const coordinate=board.createSVGPoint();
    coordinate.x=value[0];coordinate.y=-value[1];
    const pixel=coordinate.matrixTransform(matrix);
    const x=Math.round(pixel.x),y=Math.round(pixel.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<=rect.left||x>=rect.right||y<=rect.top||y>=rect.bottom||
       checkHit&&!board.contains(document.elementFromPoint(x,y)))throw Error('Skizzenpunkt liegt außerhalb der sichtbaren Zeichenfläche. Ansicht einpassen.');
    return {x,y};
  };
  return {...project(point),width:rect.width,height:rect.height,...(to?{to:project(to)}:{})};
}
