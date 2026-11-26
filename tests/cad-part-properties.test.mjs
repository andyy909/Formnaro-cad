import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePartProperties,partSurfaceDigest,partSurfaceState,paintPartFaces,partFaceColors,splitPartSurfaceMesh,validateExplosion,explosionOffsets,summarizeParts,groupPartRows,groupPartSummary,partsCsv,partRowIdentity} from '../src/cad-part-properties.js';
import {createPartPropertiesService} from '../src/cad-part-properties-service.js';
import {explodedPartPlacement} from '../src/cad-part-display-placement.js';
import {createCadProject,cadProjectSnapshot,parseCadProject,serializeCadProject,createCadWorkspaceSerializer} from '../src/cad-project.js';
import {
  encodeFnpackProject,
  createFnpackResolver,
  materializedFnpackProject,
  stripGeometryIdentity,
} from '../src/cad-fnpack-data.js';
import {
  captureCadLinkedClipboard,
  insertCadLinkedClipboard,
} from '../src/cad-linked-contours-clipboard.js';
import { createCadPersistence } from '../src/cad-persistence.js';
import { CAD_QUALITY_DEFAULTS } from '../src/cad-quality.js';
import {defaultLayout} from '../src/layout-preferences.js';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const node=()=>({id:'tetra',kind:'mesh',name:'Tetraeder',transform:[...identity],meshRole:'solid',mesh:{verts:[0,0,0,2,0,0,0,4,0,0,0,6],triangles:[0,2,1,0,1,3,1,2,3,2,0,3]},color:'#8899aa',opacity:1,layerId:'default',folderId:null,metadata:{notes:'Original'}});
test('Explicit density is required for a mass; colors and names never invent one',()=>{
 assert.deepEqual(validatePartProperties({version:1,material:{name:'Kunststoff',densityGcm3:null}}),{version:1,material:{name:'Kunststoff',densityGcm3:null}});
 for(const densityGcm3 of [undefined,0,-1,Infinity,NaN,1001,'1.2'])assert.throws(()=>validatePartProperties({version:1,material:{name:'Material',densityGcm3}}));
 const a=summarizeParts([{id:'a',massG:2,centerMm:[0,0,0]},{id:'b',massG:null,centerMm:[10,0,0]}]);assert.equal(a.complete,false);assert.equal(a.totalMassG,null);assert.equal(a.centerMm,null);assert.equal(a.knownMassG,2);
 const b=summarizeParts([{massG:1,centerMm:[0,2,4]},{massG:3,centerMm:[8,6,0]}]);assert.equal(b.totalMassG,4);assert.deepEqual(b.centerMm,[6,5,1]);
});
test('Surface groups retain exact geometry and are invalidated by payload edits, not placement',()=>{
 const n=node(),before=structuredClone(n.mesh);paintPartFaces(n,{name:'Oben',color:'#ff0000',faceIds:[2]});assert.deepEqual(n.mesh,before);assert(partSurfaceState(n).current);
 n.transform[12]=40;assert(partSurfaceState(n).current);paintPartFaces(n,{name:'Kante',color:'#00ff00',faceIds:[1,2]});assert.deepEqual(n.metadata.partProperties.surfaces.groups,[{name:'Kante',color:'#00ff00',faceIds:[1,2]}]);
 const parts=splitPartSurfaceMesh(n,{vertices:n.mesh.verts,triangles:n.mesh.triangles});assert.equal(parts.reduce((a,p)=>a+p.mesh.triangles.length/3,0),4);assert(parts.some(p=>p.color==='#00ff00'&&p.mesh.triangles.length===6));
 n.mesh.verts[0]=.1;assert.equal(partSurfaceState(n).current,false);assert.equal(splitPartSurfaceMesh(n,{vertices:n.mesh.verts,triangles:n.mesh.triangles}).length,1);
});
test('New properties upgrade only used projects to 25; old declarations cannot smuggle them',async()=>{
 const n=node(),base=createCadProject({nodes:[n]});assert.equal(base.version,8);n.metadata.partProperties={version:1,material:{name:'Explizit',densityGcm3:2}};paintPartFaces(n,{name:'Farbe',color:'#124abc',faceIds:[0]});const p=cadProjectSnapshot({...base,nodes:[n]});assert.equal(p.version,25);assert.deepEqual(parseCadProject(serializeCadProject(p)),p);assert.throws(()=>parseCadProject({...p,version:24}));
 const encoded=encodeFnpackProject(p);const ref=encoded.project.nodes[0];assert.equal(partSurfaceDigest(n),partSurfaceDigest(ref));const resolver=createFnpackResolver({readBlock:async hash=>encoded.blocks.find(b=>b.sha256===hash).bytes});const restored=await resolver.hydrate(encoded.project);assert(partSurfaceState(restored.nodes[0]).current);assert.equal(restored.nodes[0].metadata.partProperties.material.densityGcm3,2);
});
test('Optional part numbers are stored as text on each body and require format 35', async () => {
  const left = node(),
    right = { ...node(), id: 'neighbor' };
  const original = createCadProject({ nodes: [left, right] });
  assert.equal(original.version, 8);
  assert.equal(parseCadProject(serializeCadProject(original)).nodes[0].metadata.partProperties, undefined);
  left.metadata.partProperties = { version: 1, partNumber: ' 0007-Ä ' };
  right.metadata.partProperties = { version: 1, partNumber: 'B/12' };
  const numbered = cadProjectSnapshot({ ...original, nodes: [left, right] });
  assert.equal(numbered.version, 35);
  assert.throws(() => parseCadProject({ ...numbered, version: 32 }), /Teilenummern/);
  assert.throws(() => parseCadProject({ ...numbered, version: 34 }), /Teilenummern/);
  assert.deepEqual(
    parseCadProject(serializeCadProject(numbered)).nodes.map((part) => [part.id, part.name, part.metadata.partProperties.partNumber]),
    [['tetra', 'Tetraeder', '0007-Ä'], ['neighbor', 'Tetraeder', 'B/12']],
  );
  for (const partNumber of [8, null, '', '   ', 'A\nB', 'X'.repeat(121)])
    assert.throws(() => validatePartProperties({ version: 1, partNumber }), /Teilenummer/);

  const encoded = encodeFnpackProject(numbered);
  const resolver = createFnpackResolver({ readBlock: async (hash) => encoded.blocks.find((block) => block.sha256 === hash).bytes });
  const restored = materializedFnpackProject(await resolver.hydrate(encoded.project));
  assert.deepEqual(restored, numbered);
  assert.deepEqual(materializedFnpackProject(original), original);
  const mixed = createCadProject({ nodes: [...numbered.nodes, { ...node(), id: 'unnumbered' }] });
  const clip = captureCadLinkedClipboard(mixed, [{ rootId: 'unnumbered', path: [] }], { scope: 'source' });
  clip.nodes = stripGeometryIdentity(clip.nodes);
  clip.closure.nodes = stripGeometryIdentity(clip.closure.nodes);
  const target = createCadProject();
  insertCadLinkedClipboard(target, clip, { scope: 'target', offset: [0, 0, 0] });
  assert.equal(cadProjectSnapshot(target).version, original.version);
  assert.equal(target.nodes[0].metadata.partProperties, undefined);
});

