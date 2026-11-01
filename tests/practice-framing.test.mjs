import test from 'node:test';import assert from 'node:assert/strict';
import {createPracticeFraming,practiceSceneExtent} from '../src/cad-practice-framing.js';
test('Short dimension sequences keep the camera still and frame once at completion',()=>{
 let clock=0;const framing=createPracticeFraming({now:()=>clock}),moves=[];
 for(let step=0;step<4;step++){clock+=6000;if(framing.consider({step,total:4,boundary:step===3,size:20+step*20}))moves.push(step);}
 assert.deepEqual(moves,[3]);
});
test('Long exercises do not repeat unchanged views and never exceed three camera fits',()=>{
 let clock=0;const framing=createPracticeFraming({now:()=>clock}),moves=[];
 for(let step=0;step<50;step++){clock+=6000;if(framing.consider({step,total:50,boundary:step%5===4,size:step<15?20:step<30?80:400}))moves.push(step);}
 assert.equal(moves.length,3);assert(moves.every((n,i)=>i===0||n-moves[i-1]>=5));assert(moves[1]>=15);assert(moves[2]>=30);
});
test('The extent includes transformed roots and their separation rather than only the selected object',()=>{
 const matrix=x=>[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1],bounds={min:[0,0,0],max:[10,10,10]};
 assert.equal(practiceSceneExtent([{stats:{bounds},transform:matrix(0)},{stats:{bounds},transform:matrix(100)}]),Math.hypot(110,10,10));
});
