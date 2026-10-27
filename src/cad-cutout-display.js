import * as THREE from 'three';

// View-only materials: no Boolean operation or changes to the CAD buffers.
export function setCadCutoutMaterial(material,cutout){
  material.onBeforeCompile=cutout?shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\nfloat cutoutStripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 16.0));\ndiffuseColor.rgb *= mix(0.62, 1.0, cutoutStripe);');
  }:()=>{};
  material.customProgramCacheKey=()=>cutout?'cad-cutout-stripes-v1':'cad-solid-v1';
  material.needsUpdate=true;
}

export function createCadCutoutDisplay(renderer){
  const depthScene=new THREE.Scene(),volumeScene=new THREE.Scene(),shadeScene=new THREE.Scene();
  const depthMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,colorWrite:false,depthWrite:true});
  const volumeMaterial=(side,operation)=>new THREE.MeshBasicMaterial({side,colorWrite:false,depthWrite:false,
    stencilWrite:true,stencilFunc:THREE.AlwaysStencilFunc,stencilZFail:operation});
  const backMaterial=volumeMaterial(THREE.BackSide,THREE.IncrementWrapStencilOp);
  const frontMaterial=volumeMaterial(THREE.FrontSide,THREE.DecrementWrapStencilOp);
  const shadeMaterial=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.36,depthTest:false,depthWrite:false,
    stencilWrite:true,stencilFunc:THREE.NotEqualStencilFunc,stencilRef:0,stencilWriteMask:0});
  const shadeGeometry=new THREE.PlaneGeometry(2,2),shade=new THREE.Mesh(shadeGeometry,shadeMaterial);
  shade.frustumCulled=false;shadeScene.add(shade);const shadeCamera=new THREE.Camera();
  const depthPool=[],volumePool=[];
  function proxy(pool,index,original,material,scene){
    let mesh=pool[index];if(!mesh){mesh=new THREE.Mesh(original.geometry,material);mesh.matrixAutoUpdate=false;pool[index]=mesh;scene.add(mesh);}
    const planes=original.material.clippingPlanes;
    if(planes?.length){const clipped=mesh.userData.clipMaterial??(mesh.userData.clipMaterial=material.clone());if(clipped.clippingPlanes!==planes){clipped.clippingPlanes=planes;clipped.needsUpdate=true;}mesh.material=clipped;}else mesh.material=material;
    mesh.geometry=original.geometry;mesh.matrix.copy(original.matrixWorld);mesh.matrixWorldNeedsUpdate=true;mesh.visible=true;
  }
  function trim(pool,length){while(pool.length>length){const mesh=pool.pop();mesh.userData.clipMaterial?.dispose();mesh.removeFromParent();mesh.geometry=null;}}
  function render(scene,camera,meshes,worldGroups,helpers){
    const visible=meshes.filter(mesh=>mesh.visible),holes=visible.filter(mesh=>mesh.userData.cutout);
    if(!holes.length){trim(depthPool,0);trim(volumePool,0);renderer.render(scene,camera);return;}
    const saved=new Map([...holes,...worldGroups,...helpers].map(object=>[object,object.visible]));
    const background=scene.background,autoClear=renderer.autoClear;
    try{
      for(const object of [...holes,...helpers])object.visible=false;
      renderer.render(scene,camera);
      renderer.autoClear=false;
      // Rebuild only body depth, excluding grids and manipulation controls.
      // This also supports transparent solids and temporary CAD previews.
      const solids=visible.filter(mesh=>!mesh.userData.cutout);
      solids.forEach((mesh,index)=>proxy(depthPool,index,mesh,depthMaterial,depthScene));trim(depthPool,solids.length);
      renderer.clearDepth();renderer.render(depthScene,camera);renderer.clearStencil();
      holes.forEach((mesh,index)=>{
        proxy(volumePool,index*2,mesh,backMaterial,volumeScene);
        proxy(volumePool,index*2+1,mesh,frontMaterial,volumeScene);
      });trim(volumePool,holes.length*2);
      // Count crossings behind the visible surface (z-fail winding). Curved,
      // affine and overlapping closed cutters work without CAD recomputation.
      renderer.render(volumeScene,camera);renderer.render(shadeScene,shadeCamera);
      renderer.clearStencil();
      for(const object of worldGroups)object.visible=false;
      for(const [object,value]of saved)if(helpers.includes(object))object.visible=value;
      for(const hole of holes){hole.visible=true;hole.parent.visible=true;}
      // In the final pass only cutters and controls are drawn over the marked
      // bodies. Hide their siblings without changing selection or raycasts.
      for(const mesh of visible)if(!mesh.userData.cutout){saved.set(mesh,mesh.visible);mesh.visible=false;}
      scene.background=null;renderer.render(scene,camera);
    }finally{
      for(const [object,value]of saved)object.visible=value;
      scene.background=background;renderer.autoClear=autoClear;
    }
  }
  return {render,dispose:()=>{trim(depthPool,0);trim(volumePool,0);for(const material of [depthMaterial,backMaterial,frontMaterial,shadeMaterial])material.dispose();shadeGeometry.dispose();}};
}