test('B01-03: Copying, library insertion, legacy files and fnpack with numbered parts', async () => {
  // 1. Numbered screw and unnumbered neighbor part
  const screw = {
    ...node(),
    id: 'screw-1',
    name: 'DIN 912 M5x20',
    metadata: { partProperties: { version: 1, partNumber: 'NORM-912-M5-20' } },
  };
  const plate = {
    ...node(),
    id: 'plate-1',
    name: 'Distanzplatte',
    metadata: {},
  };
  const project = cadProjectSnapshot(createCadProject({ nodes: [screw, plate] }));
  assert.equal(project.version, 35);

  // 2. Clipboard copy and paste of numbered screw
  const clip = captureCadLinkedClipboard(project, [{ rootId: 'screw-1', path: [] }], { scope: 'source' });
  clip.nodes = stripGeometryIdentity(clip.nodes);
  clip.closure.nodes = stripGeometryIdentity(clip.closure.nodes);
  const targetProject = createCadProject();
  insertCadLinkedClipboard(targetProject, clip, { scope: 'target', offset: [20, 0, 0] });
  const targetSnapshot = cadProjectSnapshot(targetProject);
  assert.equal(targetSnapshot.version, 35);
  assert.notEqual(targetSnapshot.nodes[0].id, 'screw-1');
  assert.equal(targetSnapshot.nodes[0].name, 'DIN 912 M5x20');
  assert.equal(targetSnapshot.nodes[0].metadata?.partProperties?.partNumber, 'NORM-912-M5-20');

  // Copying unnumbered plate preserves clean unnumbered state and does not force format 35
  const clipPlate = captureCadLinkedClipboard(project, [{ rootId: 'plate-1', path: [] }], { scope: 'source' });
  clipPlate.nodes = stripGeometryIdentity(clipPlate.nodes);
  clipPlate.closure.nodes = stripGeometryIdentity(clipPlate.closure.nodes);
  const targetPlateProject = createCadProject();
  insertCadLinkedClipboard(targetPlateProject, clipPlate, { scope: 'target', offset: [0, 0, 0] });
  assert.equal(cadProjectSnapshot(targetPlateProject).version, 8);
  assert.equal(targetPlateProject.nodes[0].metadata?.partProperties?.partNumber, undefined);

  // 3. Template Library Save & Preview (Insertion)
  const storage = new Map();
  const transactions = {
    snapshot: () => project,
    preview: async (value) => value,
    revision: () => 'rev-screw-test',
  };
  const persistence = createCadPersistence({
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    transactions,
    verify: async (p) => parseCadProject(serializeCadProject(p)),
  });

  persistence.saveTemplate({ name: 'Zylinderschraube', ids: ['screw-1'] });
  const encodedLib = persistence.exportLibrary();
  const library = JSON.parse(encodedLib);
  assert.equal(library.version, 35);
  assert.equal(library.items[0].project.version, 35);
  assert.equal(library.items[0].project.nodes[0].metadata.partProperties.partNumber, 'NORM-912-M5-20');

  // Preview insertion from template produces fresh ID and retains part number
  const insertProposal = await persistence.previewTemplate({ id: library.items[0].id, revision: 'rev-screw-test' });
  assert.equal(insertProposal.project.nodes.length, 3);
  const insertedNode = insertProposal.project.nodes.find((n) => n.id !== 'screw-1' && n.id !== 'plate-1');
  assert.ok(insertedNode);
  assert.equal(insertedNode.name, 'DIN 912 M5x20');
  assert.equal(insertedNode.metadata.partProperties.partNumber, 'NORM-912-M5-20');

  // Saving template of only unnumbered part retains base library version (not forced to 35)
  const unnumberedStorage = new Map();
  const unnumberedPersistence = createCadPersistence({
    storage: { getItem: (k) => unnumberedStorage.get(k) ?? null, setItem: (k, v) => unnumberedStorage.set(k, v) },
    transactions: { snapshot: () => createCadProject({ nodes: [plate] }), preview: async (v) => v, revision: () => 'rev-u' },
    verify: async (p) => parseCadProject(serializeCadProject(p)),
  });
  unnumberedPersistence.saveTemplate({ name: 'Platte', ids: ['plate-1'] });
  const unnumberedLib = JSON.parse(unnumberedPersistence.exportLibrary());
  assert.equal(unnumberedLib.version, 8);

  // 4. Legacy format 5 project verification (portable inline format-5 .ocad)
  const legacyProject = parseCadProject(
    serializeCadProject(
      createCadProject({
        nodes: [
          {
            id: 'legacy-a',
            kind: 'cad',
            name: 'Distanzstück',
            transform: [...identity],
            recipe: { type: 'box', size: [20, 14, 5] },
            brep: { format: 'OpenCascade-BRep', data: 'CASCADE Topology V3', triangulation: false },
            stats: { volume: 1400, solids: 1, bounds: { min: [-10, -7, -2.5], max: [10, 7, 2.5] } },
            solid: true,
            source: 'native',
            layerId: 'default',
            folderId: null,
          },
          {
            id: 'legacy-b',
            kind: 'cad',
            name: 'Distanzstück',
            transform: [...identity],
            recipe: { type: 'box', size: [20, 14, 5] },
            brep: { format: 'OpenCascade-BRep', data: 'CASCADE Topology V3', triangulation: false },
            stats: { volume: 1400, solids: 1, bounds: { min: [-10, -7, -2.5], max: [10, 7, 2.5] } },
            solid: true,
            source: 'native',
            layerId: 'default',
            folderId: null,
          },
        ],
      }),
    ),
  );
  assert.equal(legacyProject.version, 5);
  assert.equal(legacyProject.nodes.length, 2);
  for (const legacyNode of legacyProject.nodes) {
    assert.equal(legacyNode.metadata?.partProperties?.partNumber, undefined);
  }

  // 5. .fnpack roundtrip of format 35 project
  const encodedPack = encodeFnpackProject(project);
  const resolver = createFnpackResolver({ readBlock: async (hash) => encodedPack.blocks.find((b) => b.sha256 === hash).bytes });
  const hydrated = materializedFnpackProject(await resolver.hydrate(encodedPack.project));
  assert.deepEqual(hydrated, project);
  assert.equal(hydrated.version, 35);
  assert.equal(hydrated.nodes[0].metadata.partProperties.partNumber, 'NORM-912-M5-20');
});
test('Explosion vectors produce display offsets with no changes to mounting matrices',()=>{
 const p=createCadProject({nodes:[node()]}),before=serializeCadProject(p),e={version:1,distance:40,parts:[{id:'tetra',direction:[0,0,1]},{id:'removed',direction:[1,0,0]}]};assert.deepEqual(explosionOffsets(e,p),[{id:'tetra',offset:[0,0,40]}]);assert.equal(serializeCadProject(p),before);assert.throws(()=>validateExplosion({...e,distance:-1}));assert.throws(()=>validateExplosion({...e,parts:[{id:'tetra',direction:[0,0,2]}]}));
});
test('CSV retains material and unit columns, quotes separators and neutralizes spreadsheet formulas',()=>{
 const csv=partsCsv({rows:[{id:'1',name:'=1+1',material:'A;B',densityGcm3:2,volumeMm3:8,massG:.016,centerMm:[.5,-1,1.5],status:'Geprüft'}]});assert(csv.includes('"\'=1+1"'));assert(csv.includes('"A;B"'));assert(csv.includes('Masse g'));assert(csv.includes('"0.016"'));assert(csv.includes('"-1"'));assert(!csv.includes('"\'-1"'));
});
test('A cached workspace serializer switches between load-set and explosion format without retaining an old prefix',()=>{
 const serialize=createCadWorkspaceSerializer(createCadProject()),base={version:5,view:{projection:'perspective',position:[100,-100,100],target:[0,0,0],up:[0,0,1],zoom:1},selection:[],mode:'translate',snap:1,quality:structuredClone(CAD_QUALITY_DEFAULTS),layout:defaultLayout(),tree:{expanded:[]},loadSet:null};
 assert.equal(parseCadProject(serialize(base)).version,8);
 const e={...base,version:6,explosion:{version:1,distance:30,parts:[]}};assert.equal(parseCadProject(serialize(e)).version,25);assert.equal(parseCadProject(serialize(base)).version,8);assert.equal(parseCadProject(serialize({...e,explosion:{...e.explosion,distance:60}})).workspace.explosion.distance,60);
});
test('Painting one imported STEP face preserves every unselected imported face color and source group priority',()=>{
 const imported=[{faceIndex:1,color:'#ff0000',opacity:1},{faceIndex:2,color:'#00ff00',opacity:1}],n={kind:'cad',source:'step',brep:{format:'OpenCascade-BRep',data:'synthetic identity only'},metadata:{stepFaceColors:structuredClone(imported)},color:'#8294aa',opacity:1};
 paintPartFaces(n,{name:'Eigene',color:'#0000ff',faceIds:[1]});assert.equal(partFaceColors(n).find(f=>f.faceIndex===1).color,'#0000ff');assert.equal(partFaceColors(n).find(f=>f.faceIndex===2).color,'#00ff00');assert.deepEqual(n.metadata.stepFaceColors,imported);
 n.multicolor=true;n.children=[{}];assert.equal(partSurfaceState(n).active,false);assert.throws(()=>paintPartFaces(n,{name:'X',color:'#ffffff',faceIds:[2]}),/Quellenfarben/);assert.deepEqual(partFaceColors(n),imported);
 n.multicolor=false;assert.equal(partSurfaceState(n).active,true);delete n.metadata.partProperties.surfaces;assert.deepEqual(partFaceColors(n),imported);
 const mesh=node();mesh.meshSource={appearance:{multicolor:true}};assert.throws(()=>paintPartFaces(mesh,{name:'X',color:'#ffffff',faceIds:[0]}),/Quellenfarben/);
});

