// Mini CAD only needs the original affine validator and BRep size limit.
export const CAD_PROJECT_LIMITS={brepBytes:12*1024*1024};
export const CAD_IDENTITY_MATRIX=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function fail(path,message){throw Error(`CAD ${path}: ${message}`);}
function vector(value,count,path){if(!Array.isArray(value)||value.length!==count||value.some(v=>typeof v!=='number'||!Number.isFinite(v)))fail(path,'Endliche Zahlen erwartet.');return [...value];}
export function validateAffineMatrix(value,path='transform'){
  const matrix=vector(value,16,path);
  if(matrix[3]!==0||matrix[7]!==0||matrix[11]!==0||matrix[15]!==1)fail(path,'Eine affine Matrix mit letzter Zeile 0,0,0,1 wird benötigt.');
  // Row scaling permits very small/large finite scales without a fixed
  // determinant threshold. Also reject inverses that overflow JavaScript.
  const rows=[0,1,2].map(i=>{
    const row=[matrix[i],matrix[4+i],matrix[8+i]],scale=Math.max(...row.map(Math.abs));
    if(!scale)fail(path,'Singuläre Transformationsmatrix.');
    return [...row.map(v=>v/scale),...CAD_IDENTITY_MATRIX.slice(i*4,i*4+3).map(v=>v/scale)];
  });
  for(let col=0;col<3;col++){
    let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    if(rows[pivot][col]===0)fail(path,'Singuläre Transformationsmatrix.');
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const divisor=rows[col][col];rows[col]=rows[col].map(v=>v/divisor);
    for(let row=0;row<3;row++)if(row!==col){const factor=rows[row][col];rows[row]=rows[row].map((v,i)=>v-factor*rows[col][i]);}
  }
  if(rows.some(row=>row.some(v=>!Number.isFinite(v)))||rows.some(row=>!Number.isFinite(row.slice(3).reduce((sum,v,i)=>sum+v*matrix[12+i],0))))fail(path,'Transformationsmatrix ist numerisch nicht invertierbar.');
  return matrix;
}
