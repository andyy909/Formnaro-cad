const code=`base=doc.addObject('Part::Box','Base');base.Length=30;base.Width=20;base.Height=6
bore=doc.addObject('Part::Cylinder','Bore');bore.Radius=3;bore.Height=8;bore.Placement.Base=App.Vector(15,10,-1)
other=doc.addObject('Part::Cylinder','OtherBore');other.Radius=4;other.Height=8;other.Placement.Base=App.Vector(15,10,-1)
other.addProperty('App::PropertyLink','ProtectedSource');other.ProtectedSource=base;other.setEditorMode('ProtectedSource',1)
keep=doc.addObject('Part::Box','Keep');keep.Length=2;keep.Width=3;keep.Height=4;keep.Placement.Base=App.Vector(-50,0,0)
replacement=doc.addObject('Part::Box','Replacement');replacement.Length=40;replacement.Width=25;replacement.Height=6
compound=doc.addObject('Part::Compound','Combined');compound.Links=[base,keep]
body=doc.addObject('PartDesign::Body','Body')
import Sketcher
for name,w in [('Profile',10),('NewProfile',16)]:
 s=doc.addObject('Sketcher::SketchObject',name);body.addObject(s)
 for a,b in [((0,0),(w,0)),((w,0),(w,8)),((w,8),(0,8)),((0,8),(0,0))]:s.addGeometry(Part.LineSegment(App.Vector(*a,0),App.Vector(*b,0)),False)
pad=body.newObject('PartDesign::Pad','Pad');pad.Profile=doc.getObject('Profile');pad.Length=3
binder=doc.addObject('PartDesign::SubShapeBinder','Binder');binder.Support=[(base,('Face6',))]
extrusion=doc.addObject('Part::Extrusion','Extruded');extrusion.Base=binder;extrusion.Dir=App.Vector(0,0,2);extrusion.Solid=True
result=doc.addObject('Part::Cut','Finished');result.Base=base;result.Tool=bore;doc.recompute()`;
module.exports={code};
