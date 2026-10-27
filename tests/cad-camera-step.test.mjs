import test from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,OrthographicCamera} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createCadCameraStep} from '../src/cad-camera-step.js';
const pose=(camera,orbit)=>[...camera.position.toArray(),...camera.quaternion.toArray(),...orbit.target.toArray(),camera.zoom];
for(const Camera of [PerspectiveCamera,OrthographicCamera])test(Camera.name+' idle repaints preserve the exact saved view with real OrbitControls',()=>{
 const camera=new Camera();camera.position.set(67.85704394417728,-85.85993315385474,73.62671920720236);camera.up.set(0,0,1);const orbit=new OrbitControls(camera,null);orbit.target.set(0,0,10);orbit.enableDamping=true;orbit.update();const before=pose(camera,orbit),step=createCadCameraStep({getCamera:()=>camera,orbit});for(let i=0;i<100;i++){assert.equal(step().moving,false);assert.deepEqual(pose(camera,orbit),before);}assert.equal(orbit.enableDamping,true);
});
test('real damping motion and programmatic camera changes are preserved, then settle to a stable exact pose',()=>{
 const camera=new PerspectiveCamera();camera.position.set(100,-130,110);const orbit=new OrbitControls(camera,null);orbit.enableDamping=true;const step=createCadCameraStep({getCamera:()=>camera,orbit}),before=pose(camera,orbit);
 // A real programmatic control operation creates pending angular damping.
 orbit._sphericalDelta.theta=.2;
 assert.equal(step().moving,true);assert.notDeepEqual(pose(camera,orbit),before);let count=0;while(step().moving&&count++<2000){}assert.ok(count<2000);const settled=pose(camera,orbit);for(let i=0;i<50;i++)step();assert.deepEqual(pose(camera,orbit),settled);
 camera.position.set(20,-40,60);orbit.target.set(4,3,2);orbit.update();const fitted=pose(camera,orbit);step();assert.deepEqual(pose(camera,orbit),fitted);
});
