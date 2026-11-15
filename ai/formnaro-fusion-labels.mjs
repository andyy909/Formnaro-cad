export const FUSION_LABELS={
  'cad-draft':['Entformungsschräge','Draft'],'cad-defeature':['Merkmale entfernen','Defeature'],'cad-revolution':['Rotation','Revolve'],'cad-helix':['Helix','Helix'],
  'cad-surface-fill':['Randkurvenfläche','Boundary surface'],'cad-surface-transition':['Flächenübergang','Surface transition'],'cad-surface-sew':['Flächen vernähen','Sew surfaces'],'cad-surface-relief':['Prägung / Vertiefung','Emboss / engrave'],
  solid:['Volumenkörper','Solid'],sketch:['Skizze','Sketch'],mesh:['Netz','Mesh'],tools:['Werkzeuge','Tools'],
  model:['Browser','Browser'],properties:['Eigenschaften','Properties'],library:['Einfügen','Insert'],workspace:['Dokument','Document'],
  create:['Erstellen','Create'],modify:['Ändern','Modify'],assemble:['Zusammenfügen','Assemble'],construct:['Konstruieren','Construct'],inspect:['Prüfen','Inspect'],insert:['Einfügen','Insert'],
  extrude:['Extrusion','Extrude'],cut:['Extrusion · Ausschneiden','Extrude · Cut'],round:['Abrunden','Fillet'],chamfer:['Fase','Chamfer'],drill:['Bohrung','Hole'],
  'cad-shell':['Schale','Shell'],'cad-loft':['Erhebung','Loft'],'cad-sweep':['Sweeping','Sweep'],'cad-contour':['Projizieren / Kontur','Project / contour'],
  'cad-face-offset':['Fläche versetzen','Offset face'],'cad-edit-modeling':['Element bearbeiten','Edit feature'],array:['Anordnung','Pattern'],mirror:['Spiegeln','Mirror'],
  'project-parameters':['Parameter ändern','Change parameters'],'sketch-on-part':['Skizze auf Fläche','Sketch on face'],
  'sketch-templates':['Skizzenvorlagen','Sketch templates'],'linked-contours':['Verknüpfte Projektion','Linked projection'],
  'mode-translate':['Verschieben / Kopieren','Move / Copy'],measure:['Messen','Measure'],section:['Schnittanalyse','Section analysis'],
  orientation:['Ansicht ausrichten','View orientation'],options:['Fusion-Einstellungen','Fusion settings'],file:['Datei','File'],edit:['Bearbeiten','Edit'],view:['Ansicht','View'],extras:['Dienstprogramme','Utilities'],help:['Hilfe','Help']
};
export const fusionLabel=(key,language='de')=>FUSION_LABELS[key]?.[language==='en'?1:0]??key;
