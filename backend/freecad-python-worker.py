"""Full native FreeCAD scripting inside the Windows CAD AppContainer."""
import os,sys,json,traceback,zipfile,io
from pathlib import Path
import FreeCAD as App
import Part
from formnaro_freecad import inspect_shape

job=Path(__file__).resolve().parent
sys.path.insert(0,str(job))
data=json.loads((job/'input.json').read_text(encoding='utf-8'))
doc=App.newDocument('Formnaro')
inputs={}
source_objects={}
output={}
try:
    for item in data['inputs']:
        filename=str(job/item['file'])
        if item['format']=='step':
            value=Part.read(filename);obj=doc.addObject('Part::Feature',item['name']);obj.Shape=value
        else:
            import Mesh
            value=Mesh.Mesh(filename);obj=doc.addObject('Mesh::Feature',item['name']);obj.Mesh=value
        inputs[item['name']]=value;source_objects[item['name']]=obj
    namespace=dict(__name__='__formnaro_cad__',__file__=str(job/'user.py'),App=App,FreeCAD=App,Part=Part,doc=doc,inputs=inputs,source_objects=source_objects,source_files={i['name']:str(job/i['file']) for i in data['inputs']},parameters=data['script'].get('parameters',{}),workspace=job,result=None,measurements={})
    exec(compile((job/'user.py').read_text(encoding='utf-8'),str(job/'user.py'),'exec'),namespace)
    value=namespace.get('result')
    doc=getattr(value,'Document',None) or namespace.get('doc') or App.ActiveDocument
    if doc:doc.recompute()
    shape=getattr(value,'Shape',value)
    report=inspect_shape(shape,True) if shape is not None else None
    measurements=namespace.get('measurements',{})
    # Fail on non-JSON values instead of silently dropping exact measurements.
    json.dumps(measurements,allow_nan=False)
    if not data['inspectOnly']:
        if shape is None:raise ValueError('Set result to the final TopoShape or document object')
        if not report['valid'] or not report['closed'] or not report['solids'] or report['check']!='passed':raise ValueError('Final CAD body failed the native geometry check: '+json.dumps(report))
        shape.exportStep(str(job/'result.step'))
        readback=Part.read(str(job/'result.step'));readback_proof=inspect_shape(readback)
        if not readback_proof['valid'] or not readback_proof['closed'] or readback_proof['solids']!=report['solids'] or readback_proof['check']!='passed':raise ValueError('Exported STEP readback failed: '+json.dumps(readback_proof))
        if not hasattr(value,'Shape'):
            value=doc.addObject('Part::Feature','Result');value.Shape=shape
        if 'FormnaroPython' not in value.PropertiesList:value.addProperty('App::PropertyString','FormnaroPython','Formnaro')
        value.FormnaroPython=data['script']['code']
        if App.GuiUp:
            for obj in doc.Objects:obj.ViewObject.Visibility=(obj.Name==value.Name)
        doc.recompute();doc.saveAs(str(job/'result.FCStd'))
        # Headless FreeCAD writes no GUI state. Store only final-body visibility
        # so editable construction sources do not obscure the model on opening.
        if not App.GuiUp:
            import xml.etree.ElementTree as ET
            root=ET.Element('Document',SchemaVersion='1');providers=ET.SubElement(root,'ViewProviderData',Count=str(len(doc.Objects)))
            for obj in doc.Objects:
                vp=ET.SubElement(providers,'ViewProvider',name=obj.Name)
                props=ET.SubElement(vp,'Properties',Count='1')
                prop=ET.SubElement(props,'Property',name='Visibility',type='App::PropertyBool')
                ET.SubElement(prop,'Bool',value='true' if obj.Name==value.Name else 'false')
            file=job/'result.FCStd'
            with zipfile.ZipFile(file) as z:entries={n:z.read(n) for n in z.namelist() if n!='GuiDocument.xml'}
            with zipfile.ZipFile(file,'w',zipfile.ZIP_DEFLATED) as z:
                for name,content in entries.items():z.writestr(name,content)
                z.writestr('GuiDocument.xml',ET.tostring(root,encoding='utf-8',xml_declaration=True))
        output['stepReadback']=readback_proof
    output.update(ok=True,engineVersion='.'.join(App.Version()[:3]),occt=Part.OCC_VERSION,report=report,measurements=measurements,isolation='windows-appcontainer',resultObject=value.Name if not data['inspectOnly'] else None,documentObjects=[dict(name=o.Name,label=o.Label,type=o.TypeId) for o in doc.Objects])
except BaseException as e:
    output=dict(ok=False,error=str(e)[:16000],traceback=traceback.format_exc()[-24000:],code='FREECAD_PYTHON_FAILED')
(job/'result.json').write_text(json.dumps(output,allow_nan=False),encoding='utf-8')
for name in list(App.listDocuments()):App.closeDocument(name)