test('B04-01: Gruppiere Stücklistenzeilen nach Definitions- und Ausführungsidentität', () => {
  const rows = [
    { id: 's1', definitionId: 'def-screw', name: 'Zylinderschraube M5x20', partNumber: 'ISO4762-M5-20', material: 'Stahl', densityGcm3: 7.85, volumeMm3: 400, massG: 3.14, centerMm: [0, 0, 10] },
    { id: 's2', definitionId: 'def-screw', name: 'Zylinderschraube M5x20', partNumber: 'ISO4762-M5-20', material: 'Stahl', densityGcm3: 7.85, volumeMm3: 400, massG: 3.14, centerMm: [10, 0, 10] },
    { id: 's3', definitionId: 'def-screw', name: 'Zylinderschraube M5x20', partNumber: 'ISO4762-M5-20', material: 'Stahl', densityGcm3: 7.85, volumeMm3: 400, massG: 3.14, centerMm: [0, 10, 10] },
    { id: 's4', definitionId: 'def-screw', name: 'Zylinderschraube M5x20', partNumber: 'ISO4762-M5-20', material: 'Stahl', densityGcm3: 7.85, volumeMm3: 400, massG: 3.14, centerMm: [10, 10, 10] },
    // Andere Definition
    { id: 'w1', definitionId: 'def-washer', name: 'Scheibe M5', partNumber: 'DIN125-M5', material: 'Stahl', densityGcm3: 7.85, volumeMm3: 50, massG: 0.39, centerMm: [0, 0, 0] },
    // Andere Ausführung/Variante derselben Schraubendefinition
    { id: 's5', definitionId: 'def-screw', name: 'Zylinderschraube M5x35', partNumber: 'ISO4762-M5-35', variant: 'L35', material: 'Stahl', densityGcm3: 7.85, volumeMm3: 650, massG: 5.1, centerMm: [20, 0, 10] },
    // Fremdteil mit gleichem Namen ohne definitionId (Standalone)
    { id: 'f1', definitionId: null, name: 'Zylinderschraube M5x20', partNumber: null, material: 'Stahl', densityGcm3: 7.85, volumeMm3: 400, massG: 3.14, centerMm: [50, 0, 10] },
    // Weiteres Standalone-Teil mit gleichem Namen: darf ebenfalls nicht zusammengefasst werden
    { id: 'f2', definitionId: null, name: 'Zylinderschraube M5x20', partNumber: null, material: 'Stahl', densityGcm3: 7.85, volumeMm3: 400, massG: 3.14, centerMm: [60, 0, 10] },
  ];

  const grouped = groupPartRows(rows);
  assert.equal(grouped.length, 5, 'Fünf getrennte Zeilen: Schraubengruppe(4), Scheibe(1), Variante(1), Fremdteil1(1), Fremdteil2(1)');

  const screwGroup = grouped.find((g) => g.definitionId === 'def-screw' && g.count === 4);
  assert.ok(screwGroup, 'Vier gleiche Schrauben bilden eine Gruppe');
  assert.equal(screwGroup.count, 4);
  assert.equal(screwGroup.partNumber, 'ISO4762-M5-20');
  assert.deepEqual(screwGroup.instanceIds, ['s1', 's2', 's3', 's4']);
  assert.equal(screwGroup.volumeMm3, 1600);
  assert.equal(screwGroup.massG, 12.56);
  assert.equal(screwGroup.status, 'Geprüft');

  const washerGroup = grouped.find((g) => g.definitionId === 'def-washer');
  assert.ok(washerGroup);
  assert.equal(washerGroup.count, 1);

  const variantGroup = grouped.find((g) => g.definitionId === 'def-screw' && g.count === 1);
  assert.ok(variantGroup);
  assert.equal(variantGroup.partNumber, 'ISO4762-M5-35');

  const standalones = grouped.filter((g) => g.definitionId === null);
  assert.equal(standalones.length, 2, 'Gleichnamige Standalone-Teile ohne definitionId werden niemals zusammengefasst');
  assert.equal(standalones[0].id, 'f1');
  assert.equal(standalones[1].id, 'f2');
});

