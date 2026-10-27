const assert=require('node:assert/strict');
exports.runNavigationChecks=async({win,js,pause,check})=>{
  const api=win.webContents.debugger;if(!api.isAttached())api.attach('1.3');
  const view=()=>js('window.__mini.stats().viewport.view'),snapshot=()=>js('JSON.stringify(window.__mini.snapshot())'),history=()=>js('window.__mini.history()');
  const near=(a,b)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-7,`${a} != ${b}`));};
  async function pointer(type,p,button='none',buttons=0){await api.sendCommand('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button,buttons,clickCount:1});await pause(25);}
  async function drag(from,dx,dy,button,buttons){await pointer('mouseMoved',from);await pointer('mousePressed',from,button,buttons);for(let i=1;i<=5;i++)await pointer('mouseMoved',{x:from.x+dx*i/5,y:from.y+dy*i/5},button,buttons);await pointer('mouseReleased',{x:from.x+dx,y:from.y+dy},button,0);}
  const before=await snapshot(),undo=await history(),selected=await js('window.__mini.selected()');
  try{
    await check('held middle mouse pans complete view without rotation, scale or model changes',async()=>{
      for(const mode of ['iso','top']){
        await js(`window.__mini.fit(${mode==='top'?"'top'":"undefined"})`);await pause(50);
        const from=await js(`window.__mini.point(window.__mini.snapshot().nodes[0].pos)`),a=await view(),p=await js(`window.__mini.point(window.__mini.stats().viewport.view.target)`);
        await drag(from,65,35,'middle',4);const b=await view(),q=await js(`window.__mini.point(${JSON.stringify(a.target)})`);
        near(b.quaternion,a.quaternion);near(b.position.map((v,i)=>v-a.position[i]),b.target.map((v,i)=>v-a.target[i]));assert(Math.abs(b.distance-a.distance)<1e-7);assert(Math.hypot(...b.position.map((v,i)=>v-a.position[i]))>1);
        assert(Math.abs(q.x-p.x-65)<=2);assert(Math.abs(q.y-p.y-35)<=2);
      }
      assert.equal(await snapshot(),before);assert.deepEqual(await history(),undo);assert.deepEqual(await js('window.__mini.selected()'),selected);
    });
    await check('middle release ends panning and simple wheel click leaves view unchanged',async()=>{
      const a=await view(),p=await js(`window.__mini.point(window.__mini.stats().viewport.view.target)`);await pointer('mouseMoved',p);await pointer('mouseMoved',{x:p.x+30,y:p.y+15});near((await view()).position,a.position);
      await pointer('mousePressed',p,'middle',4);await pointer('mouseReleased',p,'middle',0);const b=await view();near(b.position,a.position);near(b.quaternion,a.quaternion);assert.equal(await snapshot(),before);assert.deepEqual(await history(),undo);
    });
    await check('wheel scrolling still zooms and right dragging still rotates without editing parts',async()=>{
      await js('window.__mini.fit()');const from=await js(`window.__mini.point(window.__mini.stats().viewport.view.target)`),a=await view();await api.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',x:from.x,y:from.y,deltaX:0,deltaY:-100});await pause(80);const b=await view();assert(b.distance<a.distance);near(b.quaternion,a.quaternion);
      await drag(from,45,20,'right',2);const c=await view();assert(Math.hypot(...c.quaternion.map((v,i)=>v-b.quaternion[i]))>.01);assert(Math.abs(c.distance-b.distance)<1e-7);assert.equal(await snapshot(),before);assert.deepEqual(await history(),undo);assert.deepEqual(await js('window.__mini.selected()'),selected);
    });
  }finally{if(api.isAttached())api.detach();await js('window.__mini.fit()');}
};
