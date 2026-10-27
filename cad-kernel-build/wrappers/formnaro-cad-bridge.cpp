// Formnaro CAD kernel additions. SPDX-License-Identifier: MIT
// Linked into the SAME replicad/OCCT module; TopoDS shapes never cross a second
// wasm heap. The bridge avoids unsupported stream/enum/out-parameter bindings.
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_GTransform.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepLProp_SLProps.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <BRepTools.hxx>
#include <IntCurvesFace_ShapeIntersector.hxx>
#include <Precision.hxx>
#include <Standard_Failure.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopAbs_State.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_FormatVersion.hxx>
#include <NCollection_IndexedMap.hxx>
#include <TopTools_ShapeMapHasher.hxx>
#include <TopoDS.hxx>
#include <gp_GTrsf.hxx>
#include <gp_Lin.hxx>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <sstream>
#include <string>
#include <functional>
#include <set>
#include <STEPCAFControl_Reader.hxx>
#include <TDocStd_Document.hxx>
#include <TDataStd_Name.hxx>
#include <TDF_LabelSequence.hxx>
#include <TDF_Tool.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XCAFDoc_ColorTool.hxx>
#include <Quantity_ColorRGBA.hxx>

class FormnaroCadBridge {
public:
  // XCAF owns the assembly graph and STEP unit/name/color interpretation.
  // Instances are separate leaves, never fused. Only this input's virtual
  // filesystem is visible; missing external documents are an explicit error.
  static std::string ReadStepAssemblyJson(const std::string& filename) {
    STEPCAFControl_Reader reader;
    reader.SetNameMode(true); reader.SetColorMode(true);
    if (reader.ReadFile(filename.c_str()) != IFSelect_RetDone)
      throw Standard_Failure("STEP document could not be read");
    reader.ChangeReader().SetSystemLengthUnit(1.0);
    Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
    if (!reader.Transfer(document) || !reader.ExternFiles().IsEmpty())
      throw Standard_Failure("STEP transfer failed or requires external files");
    Handle(XCAFDoc_ShapeTool) shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
    Handle(XCAFDoc_ColorTool) colors = XCAFDoc_DocumentTool::ColorTool(document->Main());
    auto quote = [](const std::string& value) {
      std::ostringstream out; out << '"';
      for (unsigned char c : value) {
        if (c == '"' || c == '\\') out << '\\' << c;
        else if (c < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c) << std::dec;
        else out << c;
      }
      out << '"'; return out.str();
    };
    auto name = [](const TDF_Label& label) {
      Handle(TDataStd_Name) attribute;
      if (!label.FindAttribute(TDataStd_Name::GetID(), attribute)) return std::string();
      const TCollection_ExtendedString& text = attribute->Get();
      std::string result(text.LengthOfCString()+1, '\0'); char* pointer = &result[0];
      result.resize(text.ToUTF8CString(pointer)); return result;
    };
    auto appearance = [](const Quantity_ColorRGBA& rgba) {
      double r,g,b; rgba.GetRGB().Values(r,g,b,Quantity_TOC_sRGB);
      std::ostringstream out; out << "{\"color\":\"#" << std::hex << std::setfill('0')
        << std::setw(2) << int(std::round(r*255)) << std::setw(2) << int(std::round(g*255))
        << std::setw(2) << int(std::round(b*255)) << "\",\"opacity\":" << std::dec << rgba.Alpha() << "}";
      return out.str();
    };
    int count=0, leaves=0; std::uint64_t brepBytes=0; std::set<std::string> visiting;
    std::function<std::string(const TDF_Label&,const TopLoc_Location&,int,const std::string&)> visit;
    visit = [&](const TDF_Label& occurrence,const TopLoc_Location& parent,int depth,const std::string& inherited) {
      if (++count>1000 || depth>11) throw Standard_Failure("STEP assembly exceeds tree limits");
      TDF_Label definition=occurrence;
      const bool reference=shapes->GetReferredShape(occurrence,definition);
      TopLoc_Location location=parent;
      if(reference) location=parent*shapes->GetLocation(occurrence);
      TCollection_AsciiString key; TDF_Tool::Entry(definition,key);
      if(!visiting.insert(key.ToCString()).second) throw Standard_Failure("Cyclic STEP assembly");
      std::string title=name(occurrence);
      if(title.empty() || title.rfind("=>",0)==0) title=name(definition);
      if(title.empty()) title="STEP";
      Quantity_ColorRGBA color;
      std::string style=inherited;
      const TopoDS_Shape occurrenceShape=shapes->GetShape(occurrence);
      if(colors->GetInstanceColor(occurrenceShape,XCAFDoc_ColorSurf,color) ||
         colors->GetColor(occurrence,XCAFDoc_ColorSurf,color) || colors->GetColor(occurrence,XCAFDoc_ColorGen,color) ||
         colors->GetColor(definition,XCAFDoc_ColorSurf,color) || colors->GetColor(definition,XCAFDoc_ColorGen,color)) style=appearance(color);
      std::string result="{\"name\":"+quote(title)+",\"appearance\":"+style;
      TDF_LabelSequence children;
      if(shapes->GetComponents(definition,children,false) && children.Length()) {
        result+=",\"children\":[";
        for(int i=1;i<=children.Length();++i) {if(i>1)result+=",";result+=visit(children.Value(i),location,depth+1,style);}
        result+="]";
      } else {
        if(++leaves>500) throw Standard_Failure("STEP contains more than 500 parts");
        TopoDS_Shape local=shapes->GetShape(definition);
        if(local.IsNull())throw Standard_Failure("STEP component has no geometry");
        // Bake the exact instance placement into BRep, retaining analytic faces.
        const TopoDS_Shape placed=local.Moved(location);
        const std::string brep=WriteNoTriangles(placed); brepBytes+=brep.size();
        if(brep.size()>12*1024*1024 || brepBytes>40*1024*1024)throw Standard_Failure("STEP BRep exceeds project byte limits");
        result+=",\"brep\":"+quote(brep)+",\"faceColors\":[";
        NCollection_IndexedMap<TopoDS_Shape,TopTools_ShapeMapHasher> faces;
        TopExp::MapShapes(local,TopAbs_FACE,faces); if(faces.Extent()>40000)throw Standard_Failure("STEP exceeds face color limit"); bool first=true;
        for(int i=1;i<=faces.Extent();++i) {
          if(colors->GetColor(faces(i),XCAFDoc_ColorSurf,color) || colors->GetColor(faces(i),XCAFDoc_ColorGen,color)) {
            if(!first)result+=",";first=false;
            result+="{\"faceIndex\":"+std::to_string(i)+",\"appearance\":"+appearance(color)+"}";
          }
        }
        result+="]";
      }
      visiting.erase(key.ToCString()); return result+"}";
    };
    TDF_LabelSequence roots; shapes->GetFreeShapes(roots);
    if(!roots.Length())throw Standard_Failure("Empty STEP assembly");
    std::string result="[";
    for(int i=1;i<=roots.Length();++i){if(i>1)result+=",";result+=visit(roots.Value(i),TopLoc_Location(),0,"{}");}
    return result+"]";
  }
  // CAD point classification confirms containment/disjointness after native
  // boundary-distance checks. A zero Boolean common volume alone is not a
  // topology proof. Undefined classification must remain an explicit failure.
  static std::string ClassifyPoint(const TopoDS_Shape& shape, const gp_Pnt& point,
                                   double tolerance) {
    if (shape.IsNull() || !std::isfinite(tolerance) || tolerance <= 0 ||
        !std::isfinite(point.X()) || !std::isfinite(point.Y()) || !std::isfinite(point.Z()))
      throw Standard_Failure("Invalid CAD classification input");
    BRepClass3d_SolidClassifier classifier(shape, point, tolerance);
    switch (classifier.State()) {
      case TopAbs_IN: return "inside";
      case TopAbs_OUT: return "outside";
      case TopAbs_ON: return "boundary";
      default: throw Standard_Failure("Undefined CAD point classification");
    }
  }

