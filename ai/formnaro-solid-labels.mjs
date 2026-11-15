export const SOLID_LABELS={
  'cad-draft':['Entformungsschräge','Draft'],'cad-defeature':['Merkmale entfernen','Defeature'],'cad-revolution':['Rotation','Revolve'],'cad-helix':['Helix','Helix'],
  'cad-surface-fill':['Randkurvenfläche','Boundary surface'],'cad-surface-transition':['Flächenübergang','Surface transition'],'cad-surface-sew':['Flächen vernähen','Sew surfaces'],'cad-surface-relief':['Prägung / Vertiefung','Emboss / engrave'],
  features:['Features','Features'],sketch:['Skizze','Sketch'],evaluate:['Prüfen','Evaluate'],assembly:['Baugruppe','Assembly'],mesh:['Netz & Umwandeln','Mesh & conversion'],
  model:['Modellbaum','Model tree'],properties:['Eigenschaften','Properties'],library:['Grundkörper','Primitives'],workspace:['Dokument','Document'],
  extrude:['Extrudierter Aufsatz','Extruded boss'],cut:['Linearer Schnitt','Extruded cut'],round:['Verrundung','Fillet'],chamfer:['Fase','Chamfer'],
  sketchNew:['Skizze / Extrusion','Sketch / extrusion'],sketchFace:['Skizze auf Fläche','Sketch on face'],
  'cad-contour':['Kontur übernehmen','Convert entities'],'cad-shell':['Wandung','Shell'],'cad-loft':['Ausformung','Loft'],'cad-sweep':['Austragung','Sweep'],
  'cad-face-offset':['Fläche versetzen','Offset face'],'cad-edit-modeling':['Feature bearbeiten','Edit feature'],drill:['Bohrung','Hole'],array:['Muster','Pattern'],mirror:['Spiegeln','Mirror'],
  'project-parameters':['Gleichungen & Maße','Equations & dimensions'],'sketch-templates':['Skizzenvorlagen','Sketch templates'],
  'linked-contours':['Externe Konturbezüge','External contour references'],edges:['Kanten bearbeiten','Edit edges'],
  orientation:['Ansichtsausrichtung','View orientation'],options:['Solid-Einstellungen','Solid settings'],
  file:['Datei','File'],edit:['Bearbeiten','Edit'],view:['Ansicht','View'],insert:['Einfügen','Insert'],extras:['Extras','Tools'],help:['Hilfe','Help']
};
export function solidLabel(key,language='de'){return SOLID_LABELS[key]?.[language==='en'?1:0]??key;}