test('B05-02: Gruppierte Stücklistenzeilen tragen eine stabile Identität auch bei geänderter Eingabereihenfolge', () => {
  const row = (id, extra = {}) => ({
    id,
    definitionId: 'def-screw',
    name: 'Zylinderschraube M5x20',
    partNumber: 'ISO4762-M5-20',
    material: 'Stahl',
    densityGcm3: 7.85,
    variant: 'L20',
    recipe: { size: [5, 5, 20] },
    ...extra,
  });
  const first = groupPartRows([row('s1'), row('s2'), row('s3'), row('s4')]),
    reversed = groupPartRows([row('s4'), row('s3'), row('s2'), row('s1')]);
  assert.equal(first.length, 1);
  assert.equal(first[0].count, 4);
  assert.equal(first[0].identityKey, reversed[0].identityKey);
  assert.equal(first[0].identityKey, partRowIdentity(row('s1')));
  assert.notEqual(partRowIdentity(row('s1')), partRowIdentity(row('s1', { variant: 'L25' })));
  assert.notEqual(partRowIdentity(row('s1')), partRowIdentity({ ...row('s1'), definitionId: null }));
});

test('B04-02: Biete Gruppierung zusätzlich zur bestehenden Einzelansicht an (Umschalten)', () => {
  const rows = [
    { id: 's1', definitionId: 'def-screw', name: 'Schraube M5', partNumber: 'ISO4762-M5' },
    { id: 's2', definitionId: 'def-screw', name: 'Schraube M5', partNumber: 'ISO4762-M5' },
    { id: 's3', definitionId: 'def-screw', name: 'Schraube M5', partNumber: 'ISO4762-M5' },
    { id: 's4', definitionId: 'def-screw', name: 'Schraube M5', partNumber: 'ISO4762-M5' },
  ];

  // Einzelansicht
  const single = summarizeParts(rows, { mode: 'single' });
  assert.equal(single.mode, 'single');
  assert.equal(single.rows.length, 4, 'Vier verschiedene IDs sichtbar');
  assert.deepEqual(single.rows.map((r) => r.id), ['s1', 's2', 's3', 's4']);
  assert.deepEqual(single.rows.map((r) => r.count), [1, 1, 1, 1]);

  // Gruppenansicht
  const grouped = summarizeParts(rows, { mode: 'grouped' });
  assert.equal(grouped.mode, 'grouped');
  assert.equal(grouped.rows.length, 1, 'Eine Zeile für 4 gleiche Schrauben');
  assert.equal(grouped.rows[0].count, 4);
  assert.equal(grouped.rows[0].definitionId, 'def-screw');
  assert.deepEqual(grouped.rows[0].instanceIds, ['s1', 's2', 's3', 's4']);

  // Umschalten aus Summary-Objekt über groupPartSummary
  const switchedToGrouped = groupPartSummary(single);
  assert.equal(switchedToGrouped.mode, 'grouped');
  assert.equal(switchedToGrouped.rows.length, 1);
  assert.equal(switchedToGrouped.rows[0].count, 4);

  // Zurück zur Einzelansicht über summarizeParts mit rawRows
  const switchedBackToSingle = summarizeParts(switchedToGrouped.rawRows, { mode: 'single' });
  assert.equal(switchedBackToSingle.mode, 'single');
  assert.equal(switchedBackToSingle.rows.length, 4);
});

