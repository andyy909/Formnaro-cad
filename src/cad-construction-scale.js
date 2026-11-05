// Largest singular value, independent of rotations on either side of A.
// Diagonalize the normalized symmetric Gram matrix with orthogonal Jacobi
// rotations; its final Gershgorin bound includes residual off-diagonal terms.
export function cadConstructionStretch(matrix){
 const values=[0,1,2,4,5,6,8,9,10].map(i=>matrix[i]);
 if(values.some(v=>!Number.isFinite(v)))throw Error('Ungültige CAD-Konstruktionstransformation.');
 const largest=Math.max(...values.map(Math.abs));if(!largest)throw Error('Singuläre CAD-Konstruktionstransformation.');
 const columns=[0,1,2].map(i=>matrix.slice(i*4,i*4+3)),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 // Treat only machine-roundoff-sized deviations as the same rigid placement.
 // The curve constructor reserves half its allowance for numerical error.
 if(columns.every((a,i)=>columns.every((b,j)=>Math.abs(dot(a,b)-(i===j?1:0))<=32*Number.EPSILON)))return 1;
 const normalized=columns.map(a=>a.map(v=>v/largest)),g=normalized.map(a=>normalized.map(b=>dot(a,b)));
 for(let sweep=0;sweep<12;sweep++)for(const [p,q]of [[0,1],[0,2],[1,2]]){
  const off=g[p][q];if(Math.abs(off)<=Number.EPSILON)continue;
  const tau=(g[q][q]-g[p][p])/(2*off),t=Math.sign(tau||1)/(Math.abs(tau)+Math.hypot(1,tau)),c=1/Math.hypot(1,t),s=t*c;
  const pp=g[p][p],qq=g[q][q];g[p][p]=pp-t*off;g[q][q]=qq+t*off;g[p][q]=g[q][p]=0;
  for(let k=0;k<3;k++)if(k!==p&&k!==q){const a=g[k][p],b=g[k][q];g[k][p]=g[p][k]=c*a-s*b;g[k][q]=g[q][k]=s*a+c*b;}
 }
 const eigenBound=Math.max(...g.map((row,i)=>row[i]+row.reduce((sum,v,j)=>sum+(j===i?0:Math.abs(v)),0))),bound=largest*Math.sqrt(Math.max(0,eigenBound)+128*Number.EPSILON);
 if(!Number.isFinite(bound)||bound<=0)throw Error('CAD-Transformation hat keine nachweisbare Genauigkeitsgrenze.');
 // Stable geometry keys under rigid-transform roundoff. The upward margin
 // exceeds both ten-significant-digit rounding and the 3x3 arithmetic error.
 const rounded=Number(bound.toPrecision(10));return rounded+Math.max(1,rounded)*1e-9;
}