  static TopoDS_Shape Transform(const TopoDS_Shape& shape, const gp_GTrsf& matrix) {
    if (matrix.IsSingular()) throw Standard_Failure("Singular CAD matrix");
    BRepBuilderAPI_GTransform builder(shape, matrix, true);
    return builder.Shape();
  }

  static std::string WriteNoTriangles(const TopoDS_Shape& shape) {
    std::ostringstream stream(std::ios::binary);
    stream << std::setprecision(17);
    BRepTools::Write(shape, stream, false, false, TopTools_FormatVersion_VERSION_3);
    return stream.str();
  }

  // Export coordinates remain OCCT doubles. The display extractor deliberately
  // uses float32, which cannot represent .01 mm changes at large translations.
  // Rebuild this transient face cache with the explicit export quality; never
  // copy a previous display mesh or reconstruct a CAD body from its triangles.
  static std::string ExportMeshJson(const TopoDS_Shape& shape, double deflection,
                                    double angularTolerance) {
    if (!std::isfinite(deflection) || deflection <= 0 ||
        !std::isfinite(angularTolerance) || angularTolerance <= 0 ||
        angularTolerance > 3.14159265358979323846)
      throw Standard_Failure("Invalid CAD export quality");
    BRepTools::Clean(shape, false);
    BRepMesh_IncrementalMesh mesher(shape, deflection, false, angularTolerance, false);
    if (!mesher.IsDone()) throw Standard_Failure("CAD export tessellation failed");
    std::uint64_t nodes = 0, triangles = 0, groups = 0;
    for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
      TopLoc_Location location;
      Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(
        TopoDS::Face(explorer.Current()), location);
      if (triangulation.IsNull() || !triangulation->NbNodes() || !triangulation->NbTriangles())
        throw Standard_Failure("CAD export face has no tessellation");
      nodes += triangulation->NbNodes(); triangles += triangulation->NbTriangles(); ++groups;
      if (nodes > 1000000 || triangles > 2000000 || groups > 40000)
        throw Standard_Failure("CAD export mesh exceeds project budget");
    }
    if (!groups) throw Standard_Failure("Empty CAD export mesh");
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faces;
    TopExp::MapShapes(shape, TopAbs_FACE, faces);
    std::ostringstream vertices, indices, faceGroups;
    vertices << std::setprecision(17);
    int nodeOffset = 0, indexOffset = 0;
    bool firstVertex = true, firstIndex = true, firstGroup = true;
    for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
      const TopoDS_Face& face = TopoDS::Face(explorer.Current());
      TopLoc_Location location;
      Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, location);
      const gp_Trsf& transformation = location.Transformation();
      for (int index = 1; index <= triangulation->NbNodes(); ++index) {
        const gp_Pnt point = triangulation->Node(index).Transformed(transformation);
        if (!std::isfinite(point.X()) || !std::isfinite(point.Y()) || !std::isfinite(point.Z()))
          throw Standard_Failure("Non-finite CAD export coordinate");
        if (!firstVertex) vertices << ","; firstVertex = false;
        vertices << point.X() << "," << point.Y() << "," << point.Z();
      }
      const bool reverse = (face.Orientation() == TopAbs_REVERSED) ^
        (transformation.VectorialPart().Determinant() < 0.0);
      const int firstTriangle = indexOffset;
      for (int index = 1; index <= triangulation->NbTriangles(); ++index) {
        const Poly_Triangle& triangle = triangulation->Triangle(index);
        int a = triangle.Value(1), b = triangle.Value(2), c = triangle.Value(3);
        if (reverse) std::swap(b, c);
        if (!firstIndex) indices << ","; firstIndex = false;
        indices << a - 1 + nodeOffset << "," << b - 1 + nodeOffset << "," << c - 1 + nodeOffset;
        indexOffset += 3;
      }
      const int faceIndex = faces.FindIndex(face);
      if (!faceIndex) throw Standard_Failure("Unmapped CAD export face");
      if (!firstGroup) faceGroups << ","; firstGroup = false;
      faceGroups << firstTriangle << "," << indexOffset - firstTriangle << "," << faceIndex;
      nodeOffset += triangulation->NbNodes();
    }
    return "{\"vertices\":[" + vertices.str() + "],\"triangles\":[" + indices.str() +
      "],\"faceGroups\":[" + faceGroups.str() + "]}";
  }

  // Native trimmed-face intersections and surface normals. No display mesh,
  // interpolated triangle normals, or finite-difference normal approximations.
  // faceIndex is a one-based TopExp unique-face map index valid for this shape;
  // reconstruction must use separate history/geometry anchors, not this index.
  static std::string RayHitsJson(const TopoDS_Shape& shape, const gp_Pnt& origin,
                                const gp_Dir& direction, double nearDistance,
                                double farDistance, double tolerance) {
    IntCurvesFace_ShapeIntersector intersection;
    intersection.Load(shape, tolerance);
    intersection.Perform(gp_Lin(origin, direction), nearDistance, farDistance);
    if (!intersection.IsDone()) throw Standard_Failure("CAD ray intersection failed");
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faces;
    TopExp::MapShapes(shape, TopAbs_FACE, faces);
    std::ostringstream stream;
    stream << std::setprecision(17) << "[";
    for (int index = 1; index <= intersection.NbPnt(); ++index) {
      const TopoDS_Face& face = intersection.Face(index);
      BRepAdaptor_Surface surface(face, false);
      const double u = intersection.UParameter(index);
      const double v = intersection.VParameter(index);
      BRepLProp_SLProps properties(surface, u, v, 1, Precision::Confusion());
      if (!properties.IsNormalDefined()) throw Standard_Failure("Undefined CAD surface normal");
      gp_Dir normal = properties.Normal();
      if (face.Orientation() == TopAbs_REVERSED) normal.Reverse();
      const gp_Pnt& point = intersection.Pnt(index);
      if (index > 1) stream << ",";
      stream << "{\"faceIndex\":" << faces.FindIndex(face)
             << ",\"t\":" << intersection.WParameter(index)
             << ",\"uv\":[" << u << "," << v << "]"
             << ",\"point\":[" << point.X() << "," << point.Y() << "," << point.Z() << "]"
             << ",\"normal\":[" << normal.X() << "," << normal.Y() << "," << normal.Z() << "]}";
    }
    stream << "]";
    return stream.str();
  }
};
