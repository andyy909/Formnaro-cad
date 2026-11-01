// Keep camera changes sparse and wait until consecutive numeric edits finish.
export function createPracticeFraming({now=()=>performance.now()}={}){
 const started=now();let count=0,lastAt=started,lastSize=null,lastStep=-1;
 return {consider({step,total,boundary,size,blocked=false}){
  if(blocked||!boundary||count>=3||!Number.isFinite(size)||size<=0)return false;
  const final=step===total-1,elapsed=now()-lastAt;
  if(!final&&(total<=8||elapsed<20000||step-lastStep<5))return false;
  // Repeating an unchanged framing adds no information, including at the end.
  const changed=lastSize===null||size/lastSize>1.6||size/lastSize<.625;
  if(!changed)return false;
  count++;lastAt=now();lastSize=size;lastStep=step;return true;
 },count:()=>count};
}

export function practiceSceneExtent(nodes){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let found=false;
 for(const node of nodes){const b=node.stats?.bounds,m=node.transform;if(!b||!m||node.hidden)continue;
  for(let corner=0;corner<8;corner++){const p=b.min.map((n,i)=>corner&(1<<i)?b.max[i]:n);
   for(let axis=0;axis<3;axis++){const v=m[axis]*p[0]+m[axis+4]*p[1]+m[axis+8]*p[2]+m[axis+12];min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v);}found=true;
  }
 }
 return found?Math.hypot(...max.map((n,i)=>n-min[i])):0;
}