test('B04-03: Tatsächlich gezählte Platzierungen für bekannte Massen und Mengen, Dichte und Ausblendung', async () => {
  const project = {
    version: 36,
    layers: [{ id: 'default', name: 'Standard' }],
    folders: [],
    componentDefinitions: {
      version: 1,
      definitions: [
        { id: 'def-huelse', name: 'Distanzhülse', partNumber: 'DH-12-20' },
      ],
    },
    nodes: [
      { id: 'h1', kind: 'cad', solid: true, name: 'Distanzhülse 1', definitionId: 'def-huelse', transform: [...identity] },
      { id: 'h2', kind: 'cad', solid: true, name: 'Distanzhülse 2', definitionId: 'def-huelse', transform: [...identity] },
      { id: 'h3', kind: 'cad', solid: true, name: 'Distanzhülse 3', definitionId: 'def-huelse', transform: [...identity] },
      { id: 'h4', kind: 'cad', solid: true, name: 'Distanzhülse 4', definitionId: 'def-huelse', transform: [...identity] },
      // 1 ausgeblendete Hülse (hidden: true)
      { id: 'h5', kind: 'cad', solid: true, name: 'Distanzhülse 5 (versteckt)', definitionId: 'def-huelse', hidden: true, transform: [...identity] },
    ],
  };

  const controller = {
    revision: () => 1,
    readSnapshot: () => project,
    materialize: async () => project,
    query: async (type, { id }) => ({ volumeMm3: 500, centerMm: [0, 0, 10] }),
  };

  const service = createPartPropertiesService(controller);

  // 1. Messung ohne Dichte
  const unmeasured = await service.measure({ mode: 'grouped' });
  assert.equal(unmeasured.totalCount, 4, 'Ausgeblendetes Teil wird nicht mitgezählt (4 statt 5)');
  assert.equal(unmeasured.rows.length, 1);
  assert.equal(unmeasured.rows[0].count, 4);
  assert.equal(unmeasured.rows[0].partNumber, 'DH-12-20');
  assert.equal(unmeasured.rows[0].volumeMm3, 2000, 'Volumen der 4 sichtbaren Teile summiert');
  assert.equal(unmeasured.rows[0].massG, null, 'Masse bleibt ohne Dichte null');
  assert.equal(unmeasured.rows[0].status, 'Volumen/Schwerpunkt geprüft; Dichte fehlt');
  assert.equal(unmeasured.complete, false);
  assert.equal(unmeasured.totalMassG, null);
  assert.equal(unmeasured.knownMassG, 0);

  // 2. Dichte auf Definition setzen
  project.componentDefinitions.definitions[0].metadata = {
    partProperties: {
      version: 1,
      material: { name: 'Aluminium', densityGcm3: 2.7 },
    },
  };
  service.clear();

  const measured = await service.measure({ mode: 'grouped' });
  assert.equal(measured.rows[0].count, 4);
  assert.equal(measured.rows[0].material, 'Aluminium');
  assert.equal(measured.rows[0].densityGcm3, 2.7);
  assert.equal(measured.rows[0].volumeMm3, 2000);
  assert.equal(measured.rows[0].massG, 5.4);
  assert.equal(measured.rows[0].status, 'Geprüft');
  assert.equal(measured.complete, true);
  assert.equal(measured.totalMassG, 5.4);
  assert.equal(measured.knownMassG, 5.4);
});

