"""Executed by separate native FreeCADCmd, never by Formnaro's OCCT/WASM."""
from pathlib import Path
import os,sys,json,hashlib,traceback,collections,math
sys.dont_write_bytecode=True
work=Path(__file__).resolve().parents[2]/'work'/'cad-independent-step'
stem=os.environ['FORMNARO_STEP_PROOF_STEM']
expected=json.loads((work/(stem+'-expected.json')).read_text(encoding='utf-8'))
evidence={'reader':'Official portable FreeCAD 1.1.4 Windows x86_64 py311','sharesOcctAlgorithm':True,'geometricCadReader':True,'checks':[]}
code=1
try:
    import FreeCAD as App,Part,Import
    evidence.update(freecadVersion=App.Version(),occtVersion=getattr(Part,'OCC_VERSION',None),importMethods=[v for v in dir(Import) if not v.startswith('_')])
    step=work/expected['file']
    assert hashlib.sha256(step.read_bytes()).hexdigest()==expected['sha256'],'Original STEP bytes changed'
    shape=Part.read(str(step))
    # FreeCAD's ordinary BoundBox conservatively includes the full untrimmed
    # surface ranges. Match the native AddOptimal(false,false) CAD contract.
    evidence['boundingMethod']='optimalBoundingBox(useTriangulation=False,useShapeTolerance=False)'
    box=shape.optimalBoundingBox(False,False)
    evidence.update(stepSha256=expected['sha256'],shapeType=shape.ShapeType,isValid=shape.isValid(),isClosed=shape.isClosed(),solids=len(shape.Solids),faces=len(shape.Faces),shells=len(shape.Shells),volume=shape.Volume,expectedVolume=expected['volume'],bounds={'min':[box.XMin,box.YMin,box.ZMin],'max':[box.XMax,box.YMax,box.ZMax]},surfaces=dict(collections.Counter(type(face.Surface).__name__ for face in shape.Faces)))
    assert evidence['isValid'] and evidence['isClosed'],'STEP reader returned invalid/open body'
    assert len(shape.Solids)==expected['solids'],'STEP solids lost'
    assert all(solid.isValid() and solid.isClosed() for solid in shape.Solids),'At least one imported solid invalid/open'
    evidence['checks'].extend(['unchanged-original-step-bytes','valid-closed-native-topology','correct-solid-count'])
    actualParts=[]
    for index,solid in enumerate(sorted(shape.Solids,key=lambda s:s.BoundBox.Center.x)):
        b=solid.optimalBoundingBox(False,False)
        brep=work/(stem+'-freecad-'+str(index)+'.brep')
        solid.exportBrep(str(brep))
        actualParts.append({'volume':solid.Volume,'valid':solid.isValid(),'closed':solid.isClosed(),'faces':len(solid.Faces),'bounds':{'min':[b.XMin,b.YMin,b.ZMin],'max':[b.XMax,b.YMax,b.ZMax]},'surfaces':dict(collections.Counter(type(f.Surface).__name__ for f in solid.Faces)),'brep':brep.name,'brepSha256':hashlib.sha256(brep.read_bytes()).hexdigest()})
    evidence['parts']=actualParts
    for actual,target in zip(actualParts,sorted(expected['parts'],key=lambda p:p['bounds']['center'][0])):
        for side in ('min','max'):
            assert max(abs(a-b) for a,b in zip(actual['bounds'][side],target['bounds'][side]))<1e-4,'Native reader changed precise body bounds'
    evidence['checks'].append('native-bounds-within-0.0001mm')
    if stem=='formnaro-ap214':
        assert abs(shape.Volume-expected['volume'])<1e-7,'Analytic bore/box volume changed'
        assert not shape.isInside(App.Vector(0,0,0),1e-7,True),'Hole filled during STEP import'
        assert shape.isInside(App.Vector(4,0,0),1e-7,False),'Annular material lost'
        assert evidence['surfaces'].get('Cylinder',0)==2,'Cylinder/hole surfaces lost'
        evidence['checks'].extend(['analytic-volume-within-1e-7mm3','hole-remains-empty','annular-material-remains-solid','exact-cylinder-surfaces'])
    else:
        assert all(p['surfaces'].get('BSplineSurface',0)>0 for p in actualParts),'Thread/gear original surfaces lost'
        evidence['checks'].append('original-bspline-thread-and-gear-surfaces')
        evidence['volumeDifference']=shape.Volume-expected['volume']
        evidence['complexVolumeCaveat']='FreeCAD TopoShape.Volume calls fixed VolumeProperties(shape,props); Formnaro references adaptive Gauss-Kronrod/IsUseSpan.'
    # Separate document import tests original part names using the native app reader.
    Import.open(str(step))
    document=App.ActiveDocument
    features=[obj for obj in document.Objects if hasattr(obj,'Shape') and not obj.Shape.isNull() and obj.Shape.Solids]
    evidence['labels']=[obj.Label for obj in features]
    assert sorted(evidence['labels'])==sorted(p['name'] for p in expected['parts']),'Native reader did not preserve Unicode part names'
    evidence['checks'].append('native-unicode-part-labels')
    evidence['status']='passed'
    code=0
except BaseException as error:
    evidence.update(status='failed',error=str(error),traceback=traceback.format_exc())
finally:
    (work/('freecad-'+stem+'-evidence.json')).write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(evidence,ensure_ascii=True),flush=True)
    sys.stdout.flush();sys.stderr.flush()
    os._exit(code)
