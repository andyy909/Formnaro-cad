import test from 'node:test';import assert from 'node:assert/strict';
import {createPracticePlayback} from '../src/cad-practice-playback.js';
test('Practice tempo scales presentation time and remains adjustable during a step',async()=>{
 let time=0,checks=0,change=false;const p=createPracticePlayback({now:()=>time,checkpoint:async()=>{checks++;},wait:async ms=>{time+=ms;if(change)p.setTempo(1);}});
 await p.delay(500);assert.equal(time,1000);assert(checks>=10);p.setTempo(4);time=0;await p.delay(500);assert.equal(time,2000);time=0;change=true;await p.delay(500);assert.equal(time,575);assert.throws(()=>p.setTempo(0));
});
test('Practice stop interrupts a slow presentation before the next input',async()=>{
 let stopped=false,time=0;const p=createPracticePlayback({now:()=>time,checkpoint:async()=>{if(stopped)throw Error('Stopped');},wait:async ms=>{time+=ms;stopped=true;}});p.setTempo(4);await assert.rejects(p.delay(5000),/Stopped/);assert.equal(time,100);
});

test('fine tempo range supports 10 to 300 percent and rejects values outside it',async()=>{
 let time=0;const p=createPracticePlayback({now:()=>time,checkpoint:async()=>{},wait:async ms=>{time+=ms;}});p.setTempo(10);await p.delay(300);assert.equal(time,3000);time=0;p.setTempo(1/3);await p.delay(300);assert(Math.abs(time-100)<1e-8);p.setTempo(100/65);assert.equal(p.multiplier(),100/65);for(const n of [0,NaN,Infinity,.32,10.1])assert.throws(()=>p.setTempo(n));
});