test('B04-04: CSV-Schreiber exportiert gewählte Gruppierung, Spalten Teilenummer und Menge, Sonderzeichen und Formelschutz', () => {
  const summary = summarizeParts(
    [
      {
        id: 'p1',
        definitionId: 'def-screw',
        name: '=Formel;Teil',
        partNumber: 'ISO4762-M5-20',
        material: 'Stahl;A2',
        densityGcm3: 7.85,
        volumeMm3: 400,
        massG: 3.14,
        centerMm: [10, -5, 20],
        status: 'Geprüft',
      },
      {
        id: 'p2',
        definitionId: 'def-screw',
        name: '=Formel;Teil',
        partNumber: 'ISO4762-M5-20',
        material: 'Stahl;A2',
        densityGcm3: 7.85,
        volumeMm3: 400,
        massG: 3.14,
        centerMm: [10, -5, 20],
        status: 'Geprüft',
      },
      {
        id: 'p3',
        definitionId: null,
        name: 'Platte "Grund"',
        partNumber: null,
        material: null,
        densityGcm3: null,
        volumeMm3: 5000,
        massG: null,
        centerMm: [0, 0, 0],
        status: 'Volumen/Schwerpunkt geprüft; Dichte fehlt',
      },
    ],
    { mode: 'grouped' },
  );

  // Gruppen-CSV
  const csvGrouped = partsCsv(summary, { grouped: true });
  assert.ok(csvGrouped.startsWith('\ufeff'), 'UTF-8 BOM vorhanden');
  const linesGrouped = csvGrouped.trim().split('\r\n');
  assert.equal(
    linesGrouped[0],
    '"Teil-ID";"Teilenummer";"Name";"Materialgruppe";"Menge";"Dichte g/cm³";"Volumen mm³";"Masse g";"Schwerpunkt X mm";"Schwerpunkt Y mm";"Schwerpunkt Z mm";"Status"',
    'Exakte Spaltenüberschriften inklusive Teilenummer und Menge',
  );

  // Zeile 1: Gruppierte Schraube (Menge 2)
  assert.ok(linesGrouped[1].includes('"def-screw"'), 'Definition-ID als Kennung');
  assert.ok(linesGrouped[1].includes('"ISO4762-M5-20"'), 'Teilenummer vorhanden');
  assert.ok(linesGrouped[1].includes('"\'=Formel;Teil"'), 'Formelschutz (\') und Quoting für Semikolon');
  assert.ok(linesGrouped[1].includes('"Stahl;A2"'), 'Semikolon im Material gequotet');
  assert.ok(linesGrouped[1].includes('"2"'), 'Menge 2');
  assert.ok(linesGrouped[1].includes('"6.28"'), 'Masse summiert (2 * 3.14)');

  // Zeile 2: Standalone-Platte ohne Dichte und ohne Teilenummer
  assert.ok(linesGrouped[2].includes('"p3"'));
  assert.ok(linesGrouped[2].includes('""'), 'Leere Teilenummer als ""');
  assert.ok(linesGrouped[2].includes('"Platte ""Grund"""'), 'Anführungszeichen maskiert');
  assert.ok(linesGrouped[2].includes('"1"'), 'Menge 1');
  assert.ok(linesGrouped[2].includes('"Volumen/Schwerpunkt geprüft; Dichte fehlt"'), 'Massenstatus nachvollziehbar');

  // Einzel-CSV aus demselben Datensatz
  const csvSingle = partsCsv(summary, { grouped: false });
  const linesSingle = csvSingle.trim().split('\r\n');
  assert.equal(linesSingle.length, 4, 'Header + 3 Einzelzeilen');
  assert.ok(linesSingle[1].includes('"p1"'));
  assert.ok(linesSingle[1].includes('"1"'), 'Menge 1 in Einzelzeile 1');
  assert.ok(linesSingle[2].includes('"p2"'));
  assert.ok(linesSingle[2].includes('"1"'), 'Menge 1 in Einzelzeile 2');
  assert.ok(linesSingle[3].includes('"p3"'));
  assert.ok(linesSingle[3].includes('"1"'), 'Menge 1 in Einzelzeile 3');
});

