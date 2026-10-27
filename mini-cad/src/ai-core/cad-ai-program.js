// This contract exposes the application's geometry workers, never Electron,
// filesystem, providers, credentials, shell commands or arbitrary IPC.
const alias={type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,63}$'};
export const AI_PROGRAM_SCHEMAS=[
 {type:'object',additionalProperties:false,required:['op','engine','operation'],properties:{op:{const:'tool'},engine:{enum:['cad','mesh','converter','app']},operation:{type:'object',minProperties:1},as:alias}},
 {type:'object',additionalProperties:false,required:['op','code'],properties:{op:{const:'script'},code:{type:'string',minLength:1,maxLength:100000},name:{type:'string',maxLength:200},modules:{type:'object',maxProperties:32,additionalProperties:{type:'string',maxLength:1000000}}}}
];
export const AI_PROGRAM_TOOLS={
 version:1,
 nativeOperations:['create','form','finish','editFinish','tool','template','svg','plugin','cadToMesh','meshToCad','importStep','importStlHousing','batch'],
 nativeTools:['previewAlign','previewAnchor','previewWorkplane','previewPlace','previewLayOnFace','previewSplit','previewExtract','previewReferencePlacement','previewDrill','previewGroup','previewEditSource','previewSuppressSource','previewDissolve'],
 meshOperations:['mesh-create','mesh-create-source','mesh-replace-source','mesh-from-data','mesh-group','mesh-split','mesh-drill','mesh-finish','mesh-extract-bodies','mesh-dissolve','mesh-role','mesh-repair','mesh-simple-repair','mesh-close-hole','mesh-source-edit','mesh-connectors','mesh-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill','mesh-make-solid','mesh-hollow','mesh-lid','mesh-counterpart'],
 queries:{cad:['scene','bounds','rayPick','minimumDistance','referencePoints','edges','edgesInRectangle','section','svgProjection','wallThickness','collision'],mesh:['inspectSolid','analyzeEdges','toolsQuery','selection','inspect','holeCatalog','repairCatalog','digest','featureCatalog','radialClearance','resultChecks'],converter:['analyze'],app:['resources','textContours','svgContours','bounds']},
 commonTools:'engine:"app" operations: {kind:"fit",target,options:{gap,axes:[0,1],kind:"insert"|"opening"},copy?}; {kind:"reference",target,source:[x,y,z],reference:{point,normal},offset?}; {kind:"floor",target,triangleIndex,point,ground?}; {kind:"magnet",target,reference:{point,normal}}; {kind:"ruler",origin:[x,y,z]|null,mode:"min"|"center"}. These are the same shared UI helpers. Fit scales along chosen object axes; it is not a true arbitrary-surface offset. Use measured world coordinates. floor refers to a real source mesh triangle. app/bounds queries use options {id,frame?}. UI selection/brush/lasso data can also be calculated locally from api.model and queried mesh selections.',
 converter:'{op:"tool",engine:"converter",operation:{kind:"convert",target,options?},as?} uses the existing local STL-to-CAD converter on this model part only, then imports an independently checked native CAD copy. Query converter/analyze with options {target,options?,edits?,commands?} to inspect/correct recognized regions; pass resulting region edits via conversion options.region_edits. The original is preserved. Units remain the current model millimeters. No external file path or converter executable can be chosen.',
 resources:'Query app/resources for loaded fonts and enabled form-package manifests. Query app/textContours with {text,font?} or app/svgContours with {svg} to get locally computed original outline paths for mesh-create-source (shape:text/svg, paths, height and text/font as needed). Mesh scripts use the same source construction and saved recipes as UI. No installed fonts or form packages are read from arbitrary paths.',
 dataShapes:'api.model() returns the project with nodes:[root,...]. objects is an alias for the same raw root array; this is not the flattened prepared scene. Each root has id,kind,name,transform and either native recipe/BRep/children or mesh:{verts,triangles}. Query cad/scene for flattened scene.objects with prepared measurements and native source paths. Mesh inspectSolid options:{id} (target and nodeId are accepted aliases) returns {ok:true,closed:true,volume,geometryDigest,triangles} only after real kernel proof; a failed proof throws. Other raw mesh topology diagnostics use mesh/inspect. Never infer a solid from bounds alone.',
 queryExamples:[{engine:'mesh',kind:'hollowCatalog',options:{id:'CURRENT_ROOT_ID'}},{engine:'mesh',kind:'toolsQuery',options:{kind:'hollowCatalog',id:'CURRENT_ROOT_ID'}},{engine:'mesh',kind:'selection',options:{id:'CURRENT_ROOT_ID',options:{mode:'surface',triangleIndex:0,angleDegrees:30}}},{engine:'mesh',kind:'inspectSolid',options:{id:'CURRENT_ROOT_ID'}},{engine:'app',kind:'bounds',options:{id:'CURRENT_ROOT_ID'}}],
 toolTargets:'Generic mesh operations use id; target is an accepted equivalent for a single root. ids remains the explicit multi-root list. Query any named meshCatalog directly using kind:catalogName or through kind:toolsQuery/options.kind. The one existing method for each meshOptions tool is supplied when omitted, matching the UI; caller-supplied methods are still validated. Digests, ring/edge/triangle identifiers and physical parameters must still come from actual measurements and the user task.',
 meshCatalogs:['radialClearance','featureCatalog','lidCatalog','reduceCatalog','remeshCatalog','smoothCatalog','sculptCatalog','eraseFillCatalog','makeSolidCatalog','hollowCatalog','autoRepair','inspect','section','svg','colors'],
 meshOptions:{
  'mesh-simple-repair':{method:'simple-v1',geometryDigest:'from repairCatalog',removeDegenerate:true,removeDuplicates:true,orient:true,smallTriangleLimit:0,removeComponents:[]},
  'mesh-close-hole':{method:'planar-cap-v1',geometryDigest:'from holeCatalog',ringId:'observed ring ID'},
  'mesh-reduce':{method:'planar-v1',geometryDigest:'from reduceCatalog',scope:'all or selection',triangleIds:[],targetMode:'percent or count',target:50,maxDeviation:.1},
  'mesh-remesh':{method:'planar-isotropic-v1',mode:'subdivide or remesh',geometryDigest:'from remeshCatalog',scope:'all or selection',triangleIds:[],targetEdgeLength:2,iterations:1,maxDeviation:.1},
  'mesh-sculpt':{method:'bounded-brush-v1',geometryDigest:'from sculptCatalog',triangleIds:null,maxDeviation:1,symmetry:null,strokes:[{tool:'inflate',radius:5,strength:.3,points:[[0,0,0]],normal:[0,0,1],delta:[0,0,0]}]},
  'mesh-smooth':{method:'bounded-laplacian-v1',geometryDigest:'from smoothCatalog',triangleIds:['actual selected face IDs'],strength:.3,iterations:3,maxDeviation:.1,featureAngle:30},
  'mesh-erase-fill':{method:'planar-replace-v1',geometryDigest:'from eraseFillCatalog',triangleIds:['actual selected face IDs']},
  'mesh-make-solid':{method:'voxel-wrap-v1',geometryDigest:'from makeSolidCatalog',resolution:1,closingRadius:0,offset:0},
  'mesh-hollow':{method:'signed-distance-shell-v1',geometryDigest:'from hollowCatalog',wallThickness:2,resolution:.5,drains:[]}
 },
 usage:'All existing geometry worker operations are available through {op:"tool",engine:"cad"|"mesh",operation:{...},as?}. They use the same options, geometry validators, numerical limits and retained sources as the corresponding UI tools. This is not a separate reduced AI tool list. Read query results before choosing topology IDs or digests. Resolve $aliases in target/id/ids fields. New independent copies may omit id/resultId; the application supplies fresh IDs. Explicit conversions are now available when requested; do not silently convert or repair unrelated parts.',
 scripts:'{op:"script",code,name?} runs JavaScript locally in an opaque sandbox Worker. Code is an async function body with api. await api.model() returns only the current model snapshot. await api.query({engine,kind,options}) reads current draft geometry. await api.run(command) executes any documented command/tool on that draft and returns aliases, report and changed IDs. Calls are serialized. You can calculate contours, fit dimensions, select triangles, iterate and combine tools, or generate new mesh data with mesh-from-data. Return a JSON-compatible calculation summary. No code is run in the renderer or Electron main process. No filesystem, network, credentials, system commands, package installation or arbitrary desktop IPC is provided. Everything remains one transient preview; errors/cancel discard it and Apply creates one Undo.',
 newMesh:'{op:"tool",engine:"mesh",operation:{type:"mesh-from-data",mesh:{verts:[x,y,z,...],triangles:[i,j,k,...]},name?,color?,transform?},as?} creates a new independently kernel-checked closed material mesh. Existing parts cannot be replaced by raw data; use existing source-preserving tools. Model data and calculations remain local unless included in normal AI messages.',
 boundary:'The scope is the current Formnaro model and its geometry tools. Loading arbitrary paths, reading program source, provider settings, clipboard or unrelated files is unavailable. Code execution is local; the connected AI provider still receives the normal explicitly sent prompt, context, scene and attachments.'
 ,modules:'A script may supply modules:{name:ES-module-source} and load them locally with await api.importTool(name). Alternatively await api.importTool(name, sourceText) adds a tool module dynamically. This imports source text already supplied inside the program, not a filesystem path or remote URL. Imported tools execute inside the same opaque Worker, with the same CSP and model-only capability boundary. Modules can export functions/classes and use globalThis.formnaro for the same model API. Their transitive imports cannot access external network or files. Imported module results and generated geometry use the same preview, cancellation and validation pipeline.'
};
const fail=message=>{throw Object.assign(Error(message),{code:'AI_PROGRAM'});};
export function validateProgramCommand(c){
 if(!c||Object.getPrototypeOf(c)!==Object.prototype)fail('Ungültiger Programmauftrag.');
 const allowed=c.op==='tool'?['op','engine','operation','as']:c.op==='script'?['op','code','name','modules']:[];
 if(!allowed.length||Object.keys(c).some(k=>!allowed.includes(k)))fail('Unbekannte Felder im Programmauftrag.');
 if(c.as!==undefined&&(typeof c.as!=='string'||!new RegExp(alias.pattern).test(c.as)))fail('Ungültiger Ergebnisalias.');
 if(c.op==='tool'){
  if(!['cad','mesh','converter','app'].includes(c.engine)||!c.operation||Object.getPrototypeOf(c.operation)!==Object.prototype||typeof c.operation[c.engine==='mesh'?'type':'kind']!=='string')fail('Ein vorhandenes Modellierwerkzeug wählen.');
 }else{
  if(typeof c.code!=='string'||!c.code.trim()||c.code.length>100000||c.name!==undefined&&(typeof c.name!=='string'||c.name.length>200))fail('Ungültige lokale Berechnung.');
  if(c.modules!==undefined&&(!c.modules||Object.getPrototypeOf(c.modules)!==Object.prototype||Object.keys(c.modules).length>32||Object.entries(c.modules).some(([k,v])=>!k||k.length>200||typeof v!=='string'||v.length>1000000)||JSON.stringify(c.modules).length>4000000))fail('Ungültige interne Werkzeugmodule.');
 }
 return structuredClone(c);
}
export function resolveProgramAliases(value,aliases,key=''){
 if(typeof value==='string'&&['target','targets','rootId','id','ids','nodeId','leftId','rightId','referenceTarget'].includes(key)&&value.startsWith('$')){
  const result=aliases[value.slice(1)];if(result===undefined)fail('Unbekannter Ergebnisalias '+value+'.');return structuredClone(result);
 }
 if(Array.isArray(value))return value.map(v=>resolveProgramAliases(v,aliases,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveProgramAliases(v,aliases,k)]));
 return value;
}
