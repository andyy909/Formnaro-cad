// Synthetic concentric triangle surfaces for isolated application verification.
function radialClearanceFixture(gap=.3,{shoulder=false}={}){
 const segments=128;
 function revolve(profile,id){
  const verts=[],triangles=[],rings=profile.map(([r,z])=>{const ids=[];for(let j=0;j<(r?segments:1);j++){ids.push(verts.length/3);verts.push(r*Math.cos(2*Math.PI*j/segments),r*Math.sin(2*Math.PI*j/segments),z);}return ids;});
  for(let i=0;i<rings.length;i++){const a=rings[i],b=rings[(i+1)%rings.length];if(a.length===1&&b.length===1)continue;for(let j=0;j<segments;j++){const k=(j+1)%segments;if(a.length===1)triangles.push(a[0],b[k],b[j]);else if(b.length===1)triangles.push(a[j],a[k],b[0]);else triangles.push(a[j],a[k],b[j],a[k],b[k],b[j]);}}
  return {id,kind:'mesh',name:id,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],meshRole:'solid',color:'#7ba8bf',mesh:{verts,triangles}};
 }
 return {source:revolve([[20,0],[20,26],[14-2/11,26],...(shoulder?[[16-16.15/11,18.15],[14.4,18.15],[14.4,18.1],[16-16.1/11,18.1]]:[]),[16+2/11,0]],'housing'),insert:revolve([[16-14/11-gap,16],[14-gap,24],[0,24],[0,16]],'insert')};
}
module.exports={radialClearanceFixture};