test('B07-01: Gespeicherte Explosion liefert Einbaumatrix und explodierte Anzeigeposition', () => {
  // Rotierte und skalierte Einbaumatrix: die lineare Abbildung bleibt bei der
  // reinen Anzeigeverschiebung unverändert.
  const assemblyMatrix = [0, -2, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 10, 20, 30, 1];
  const explosion = {
    version: 1,
    distance: 25,
    parts: [
      { id: 'bolt', direction: [0.6, 0, 0.8] },
      { id: 'other', direction: [1, 0, 0] },
    ],
  };
  const result = explodedPartPlacement(explosion, { id: 'bolt', worldMatrix: assemblyMatrix });

  assert.equal(result.id, 'bolt');
  assert.equal(result.distance, 25);
  assert.deepEqual(result.direction, [0.6, 0, 0.8]);
  assert.deepEqual(result.displayOffset, [15, 0, 20]);
  assert.deepEqual(result.assemblyMatrix, assemblyMatrix);
  assert.deepEqual(result.assemblyPosition, [10, 20, 30]);
  assert.deepEqual(result.explodedMatrix, [0, -2, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 25, 20, 50, 1]);
  assert.deepEqual(result.explodedMatrix.slice(0, 12), assemblyMatrix.slice(0, 12));
  assert.deepEqual(result.explodedPosition, [25, 20, 50]);
  assert.deepEqual(explosionOffsets(explosion, { nodes: [{ id: 'bolt' }] }), [{ id: 'bolt', offset: [15, 0, 20] }]);
  assert.deepEqual(assemblyMatrix, [0, -2, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 10, 20, 30, 1], 'Montage bleibt unverändert');

  const unmoved = explodedPartPlacement({ ...explosion, parts: [] }, { id: 'bolt', worldMatrix: assemblyMatrix });
  assert.equal(unmoved.direction, null);
  assert.deepEqual(unmoved.displayOffset, [0, 0, 0]);
  assert.deepEqual(unmoved.explodedPosition, [10, 20, 30]);
  assert.deepEqual(
    explodedPartPlacement(null, { id: 'bolt', worldMatrix: assemblyMatrix }).explodedPosition,
    [10, 20, 30],
  );

  assert.throws(() => explodedPartPlacement(explosion, { id: 'bolt' }), /worldMatrix/);
  assert.throws(
    () => explodedPartPlacement(explosion, { id: 'bolt', worldMatrix: [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }),
    /affine/,
  );
  assert.throws(
    () => explodedPartPlacement(explosion, { id: 'bolt', worldMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1] }),
    /Singuläre/,
  );
  assert.throws(() => explodedPartPlacement({ ...explosion, distance: -1 }, { id: 'bolt', worldMatrix: assemblyMatrix }));
  assert.throws(
    () =>
      explodedPartPlacement(
        explosion,
        { id: 'bolt', target: { rootId: 'bolt', path: ['child'] }, worldMatrix: assemblyMatrix },
      ),
    /vollständiges Teil/,
  );
});
