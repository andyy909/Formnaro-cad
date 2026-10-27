// UI localization keeps authored text separately from rendered translations.
// Project names, user object names and plugin metadata are never rewritten.
const pairs=`
Automatische Bemaßung|Automatic dimensioning
Grundbemaßung|Basic dimensions
Detaillierte Bemaßung|Detailed dimensions
Automatisch bemaßen|Add automatic dimensions
Ergänzt Maße auf dem ganzen Blatt. Vorhandene Maße bleiben erhalten. Vorschläge lassen sich verschieben, löschen und ergänzen.|Adds dimensions across the sheet. Existing dimensions are retained. Move, delete or add dimensions as needed.
Maße ergänzt|Dimensions added
Bereits bemaßt|Already dimensioned
Vorschau prüfen und mit „Blatt übernehmen“ speichern.|Review the preview and save with “Apply sheet”.
Horizontaler Abstand · zwei Maßpunkte|Horizontal distance · two measurement points
Vertikaler Abstand · zwei Maßpunkte|Vertical distance · two measurement points
Zwei Maßpunkte derselben Ansicht anklicken. Bei Geraden wird der nächste Endpunkt, bei Kreisen die Mitte verwendet.|Click two measurement points in the same view. Lines use the nearest endpoint; circles use their centre.
Zweiten Maßpunkt derselben Ansicht anklicken.|Click the second measurement point in the same view.
Beide Maßpunkte in derselben Ansicht auswählen.|Select both measurement points in the same view.
Zuerst „Blatt aktualisieren“ ausführen.|Use “Update sheet” first.
Ansichten mit Spline-Konturen erhalten keine automatischen Gesamt- oder Positionsmaße.|Views containing spline curves do not receive automatic overall or position dimensions.
Für einige Maße fehlt freier Platz. Ansichten verschieben oder den Papiermaßstab verkleinern und erneut bemaßen.|Some dimensions have no free space. Move views or reduce the paper scale and run dimensioning again.
Die Maßgrenze wurde erreicht. Weitere Maße bei Bedarf manuell ergänzen.|The dimension limit was reached. Add further dimensions manually if needed.
CAD-Bearbeitung ändern …|Edit CAD feature …
CAD-Bearbeitung ändern|Edit CAD feature
Gespeichertes Rezept ändern. Die erhaltene Originalquelle und ihre Flächenauswahl bleiben erhalten.|Edit the saved recipe. The retained original source and face selection are preserved.
Maße der gespeicherten Bearbeitung einstellen und Vorschau berechnen.|Set the saved feature dimensions and compute the preview.
Kontur von CAD-Fläche …|Contour from CAD face …
CAD-Fläche versetzen …|Offset CAD face …
CAD-Körper aushöhlen …|Shell CAD body …
Übergang zwischen Skizzen …|Loft between sketches …
Profil entlang eines Pfads …|Sweep profile along path …
Kontur von CAD-Fläche übernehmen|Copy contour from CAD face
CAD-Fläche versetzen|Offset CAD face
CAD-Körper aushöhlen|Shell CAD body
Übergang zwischen Skizzen|Loft between sketches
Profil entlang eines Pfads|Sweep profile along path
Versatz (mm)|Offset (mm)
Wandstärke nach innen (mm)|Inward wall thickness (mm)
Biegeradius (mm)|Bend radius (mm)
Biegewinkel (1–180°)|Bend angle (1–180°)
Pfad|Path
Gerade|Straight line
Kreisbogen|Circular arc
Andere Fläche wählen|Choose another face
Keine Fläche ausgewählt.|No face selected.
Eine geeignete CAD-Fläche auswählen.|Choose a suitable CAD face.
Maße einstellen und Vorschau berechnen.|Set dimensions and compute the preview.
Native CAD-Fläche wird gelesen …|Reading native CAD face …
Native Geometrie wird berechnet und geprüft …|Computing and validating native geometry …
Geprüfte Vorschau bereit. Übernehmen oder abbrechen.|Validated preview ready. Apply or cancel.
CAD-Bearbeitung zuerst übernehmen oder abbrechen.|Apply or cancel CAD modeling first.
Eine ebene CAD-Fläche anklicken. Außenkontur und geeignete Innenöffnungen werden als unabhängiger Skizzenentwurf übernommen.|Click a planar CAD face. Its outer contour and supported openings are copied into an independent sketch draft.
Eine ebene Fläche oder eine gerade vollständige Zylinderfläche zwischen ebenen Stirnflächen wählen. Plus ergänzt Material, Minus entfernt Material. Eine Bohrung wird mit Plus kleiner und mit Minus größer.|Choose a planar face or a complete straight cylindrical face between planar end faces. Positive offsets add material; negative offsets remove material. A bore becomes smaller with a positive offset and larger with a negative offset.
Eine ebene Öffnungsfläche anklicken. Die Wandstärke wird nach innen erzeugt. Ungeeignete Formen werden abgewiesen.|Click a planar opening face. Wall thickness is created inwards. Unsuitable shapes are rejected.
Verbindet die Außenkonturen der beiden ausgewählten Skizzen in ihrer räumlichen Lage. Die Ausgangsskizzen bleiben erhalten. Innenöffnungen sind in dieser ersten Stufe nicht zulässig.|Connects the outer contours of the two selected sketches at their spatial positions. The source sketches are retained. Inner openings are not supported in this first stage.
Die ausgewählte Skizze bildet den Querschnitt. Der Pfad startet am Skizzenursprung entlang ihrer positiven Z-Richtung; ein Kreisbogen biegt zur positiven X-Richtung. Die Ausgangsskizze bleibt erhalten.|The selected sketch defines the cross section. The path starts at the sketch origin along positive local Z; a circular arc bends towards positive local X. The source sketch is retained.
Lochformen werden zu einer gemeinsamen Lochform vereinigt. Die gespeicherten Quellen bleiben bearbeitbar.|Hole shapes are combined into one hole shape. The saved sources remain editable.
Die CAD-Gruppe braucht aktive Körperquellen oder mindestens zwei Lochformen.|The CAD group needs active solid sources or at least two hole shapes.
Gruppe benötigt eine aktive Körperquelle oder Lochformen.|A group needs an active solid source or hole shapes.
Vergleich|Comparison
Ergebnis|Result
Vorschau|Preview
Schutzflächen und offene Ränder bleiben fest. Orange: Pinsel. Blau: gespiegelter Pinsel. Grobe Netze vorher unterteilen.|Protected faces and open boundaries stay fixed. Orange: brush. Blue: mirrored brush. Subdivide coarse meshes first.
Modellierpinsel zuerst übernehmen oder abbrechen.|Apply or cancel sculpting brushes first.
Modellierpinsel und Symmetrie|Sculpting brushes and symmetry
Modellierpinsel und Symmetrie …|Sculpting brushes and symmetry …
Modellierpinsel abbrechen|Cancel sculpting brushes
Links auf dem Netz zeichnen. Rechts drehen, mit dem Mausrad zoomen. Nach jedem Strich erscheint eine geprüfte Vorschau.|Draw on the mesh with the left mouse button. Orbit with the right button and zoom with the wheel. Each stroke produces a checked preview.
Pinsel|Brush
Auftragen|Inflate
Abtragen|Deflate
Abflachen|Flatten
Glätten|Smooth
Stärke (0–1)|Strength (0–1)
Höchste Verschiebung insgesamt (mm)|Maximum total displacement (mm)
Symmetrie|Symmetry
Weltebene X|World plane X
Weltebene Y|World plane Y
Weltebene Z|World plane Z
Ebenenposition (mm)|Plane position (mm)
Bearbeitungsbereich|Editing scope
Ganzes Netz|Entire mesh
Übernommene Flächenauswahl|Confirmed surface selection
Letzten Strich entfernen|Remove last stroke
Neu beginnen|Start over
Schutzflächen und offene Ränder bleiben fest. Der blaue Kreis zeigt den gespiegelten Pinsel. Die Symmetrie spiegelt Striche; sie baut kein unsymmetrisches Teil um. Vorhandene Dreiecke werden verformt. Grobe Netze vorher unterteilen; CAD-Geometrie bleibt unverändert.|Protected faces and open boundaries stay fixed. The blue ring shows the mirrored brush. Symmetry mirrors strokes; it does not symmetrize an asymmetric part. Existing triangles are deformed. Subdivide coarse meshes first; CAD geometry is preserved.
Mit gedrückter linker Maustaste auf dem Netz zeichnen.|Draw on the mesh with the left mouse button held down.
Pinselverformung und Geometrie werden geprüft …|Checking brush deformation and geometry …
Vorschau prüfen, weitere Striche zeichnen oder übernehmen. Das Original bleibt bis zur Übernahme unverändert.|Review the preview, draw more strokes or apply. The original stays unchanged until you apply.
Pinselverformung übernommen. Ein Rückgängig-Schritt stellt das Original wieder her.|Brush deformation applied. One Undo restores the original.
Neue Formen|New shapes
Automatisch|Automatic
Erstellt Netzformen|Creates mesh shapes
Erstellt CAD-Formen|Creates CAD shapes
Teil auswählen oder CAD/Netz festlegen|Select a part or choose CAD/Mesh
Für neue Formen ein CAD- oder Netzteil auswählen oder den Formtyp CAD/Netz festlegen.|To create shapes, select a CAD or mesh part or choose the CAD/Mesh shape type.
Mindestens zwei Teile auswählen.|Select at least two parts.
einzeln auswählbare Teile.|individually selectable parts.
einzeln auswählbare Netzreferenzen.|individually selectable mesh references.
Dateieinheiten werden in Millimeter umgerechnet. Originalpositionen und Objektfarben bleiben erhalten.|File units are converted to millimetres. Original positions and object colours are retained.
Nicht druckbare 3MF-Hilfsobjekte wurden ausgelassen.|Non-printable 3MF helper objects were skipped.
Als nicht druckbar markierte 3MF-Objekte wurden ausgelassen.|3MF objects marked non-printable were skipped.
Teile importieren|Import parts
Teile als Netzreferenzen importieren|Import parts as mesh references
GLB · Darstellung in einer Datei|GLB · single-file visualization
Sichtbare Teile|Visible parts
Ausgewählte Teile|Selected parts
Alle Teile werden gemeinsam geprüft und als ein rückgängig machbarer Import übernommen. Offene Netze werden abgewiesen.|All parts are checked together and imported as one undoable operation. Open meshes are rejected.
Netzreferenzen sind Ansichtsvorlagen, keine nativen CAD-Körper. 3MF, GLB und glTF können sie wieder exportieren.|Mesh references are visual guides, not native CAD solids. They can be re-exported to 3MF, GLB and glTF.
Texturen werden nicht übernommen; Objektfarben bleiben erhalten.|Textures are not imported; object colours are retained.
Vertexfarben werden nicht übernommen; Material-Objektfarben bleiben erhalten.|Vertex colours are not imported; material object colours are retained.
Animationen werden als statische Ausgangsstellung importiert.|Animations are imported in their static initial pose.
Mehrere Flächenfarben innerhalb eines Teils: Die erste Objektfarbe wird verwendet.|Multiple face colours in one part: the first object colour is used.

Unabhängige Körper herauslösen|Extract independent bodies
Körper herauslösen|Extract bodies
Getrennte native Volumenkörper erhalten eigene Quellenkopien. Innere Hohlräume bleiben bei ihrem Körper.|Separated native solids receive independent source copies. Inner cavities stay with their solid.
Überlappende oder berührende Einzelkörper werden abgewiesen. Lage und Farbe bleiben bearbeitbar; Originalgeometrieänderungen benötigen erneutes Herauslösen.|Overlapping or touching solids are rejected. Pose and color remain editable; original geometry changes require a new extraction.
Native Körpertopologie und Abstände werden geprüft …|Checking native solid topology and distances …
Unabhängige native Körper geprüft|Independent native solids verified
Native Körpertopologie prüfen|Check native solid topology
Alle Körper übernehmen|Apply all bodies
Native Körper einzeln in ursprünglicher Lage übernommen.|Native bodies applied separately in their original positions.
Ein fertiges CAD-Teil zum Herauslösen auswählen.|Select one completed CAD part to extract.
Ein sichtbares CAD-Teil zum Herauslösen auswählen.|Select a visible CAD part to extract.
Dieses Teil enthält bereits nur einen nativen Volumenkörper.|This part already contains only one native solid.
Mehr als 500 Körper können nicht einzeln herausgelöst werden.|More than 500 solids cannot be extracted separately.
Ein Herauslöseergebnis enthält keine eindeutige native Körpertopologie.|An extraction result has no unambiguous native solid topology.
Gleiche, überlappende oder berührende Körper können nicht unabhängig herausgelöst werden.|Identical, overlapping or touching solids cannot be extracted independently.
Überlappende oder berührende Körper können nicht unabhängig herausgelöst werden.|Overlapping or touching solids cannot be extracted independently.
Der native Körperabstand konnte nicht geprüft werden.|The native solid distance could not be verified.
Die native Körperzerlegung hat den Materialerhalt nicht bestätigt.|Native solid extraction did not confirm material preservation.
Die Originalgeometrie wurde geändert. Körper erneut herauslösen.|The original geometry changed. Extract the bodies again.
Der native Körperbezug ist verloren oder mehrdeutig. Körper erneut herauslösen.|The native solid reference is lost or ambiguous. Extract the bodies again.
Ungültiger nativer Geometriebezug des herausgelösten Körpers.|Invalid native geometry reference for the extracted body.
Ein herausgelöster Körper kann nicht gewöhnlich aufgelöst werden; dabei würde das vollständige Original wieder erscheinen.|An extracted body cannot be ordinarily dissolved; that would restore the complete original.
Getrennte native Körper einzeln bearbeiten; Hohlräume und geprüfte Originalquellen erhalten.|Edit separated native solids independently; retain cavities and verified original sources.
Gesicherte Originalgeometrie. Zum Ändern die Originalquelle kopieren, als eigenes Teil einfügen und erneut herauslösen.|Preserved original geometry. To edit, copy the retained source, paste it as a separate part and extract it again.
Ebene|Plane
Körper mit Ebene teilen|Split body with a plane
Mit Ebene teilen|Split with plane
Welt X|World X
Welt Y|World Y
Welt Z|World Z
Eigene Normale|Custom normal
Normalenrichtung|Normal direction
Normale|Normal
Abstand entlang der Normale|Distance along the normal
Anzeigeabstand|Preview spacing
Anzeigeabstand trennt nur die Vorschau. Beide Teile werden in ihrer ursprünglichen Lage übernommen.|Preview spacing only separates the preview. Both parts are applied in their original positions.
Seite +|Positive side
Seite −|Negative side
Beide Seiten übernehmen|Apply both sides
Ebene einstellen und native Vorschau berechnen.|Set the plane and compute a native preview.
Beide Seiten werden nativ berechnet …|Computing both sides natively …
Beide Seiten sind geschlossen|Both sides are closed
Native Teilungsvorschau fehlt.|Native split preview is missing.
Beide CAD-Teile in ursprünglicher Lage übernommen.|Both CAD parts applied in their original positions.
Ein fertiges CAD-Teil für die Ebenenteilung auswählen.|Select one completed CAD part for plane splitting.
Ein sichtbares, entsperrtes CAD-Teil auswählen.|Select a visible unlocked CAD part.
Anzeigeabstand muss zwischen 0 und 10000 mm liegen.|Preview spacing must be between 0 and 10000 mm.
Ungültiger CAD-Vorschauversatz.|Invalid CAD preview offset.
Die Ebene teilt kein Material: außerhalb, tangential oder nur in einer Materiallücke.|The plane divides no material: outside, tangent or only in a material gap.
Die native Ebenenteilung konnte nicht berechnet werden.|The native plane split could not be computed.
Die Teilung erzeugt zu viele native Körper.|The split produces too many native bodies.
Ein natives Teilergebnis lässt sich keiner Ebenenseite eindeutig zuordnen.|A native result cannot be assigned to one plane side unambiguously.
Die Teilung benötigt auf beiden Seiten geschlossene Körper.|The split needs closed bodies on both sides.
Die native Teilung hat den Materialerhalt nicht bestätigt.|Native splitting did not confirm material preservation.
Die Teilungsnormale darf nicht null sein.|The split normal must not be zero.
Teilung benötigt drei endliche Koordinaten.|Splitting needs three finite coordinates.
Ungültiges natives Teilungsrezept.|Invalid native partition recipe.
Teilungsebene benötigt einen gültigen Ursprung und eine normierte Normale.|The split plane needs a valid origin and a unit normal.
Die Teilung benötigt eine aktive Originalquelle.|The split needs an active original source.
Die Teilungsebene ist in diesem CAD-Bezug nicht endlich darstellbar.|The split plane cannot be represented finitely in this CAD frame.
Ein geteiltes Teil kann nicht gewöhnlich aufgelöst werden; dabei würde das vollständige Original wieder erscheinen.|A split part cannot be ordinarily dissolved; that would restore the complete original.
Beide Seiten mit unabhängigen Originalquellen erhalten; Anzeigeabstand nur in der Vorschau.|Retain both sides with independent original sources; spacing applies only to the preview.
Native Teilung|Native partition
Lokale Ebene|Local plane
Konturmaße|Contour dimensions
Weltgrenzen|World bounds
Native Skizzenmaße fehlen.|Native sketch dimensions are missing.
Bearbeitbare Skizze|Editable sketch
Skizze …|Sketch …
Skizze bearbeiten|Edit sketch
Kontur|Contour
Rechteck|Rectangle
Kreis|Circle
Geschlossene Kontur|Closed contour
Im Zeichenfeld ziehen: Rechteck / Kreis. Kontur: Punkte anklicken, automatisch geschlossen. Maße in mm; Formeln mit + − * / und Klammern.|Drag in the drawing area for a rectangle or circle. Click contour points; the contour closes automatically. Dimensions in mm; formulas use + − * / and parentheses.
Skizzenfläche in Millimetern|Sketch drawing area in millimeters
Kontur leeren|Clear contour
Letzten Punkt entfernen|Remove last point
Feste Maße / Maßbeziehungen|Dimensions / dimension formulas
Benannte Maße|Named dimensions
Beispiel: innen = breite − 2 * wand. Namen ohne Leerzeichen, z. B. breite, wand.|Example: inside = width − 2 * wall. Names have no spaces, e.g. width or wall.
Maß|Dimension
Maßname|Dimension name
Wert oder Formel|Value or formula
Maß entfernen|Remove dimension
Extrusionshöhe|Extrusion height
Formel|Formula
Native 3D-Vorschau der Extrusion|Native 3D extrusion preview
Skizze ändern|Update sketch
Extrudieren und hinzufügen|Extrude and add
Native Vorschau bereit|Native preview ready
Native Skizze wird berechnet …|Calculating native sketch …
Eine native Skizze oder ihre Gruppenquelle auswählen.|Select a native sketch or its group source.
Eine entsperrte native Skizze auswählen.|Select an unlocked native sketch.
Modell geändert. Skizze erneut öffnen.|The model changed. Open the sketch again.
Geschlossene Kontur: höchstens 128 Punkte.|Closed contour: at most 128 points.
Native Skizzenvorschau fehlt.|Native sketch preview is missing.
Ungültige native Skizzendaten.|Invalid native sketch data.
Maßformel: 1–200 Zeichen erforderlich.|A dimension formula needs 1–200 characters.
Nur Zahlen, Maßnamen, + − * / und Klammern verwenden.|Use only numbers, dimension names, + − * / and parentheses.
Ungültiges oder zu großes Maßergebnis.|Invalid or excessive dimension result.
Maßformel zu tief verschachtelt.|Dimension formula nesting is too deep.
Klammer fehlt.|Missing parenthesis.
Unvollständige Maßformel.|Incomplete dimension formula.
Division durch null.|Division by zero.
Ungültige Maßformel.|Invalid dimension formula.
Eine Skizze mit höchstens 40 benannten Maßen erforderlich.|A sketch with at most 40 named dimensions is required.
Maßnamen müssen eindeutig sein und Buchstaben, Ziffern oder Unterstrich enthalten.|Dimension names must be unique and contain letters, digits or underscores.
Geschlossene Kontur: 3–128 Punkte.|Closed contour: 3–128 points.
Konturpunkt braucht X und Y.|A contour point needs X and Y.
Doppelte, zu nahe oder zurücklaufende Konturpunkte.|Duplicate, nearly coincident or reversing contour points.
Kontur überschneidet oder berührt sich selbst.|The contour intersects or touches itself.
Die Kontur hat keine Fläche.|The contour has no area.
Skizze außerhalb der zulässigen Abmessungen.|Sketch dimensions are outside the permitted range.
Rechteck, echter Kreis oder geschlossene Kontur mit benannten Maßen und nativer Extrusion.|Rectangle, native circle or closed contour with named dimensions and native extrusion.
Vollständiger Lizenztext|Full license text
Offener Quellcode für die nach dieser Lizenz erlaubten nichtkommerziellen Zwecke. Es gelten besondere Erlaubnisse für die im Lizenztext genannten Einrichtungen. Die Beschränkung gilt für den eigenen Anwendungscode; Fremdkomponenten behalten ihre ursprünglichen Lizenzrechte.|Source code is available for the noncommercial purposes permitted by this license. Special permissions apply to the organizations named in the license. The restriction applies to the application code; third-party components retain their original license rights.
Gesammelte Lizenzhinweise|Collected license notices
Konverter|Converter
CAD-Kern|CAD kernel
Impressum und Lizenz|Imprint and license
Name / Rechteinhaber|Name / copyright holder
Eigene Softwarelizenz|Application license
Name noch nicht eingetragen.|Name has not been entered yet.
Eigene Lizenz noch nicht festgelegt.|The application license has not been specified yet.
Eigenen Lizenztext speichern|Save application license text
Lizenzen der verwendeten Komponenten|Third-party licenses
Für verwendete Bibliotheken, den CAD-Kern, Schriften und die Konverter-Laufzeit gelten die jeweiligen Original-Lizenztexte.|The original license terms apply to the included libraries, CAD kernel, fonts and converter runtime.
Lizenzdokument|License document
Lizenztext wird geladen …|Loading license text …
Lizenztext konnte nicht geladen werden.|The license text could not be loaded.
Ausgewählten Lizenztext speichern|Save selected license text
Fehlerprotokolle öffnen|Open error logs
Fehler werden automatisch lokal protokolliert. Die letzten fünf Protokolldateien bleiben erhalten.|Errors are logged automatically on this computer. The five most recent log files are retained.
Formmaße|Shape dimensions
Ringradius (bis Rohrmitte)|Ring radius (to tube centre)
Rohrradius|Tube radius
Außendurchmesser|Outer diameter
Innendurchmesser|Inner diameter
Profilhöhe|Profile height
Rohrlänge|Tube length
Grundradius|Base radius
Grunddurchmesser|Base diameter
Oberer Durchmesser|Top diameter
Schieber|Slider
Der Radius setzt alle drei Durchmesser gleich.|The radius sets all three diameters equally.
Der Radius setzt Durchmesser und Halbkugelhöhe.|The radius sets the diameter and hemisphere height.
Ringradius: bis zur Rohrmitte. Rohrradius: halbe Rohrdicke. Radiale Maße setzen X/Y gleich; Rohrradius setzt auch die Profilhöhe.|Ring radius: to tube centre. Tube radius: half the tube thickness. Radial dimensions set X/Y equally; tube radius also sets profile height.
Radiale Maße setzen X/Y gleich. Die Höhe ist separat einstellbar.|Radial dimensions set X/Y equally. Height can be adjusted separately.
Höhe der Grundformen anpassen|Adjust basic shapes height
Breite der Formenleiste anpassen|Adjust shapes sidebar width
Breite der Eigenschaftenleiste anpassen|Adjust properties sidebar width
Höhe des KI-Chats anpassen|Adjust AI chat height
Ziehen oder Pfeiltasten; Doppelklick setzt zurück|Drag or use arrow keys; double-click to reset
Funktionen|Functions
Funktions-Plugins|Function plugins
Funktions-Plugin laden …|Load function plugin …
Funktions-Plugin geladen.|Function plugin loaded.
Funktions-Plugins verwalten …|Manage function plugins …
Formenpakete|Shape packages
Mitgeliefert|Included
Mitgeliefert · unter Funktionen verfügbar|Included · available under Functions
Diese Erweiterungen erscheinen unter „Funktionen“, getrennt von der Formenbibliothek.|These extensions appear under “Functions”, separate from the shape library.
Dateiwerkzeuge und Funktions-Plugins sind hier getrennt von den Formen.|File tools and function plugins are separate from shapes here.
Keine Funktions-Plugins aktiviert. In Einstellungen → Plugins verwalten.|No function plugins enabled. Manage them in Settings → Plugins.
STL-Einheit|STL unit
Netz vor der Konvertierung reparieren|Repair mesh before conversion
Kleine dreieckige oder planare viereckige Lücken schließen|Close small triangular or planar quadrilateral gaps
Dein aktuelles Projekt wird nicht verändert. Die STEP-Datei wird separat gespeichert.|Your current project is preserved. The STEP file is saved separately.
Geschlossene STL-Hüllen werden als CAD-Körper rekonstruiert. Originale Konstruktionsschritte werden dabei nicht wiederhergestellt.|Closed STL shells are reconstructed as CAD solids. Original construction history is not restored.
Konvertieren und STEP speichern|Convert and save STEP
STEP-Datei gespeichert.|STEP file saved.
STEP-Datei wird erzeugt …|Creating STEP file …
STL wird als CAD-Körper rekonstruiert …|Reconstructing STL as CAD solid …
Speichern abgebrochen. Du kannst erneut speichern.|Save canceled. You can save again.
▱ Projekte|▱ Projects
Projekte|Projects
Projekt speichern|Save project
Projekt gespeichert.|Project saved.
Speichern unter …|Save as …
Projekt öffnen …|Open project …
Projektordner öffnen|Open project folder
Zuletzt verwendet|Recently used
Im Projektordner|In the project folder
Das Projekt enthält alle Teile, Quellen, Layer, Notizen und die aktuelle Ansicht.|The project includes all parts, sources, layers, notes and the current view.
Noch keine Projekte gespeichert oder geöffnet.|No projects saved or opened yet.
Noch keine Projekte in diesem Ordner.|No projects in this folder yet.
Datei nicht mehr vorhanden|File no longer available
Im Browser werden Projekte als .ocad-Datei heruntergeladen.|In the browser, projects are downloaded as .ocad files.
Weitere Projekte über „Projekt öffnen …“ auswählen.|Select more projects with “Open project …”.
Projekt wechseln|Switch project
Aktuelle Änderungen vor dem Wechsel speichern?|Save current changes before switching?
Ohne Speichern wechseln|Switch without saving
Speichern und wechseln|Save and switch
Seitenleiste einklappen|Collapse sidebar
Seitenleiste ausklappen|Expand sidebar
Seiten links/rechts tauschen|Swap left/right sidebars
Seitenleisten getauscht.|Sidebars swapped.
Schrift suchen …|Search fonts …
Schrift suchen|Search fonts
Schrift importieren …|Import font …
Eigene Schriften …|Imported fonts …
Eigene Schriften|Imported fonts
TTF-/OTF-Dateien werden im portablen Datenordner gespeichert. Beim Entfernen bleiben bestehende Textkörper erhalten; zum späteren Textändern wird die Schrift wieder benötigt.|TTF/OTF files are stored in the portable data folder. Removing a font preserves existing text bodies; editing their characters later requires the font again.
KI-Chat|AI chat
KI-Anbieter|AI provider
KI-Modell|AI model
Modellliste aktualisieren|Refresh models
Schlüssel für diesen Anbieter vorhanden; leer lassen zum Beibehalten.|Key available for this provider; leave blank to keep it.
Noch kein API-Schlüssel für diesen Anbieter hinterlegt.|No API key saved for this provider yet.
✦ KI-Chat|✦ AI chat
Chatverlauf|Chat history
Neuer Chat|New chat
Große KI-Werkstatt|Full AI workshop
Nachricht|Message
Nachricht an die KI …|Message the AI …
Bilder hinzufügen|Add images
＋ Bild|＋ Image
Senden ↑|Send ↑
Ansehen|Preview
Übernehmen|Apply
Nachricht, Chatverlauf, Bilder und Modellkontext werden erst beim Senden an deinen KI-Anbieter übertragen.|Your message, chat history, images and model context are shared with your AI provider only when you send.
Geprüfter Vorschlag · Modell unverändert|Checked proposal · model unchanged

Einstellungen, Bibliothek und Autosicherung liegen im Ordner „Daten“ neben Formnaro.exe. Zum PC-Wechsel die Ordner „Daten“ und „Layouts“ mitkopieren.|Settings, library and autosave are stored in the “Daten” folder next to Formnaro.exe. Copy the “Daten” and “Layouts” folders when moving to another PC.
Datenordner öffnen|Open data folder
Daten konnten nicht im Programmordner gespeichert werden. Bitte einen beschreibbaren Ordner verwenden.|Data could not be saved in the program folder. Please use a writable folder.
Die portablen Daten wurden inzwischen geändert. Bitte die Anwendung neu starten.|The portable data has changed. Please restart the application.
Autosicherung nicht gespeichert · bitte Projektdatei speichern|Autosave could not be saved · please save a project file
Mehrere Anordnungen unter eigenen Namen speichern und jederzeit wechseln.|Save several layouts under your own names and switch at any time.
Gespeicherte Layouts|Saved layouts
Layout auswählen …|Choose a layout …
Layoutname|Layout name
Zum Beispiel: Modellieren|For example: Modeling
Als neues Layout (optional)|As a new layout (optional)
Aktuelle Anordnung als neues Layout speichern|Save current arrangement as a new layout
Layout laden|Load layout
Aktualisieren|Update
Löschen|Delete
Löschen bestätigen|Confirm deletion
Layoutordner öffnen|Open layout folder
Erneut laden|Reload
Layouts liegen im Ordner „Layouts“ neben Formnaro.exe. Diesen Ordner beim PC-Wechsel mitkopieren.|Layouts are stored in the “Layouts” folder next to Formnaro.exe. Copy this folder when moving to another PC.
Layouts werden in diesem Browser gespeichert.|Layouts are saved in this browser.
Abbrechen oder Escape im Anordnungsmodus stellt die vorherige Anordnung wieder her. Gespeicherte Layouts bleiben beim Zurücksetzen erhalten.|Cancel or Escape in the layout editor restores the previous arrangement. Resetting keeps your saved layouts.
Layout geladen.|Layout loaded.
Layout gespeichert.|Layout saved.
Layout aktualisiert.|Layout updated.
Layout umbenannt.|Layout renamed.
Layout gelöscht.|Layout deleted.
Layouts werden gerade geladen oder gespeichert.|Layouts are being loaded or saved.
Layouts werden gerade gespeichert.|Layouts are being saved.
Bitte einen Namen für das Layout eingeben.|Please enter a name for the layout.
Layoutnamen müssen 1 bis 80 Zeichen lang sein.|Layout names must contain 1 to 80 characters.
Ein Layout mit diesem Namen existiert bereits.|A layout with this name already exists.
Maximal 100 Layouts können gespeichert werden.|Up to 100 layouts can be saved.
Dieses Layout ist nicht mehr vorhanden.|This layout no longer exists.
Ungültige Layoutdatei.|Invalid layout file.
Ungültiger Layoutbefehl.|Invalid layout command.
Layoutdatei ist zu groß.|Layout file is too large.
Die Layoutdatei wurde inzwischen geändert. Bitte erneut laden.|The layout file has changed. Please reload it.
Die Layoutdatei ist beschädigt oder nicht kompatibel. Die Datei wurde nicht verändert.|The layout file is damaged or incompatible. The file was not changed.
Layouts konnten nicht im Programmordner gespeichert werden. Bitte einen beschreibbaren Ordner verwenden.|Layouts could not be saved in the program folder. Please use a writable folder.
Oberfläche|Interface
Oberfläche anordnen|Arrange interface
Oberfläche anordnen …|Arrange interface …
Werkzeug verschieben|Move tool
Formen und Objekte|Shapes and objects
Eigenschaften|Properties
Ansichtswerkzeuge|View tools
Bewegungswerkzeuge|Movement tools
Bereich an einen markierten Platz ziehen|Drag this group to a marked dock
Links andocken|Dock left
Rechts andocken|Dock right
Oben andocken|Dock at top
Unten andocken|Dock at bottom
Standardanordnung|Default layout
Anordnung speichern|Save layout
Anordnung zurücksetzen|Reset layout
Oberflächenanordnung gespeichert.|Interface layout saved.
Standardanordnung wiederhergestellt.|Default layout restored.
Ungültige Oberflächenanordnung.|Invalid interface layout.
Ungültiger Platz für dieses Werkzeug.|Invalid position for this tool.
Ordne Leisten und Bereiche nach deinen Wünschen an. Die Anordnung bleibt nach einem Neustart erhalten.|Arrange toolbars and panels as you like. The layout is retained after restart.
Die Formenbibliothek und die Eigenschaften können die Seiten tauschen. Obere Taster lassen sich auch zwischen den beiden Leisten verschieben. Alle Werkzeuge bleiben erreichbar.|The shape library and properties can swap sides. Top buttons can also move between the two toolbars. All tools remain accessible.
Taster ziehen und an der Markierung loslassen. Bereiche am Griff in einen Andockplatz ziehen. Pfeiltasten verschieben den fokussierten Griff.|Drag buttons and release at the marker. Drag groups by their handles to a dock. Arrow keys move the focused handle.
✦ KI|✦ AI
KI / API|AI / API
KI-Werkstatt|AI Workshop
Neue Teile beschreiben oder bestehende Teile bearbeiten. Die KI erhält den aktuellen Modellzustand und den vollständigen Werkzeugkontext.|Describe new parts or edit existing parts. The AI receives the current model state and the complete tool context.
Auftrag|Task
Zum Beispiel: Erstelle eine 60 × 40 × 6 mm Platte mit vier 5-mm-Bohrungen.|For example: Create a 60 × 40 × 6 mm plate with four 5 mm holes.
Beim Senden werden Auftrag, Objektnamen, Maße und Formparameter an deinen eingestellten KI-Anbieter übertragen. Die CAD-Bedienung und lokale Befehle funktionieren weiterhin offline.|Sending transmits your task, object names, dimensions and shape parameters to the configured AI provider. CAD tools and local commands continue to work offline.
Vorschlag erzeugen|Generate proposal
API-Einstellungen|API settings
JSON-Befehle / externe KI|JSON commands / external AI
Kontext an eine andere KI geben, ihre JSON-Befehle hier einsetzen und prüfen. Dafür ist kein API-Schlüssel erforderlich.|Give the context to another AI, paste its JSON commands here and validate them. No API key is required.
Kontext kopieren|Copy context
Kontext speichern|Save context
Befehlsbeispiel|Command example
JSON-Befehle|JSON commands
Befehle prüfen|Validate commands
Befehle anzeigen|Show commands
Teil|Part
Maße (mm)|Dimensions (mm)
Volumen (mm³)|Volume (mm³)
Auf Fläche ansehen|View on canvas
Änderungen übernehmen|Apply changes
Verwerfen|Discard
KI-Vorschau · Original unverändert|AI preview · original unchanged
API-Schlüssel hier selbst eintragen. Lokale Modelle und externe KI-Steuerung benötigen keinen Cloud-Schlüssel.|Enter your API key here. Local models and external AI control do not require a cloud key.
API-Format|API format
OpenAI-kompatibles Chat-API|OpenAI-compatible Chat API
DeepSeek-Denkstufe|DeepSeek thinking effort
low · Einfach|low · Simple
high · Standard|high · Standard
max · Gründlich|max · Thorough
API-Basisadresse|API base URL
Modellkennung|Model ID
Modellkennung deines Anbieters|Your provider's model ID
API-Schlüssel|API key
Schlüssel hier eintragen|Enter key here
Schlüssel verschlüsselt auf diesem PC merken|Remember encrypted key on this PC
Schlüssel vorhanden; leer lassen zum Beibehalten.|Key available; leave blank to keep it.
Noch kein API-Schlüssel hinterlegt.|No API key entered yet.
API-Einstellungen speichern|Save API settings
Verbindung testen|Test connection
Schlüssel entfernen|Remove key
Lokale KI-Schnittstelle aktivieren|Enable local AI interface
Nur auf diesem Computer erreichbar. Die Verbindungsdatei enthält den Zugriffstoken; externe KI-Werkzeuge können damit Kontext, Modelle und Befehle verwenden.|Only accessible on this computer. The connection file contains the access token; external AI tools can use it to access context, models and commands.
Verbindungsdateipfad kopieren|Copy connection file path
Werkzeugkontext speichern|Save tool context
API-Anfragen stehen in der Windows-Anwendung zur Verfügung.|API requests are available in the Windows application.
DEINE LOKALE 3D-WERKSTATT|YOUR LOCAL 3D WORKSHOP
Formnaro – 3D-Werkstatt|Formnaro – 3D Workshop
Neu|New
Öffnen|Open
Speichern|Save
Projektname|Project name
Lokal · ohne Cloud|Local · no cloud
Lokal automatisch gesichert · Datei noch nicht gespeichert|Autosaved locally · project file not saved
Lokal · Autosicherung ausgeschaltet|Local · autosave disabled
Autosicherung voll · bitte Projektdatei speichern|Autosave storage full · please save a project file
Duplizieren|Duplicate
Einfügen|Paste
Einfügen (Strg+V)|Paste (Ctrl+V)
Kopieren|Copy
Kopieren (Strg+C)|Copy (Ctrl+C)
Gruppieren|Group
Auflösen|Ungroup
Ausrichten|Align
Spiegeln|Mirror
Zur Mitte|Center on bed
Auswahl in der Mitte der Grundebene absetzen|Place selection at the center of the base plane
Absetzen|Drop
? Hilfe|? Help
Grundformen|Basic shapes
Form suchen …|Search shapes …
Form suchen|Search shapes
Objekte|Objects
+ Ordner|+ Folder
Umbenennen|Rename
Entfernen|Remove
Auswahl zuordnen …|Assign selection …
Alle einblenden|Show all
Beispiel laden|Load example
OFFLINE BEREIT|OFFLINE READY
Startansicht|Home view
Oben|Top
Vorn|Front
Rechts|Right
Arbeitsebene · U/V/N|Workplane · U/V/N
Weltachsen · X/Y/Z|World axes · X/Y/Z
Koordinatensystem|Coordinate system
⌐ Lineal|⌐ Ruler
Lineal mit Kanten- oder Mittelpunktbezug|Ruler with edge or centre reference
Perspektive|Perspective
Orthogonal|Orthographic
↔ Verschieben|↔ Move
⤢ Größe|⤢ Scale
↻ Drehen|↻ Rotate
Aus einfachen Formen|Simple shapes become
wird dein nächstes Teil.|your next part.
Ziehe eine Form auf die Arbeitsfläche|Drag a shape onto the workplane
oder klicke links auf einen Grundkörper.|or click a basic shape on the left.
Beispiel: Platte mit Bohrungen →|Example: plate with holes →
Linksklick: auswählen · Umschalt: Mehrfachauswahl · Rechts ziehen: Ansicht drehen|Left click: select · Shift: multi-select · Right drag: orbit
Raster|Grid
Aus|Off
Form bearbeiten|Edit shape
Wähle eine Form aus,|Select a shape
um ihre Maße zu bearbeiten.|to edit its dimensions.
Objektname|Object name
Körper|Solid
Loch|Hole
Farbe|Colour
Abmessungen|Dimensions
X · Breite|X · Width
Y · Tiefe|Y · Depth
Z · Höhe|Z · Height
Proportionen beibehalten|Keep proportions
Position|Position
Mittelpunkt · mm|Centre · mm
Drehung|Rotation
Grad|Degrees
Formparameter|Shape parameters
Qualität / Seiten|Quality / sides
Objekt|Object
Sperren|Lock
Entsperren|Unlock
Ausblenden|Hide
Einblenden|Show
Weitere Operationen|More operations
Schnittmenge|Intersection
Anordnen …|Arrange …
Arbeitsfläche|Workspace
Breite × Tiefe (mm)|Width × depth (mm)
Breite Arbeitsfläche|Workspace width
Tiefe Arbeitsfläche|Workspace depth
Arbeitsebene setzen (W)|Set workplane (W)
Horizontale Ebene Z (mm)|Horizontal plane Z (mm)
Ebene auf Auswahloberseite|Plane on selection top
Grundebene|Base plane
Flächenebene · am Objekt befestigt|Face plane · attached to object
Freie Ebene|Free plane
Gesamte Auswahl|Whole selection
Fertig|Done
Mitte|Centre
Max|Max
Min|Min
Breite X|Width X
Tiefe Y|Depth Y
Höhe Z|Height Z
Gesamte Auswahl · Objekt anklicken, um es als Referenz festzulegen.|Whole selection · click an object to use as reference.
Gesamte Auswahl · ein Objekt als Referenz anklicken|Whole selection · click a reference object
Gesamte Auswahl · Objekt als Referenz anklicken.|Whole selection · click a reference object.
Modellhistorie|Model history
Zur fertigen Gruppe|Back to finished group
Gruppenoperation|Group operation
Vereinigen und Löcher abziehen|Union and subtract holes
Schnittmenge und Löcher abziehen|Intersection and subtract holes
Diesen Schritt aussetzen|Suppress this step
Lokale Maße vor der Gruppenskalierung. Änderungen aktualisieren das fertige Teil.|Local dimensions before group scaling. Changes update the finished part.
Eine Form oder Bohrung links im Baum anklicken.|Click a shape or hole in the tree on the left.
Diese Form ist gesperrt oder ihre alte Gruppenoperation ist nicht überprüfbar.|This shape is locked or its legacy group operation cannot be verified.
Modellhistorie auf-/zuklappen|Expand/collapse model history
Gruppenoperation bearbeiten|Edit group operation
Auf-/Zuklappen|Expand/collapse
Container sperren|Lock container
Container entsperren|Unlock container
Container ausblenden|Hide container
Container einblenden|Show container
Sperrung bearbeiten|Edit lock
Neuer Layer|New layer
Neuer Ordner|New folder
Name|Name
Auswahl zuordnen|Assign selection
Ziel|Destination
Zuordnen|Assign
Das Teil zuerst einblenden.|Show the part first.
Das fertige Teil zuerst einblenden.|Show the finished part first.
Das übergeordnete Layer oder den Ordner zuerst entsperren.|Unlock the parent layer or folder first.
Das übergeordnete Layer oder den Ordner zuerst einblenden.|Show the parent layer or folder first.
Sperrung am übergeordneten Layer oder Ordner aufheben.|Unlock the parent layer or folder.
Parameter zurücksetzen|Reset parameters
Originalgröße|Original size
Metrische Vorlage wählen …|Choose metric preset …
Metrische Gewindevorlage|Metric thread preset
Scharf|Sharp
Abrundung|Fillet
Fase 45°|45° chamfer
Kantenform|Edge shape
Radius / Fasenmaß|Radius / chamfer size
Kanten|Edges
Alle Kanten|All edges
Nur senkrechte Kanten|Vertical edges only
Rundungsschritte|Fillet steps
Randform|Rim shape
Ränder|Rims
Oben und unten|Top and bottom
Nur oben|Top only
Nur unten|Bottom only
Zähne|Teeth
Normalmodul|Normal module
Eingriffswinkel|Pressure angle
Schrägungswinkel|Helix angle
Zahnbreite|Face width
Zahndickenspiel|Backlash
Profilverschiebung|Profile shift
Kopfhöhenfaktor|Addendum factor
Fußhöhenfaktor|Dedendum factor
Bohrung Ø|Bore Ø
Naben-Ø (0 = ohne)|Hub Ø (0 = none)
Zusätzliche Nabenhöhe|Additional hub height
Nutbreite (0 = ohne)|Keyway width (0 = none)
Nuttiefe ab Bohrung|Keyway depth from bore
Ausführung|Type
Außengewinde|External thread
Innengewinde / Mutter|Internal thread / nut
Lochform für Innengewinde|Internal thread cutter
Profil|Profile
Metrisches 60°-Druckprofil|Metric 60° profile
Trapezprofil 30°|Trapezoidal 30° profile
Eigenes Profil|Custom profile
Nenndurchmesser|Nominal diameter
Steigung|Pitch
Gewindelänge|Thread length
Drehrichtung|Handedness
Rechtsgewinde|Right-hand thread
Linksgewinde|Left-hand thread
Gänge|Starts
Startwinkel|Start angle
Radiales Passungsspiel|Radial clearance
Profiltiefe (0 = automatisch)|Profile depth (0 = automatic)
Flankenwinkel (eigenes Profil)|Flank angle (custom profile)
Kopfbreite / Steigung|Crest width / pitch
Einführfase|Lead-in chamfer
Axiale Bohrung Ø|Axial bore Ø
Mutterform|Nut shape
Sechskant|Hexagonal
Rund|Round
Muttermaß über Ecken / Ø|Nut across corners / Ø
Schraubenkopf|Screw head
Ohne Kopf|No head
Zylinderkopf|Cylindrical head
Kopfmaß über Ecken / Ø|Head across corners / Ø
Kopfhöhe|Head height
Seiten|Sides
Oberer Ø|Top Ø
Wandstärke|Wall thickness
Ringprofil-Ø|Ring profile Ø
Spitzen|Points
Innen-/Außenradius|Inner/outer radius
Senkung Ø|Countersink Ø
Senkungswinkel|Countersink angle
Bohrungslänge|Bore length
Bodenstärke|Floor thickness
Äußerer Eckradius|Outer corner radius
Quader|Box
Zylinder|Cylinder
Kugel|Sphere
Kegel|Cone
Dach|Roof
Keil|Wedge
Pyramide|Pyramid
Rohr|Tube
Ring|Ring
Kapsel|Capsule
Stern|Star
Herz|Heart
Zahnrad|Gear
Rundquader|Rounded box
Halbkugel|Hemisphere
Gewinde|Thread
Gewindemutter|Threaded nut
Senkbohrung|Countersink
Gehäuse|Housing
Dreieck|Triangle
Parameter in Millimetern. 0 setzt den Übergang auf scharf. Radius und Fase bleiben bei einer Größenänderung erhalten, soweit sie geometrisch passen.|Parameters in millimetres. 0 creates sharp edges. Fillets and chamfers retain their size when the shape is resized, where geometry allows.
Offene Schachtel mit definierter Wand und Boden. Innenradius = Außenradius minus Wandstärke, mindestens 0.|Open box with defined walls and floor. Inner radius = outer radius minus wall thickness, at least 0.
Ringprofil-Ø in X/Y. Der Profilparameter setzt auch die Höhe neu; eine anschließend geänderte Z-Höhe macht den Querschnitt elliptisch.|Ring profile Ø in X/Y. This parameter also sets the height; resizing Z afterwards creates an elliptical section.
Ursprung setzen|Set origin
Linealursprung numerisch bearbeiten|Edit ruler origin numerically
Lineal: Ursprung auf Fläche oder Arbeitsebene anklicken|Ruler: click a face or workplane to set the origin
Linealursprung|Ruler origin
Linealbezug|Ruler reference
Kante / Minimum|Edge / minimum
Mittelpunkt|Centre
Ursprung übernehmen|Apply origin
Formen anordnen|Arrange shapes
Muster|Pattern
Lineare Reihe|Linear array
Lochkreis / Kreismuster|Bolt circle / circular array
Rechteckiges Raster|Rectangular array
Anzahl einschließlich Original|Count including original
Abstand zwischen Kopien · mm|Spacing between copies · mm
Drehachse|Rotation axis
Z · Arbeitsfläche|Z · workspace
Kreismittelpunkt · mm|Circle centre · mm
Radius (mm)|Radius (mm)
Startwinkel (Grad)|Start angle (degrees)
Winkelbereich (Grad)|Angle range (degrees)
Formen mitdrehen|Rotate shapes
Zeilen|Rows
Zeilenabstand Y (mm)|Row spacing Y (mm)
Anordnung erstellen|Create array
Das Original wird an die erste Kreisposition gesetzt. 360° verteilt ohne doppelte Endposition; Teilkreise schließen beide Enden ein.|The original moves to the first circle position. 360° avoids duplicate endpoints; partial circles include both endpoints.
Anzahl oben = Spalten; X-Abstand aus der linearen Reihe. Original ist links unten.|Count above = columns; X spacing comes from the linear array. The original is at the bottom left.
Modell exportieren|Export model
Umfang|Scope
Alle sichtbaren Körper|All visible solids
Nur ausgewählte Körper|Selected solids only
STL exportieren|Export STL
Export für Slicer und andere 3D-Programme. Die Maße werden in Millimetern ausgegeben.|Export for slicers and other 3D programs. Dimensions are in millimetres.
Lose Lochformen werden nicht exportiert. Zum Ausschneiden Körper und Loch vorher gruppieren.|Ungrouped hole shapes are not exported. Group solids and holes to cut material.
Neues Projekt|New project
Das aktuelle Modell wird geleert. Mit Strg+Z kannst du zurückkehren.|This clears the current model. Ctrl+Z restores it.
Das Beispiel ersetzt das aktuelle Modell. Du kannst mit Strg+Z zurückkehren.|The example replaces the current model. Ctrl+Z restores it.
Projekt geöffnet.|Project opened.
Projektdatei erstellt. Gruppen, Lochformen und Maße bleiben erhalten.|Project file created. Groups, holes and dimensions are preserved.
Dein letztes lokales Modell wurde wiederhergestellt.|Your last local model was restored.
Die Autosicherung konnte nicht geladen werden. Projektdatei über Öffnen laden.|Autosave could not be restored. Use Open to load a project file.
Wähle mindestens einen Körper aus.|Select at least one solid.
Die Operation ergibt keinen Körper.|This operation produces no solid.
Die Operation konnte nicht ausgeführt werden.|The operation could not be completed.
Bitte einen Namen eingeben.|Please enter a name.
Eine entsperrte Form mit gültiger Modellhistorie auswählen.|Select an unlocked shape with valid model history.
Der Parameter liegt außerhalb des zulässigen Bereichs.|The parameter is outside the allowed range.
Die Parameter ergeben keinen gültigen Körper.|These parameters do not produce a valid solid.
Bitte ein Maß von 0,01 bis 10000 mm eingeben.|Enter a dimension between 0.01 and 10000 mm.
Die proportionalen Maße liegen außerhalb von 0,01 bis 10000 mm.|Proportional dimensions must be between 0.01 and 10000 mm.
Bitte einen gültigen Wert eingeben (Größe 0,01 bis 10000 mm).|Enter a valid value (size 0.01 to 10000 mm).
Ungültige oder nicht unterstützte Formnaro-Projektdatei.|Invalid or unsupported Formnaro project file.
Einstellungen|Settings
⚙ Einstellungen|⚙ Settings
Allgemein|General
Modellieren|Modeling
Sprache|Language
Darstellung|Appearance
Hell|Light
Dunkel|Dark
Wie Windows|Follow Windows
Automatisch lokal sichern|Autosave locally
Zoom-Geschwindigkeit|Zoom speed
Einstellungen gelten für dieses Programm und bleiben nach einem Neustart erhalten.|Settings apply to this program and are retained after restarting.
Rasterfang|Grid snapping
Drehfang|Rotation snapping
Griffgröße|Handle size
Qualität neuer Formen|Quality of new shapes
Raster und Arbeitsebene anzeigen|Show grid and workplane
Neue Standardqualität gilt nur für neu hinzugefügte Formen. Vorhandene Modelle behalten ihre Qualität.|Default quality applies only to new shapes. Existing models keep their quality.
Lokale Formen- und Vorlagenpakete hinzufügen. Geladene Formen erscheinen links in der Bibliothek; ihre Modelle funktionieren auch ohne installiertes Paket.|Add local shape and template packs. Loaded shapes appear in the library; their models also work without the pack installed.
Noch keine Formenpakete geladen.|No shape packs loaded yet.
Formenpaket laden …|Load shape pack …
Beispielpaket speichern|Save example pack
Plugin aktivieren|Enable plugin
Standardwerte|Defaults
OfflineCAD-Plugin, Format 1 · JSON/.ocplugin · bis zu 20 Pakete. Eigene Pakete können native Grundformen, Formparameter und Körper-/Lochgruppen kombinieren.|OfflineCAD-Plugin, format 1 · JSON/.ocplugin · up to 20 packs. Custom packs combine native shapes, parameters and solid/hole groups.
Ungültiges Formnaro-Formenpaket (Format 1).|Invalid Formnaro shape pack (format 1).
Das Formenpaket enthält ungültige Angaben.|The shape pack contains invalid entries.
Ungültige oder doppelte Formvorlage im Paket.|Invalid or duplicate shape template in pack.
Eine Formvorlage enthält ungültige Geometrieparameter.|A template contains invalid geometry parameters.
Eine gruppierte Formvorlage benötigt mindestens einen Körper.|A grouped template requires at least one solid.
Formenpakete dürfen höchstens 5 MB groß sein.|Shape packs must not exceed 5 MB.
Maximal 20 Formenpakete können geladen werden.|Up to 20 shape packs can be loaded.
Ungültige Programmeinstellungen.|Invalid program settings.
Programmeinstellungen liegen außerhalb des zulässigen Bereichs.|Program settings are outside the allowed range.
Unbenanntes Modell|Untitled model
Modell|Model
Keine sichtbaren Formen|No visible shapes
Breite|Width
Tiefe|Depth
Höhe|Height
Größe|Size
Verschieben|Move
Drehen|Rotate
Auf Arbeitsebene absetzen (D)|Drop to workplane (D)
Rückgängig (Strg+Z)|Undo (Ctrl+Z)
Wiederholen (Strg+Y)|Redo (Ctrl+Y)
Duplizieren (Strg+D)|Duplicate (Ctrl+D)
Entfernen (Entf)|Delete (Del)
Gruppieren / vereinigen (Strg+G)|Group / union (Ctrl+G)
Gruppe auflösen (Strg+Umschalt+G)|Ungroup (Ctrl+Shift+G)
Ausrichten (L)|Align (L)
Spiegeln (M)|Mirror (M)
Modell einpassen (F)|Fit model (F)
Arbeitsebene: Fläche anklicken · Escape bricht ab|Workplane: click a face · Escape cancels
Bezugspunkt im gewählten Koordinatensystem (Millimeter). Die Objekte bleiben dabei an ihrer Position.|Reference point in the selected coordinate system (millimetres). Objects keep their positions.
Maße und Position einzeln bearbeiten. Farbe und Körpertyp gelten für die Auswahl.|Edit dimensions and positions individually. Colour and solid/hole type apply to the selection.
Importiertes Mesh|Imported mesh
Grundform|Basic shape
gesperrt|locked
Eine einzelne entsperrte Grundform auswählen.|Select one unlocked basic shape.
Mindestens zwei Formen auswählen; mindestens eine muss entsperrt sein.|Select at least two shapes; at least one must be unlocked.
Zum Ausrichten mindestens zwei Formen auswählen.|Select at least two shapes to align.
Gesperrte Formen zuerst entsperren.|Unlock locked shapes first.
Wähle eine Gruppe zum Auflösen aus.|Select a group to ungroup.
Es gibt keine sichtbaren Körper zum Exportieren.|There are no visible solids to export.
Auswahl kopiert.|Selection copied.
Der Text darf nicht leer sein.|Text cannot be empty.
Bezugsobjekt entfernt: Arbeitsebene erneut auf eine Fläche setzen.|Reference object removed: select a new workplane face.
Bezugsfläche geändert: Arbeitsebene erneut auf eine Fläche setzen.|Reference face changed: select a new workplane face.
Die Form hat keine räumliche Ausdehnung.|The shape has no three-dimensional extent.
Qualität: 3 bis 512 Segmente.|Quality: 3 to 512 segments.
Gewinde zu komplex: Qualität oder Länge verringern.|Thread too complex: reduce quality or length.
Unbekannte Form.|Unknown shape.
Die erzeugte Form überschreitet die zulässigen Abmessungen.|The generated shape exceeds the permitted dimensions.
Ungültige Form in der Modellhistorie.|Invalid shape in model history.
Diese alte Gruppe hat keine überprüfbare Modellhistorie.|This legacy group has no verifiable model history.
Die Modellhistorie erzeugt ein zu großes Teil. Maße oder Qualität verringern.|Model history produces an oversized part. Reduce dimensions or quality.
Das berechnete Teil liegt außerhalb des zulässigen Arbeitsbereichs.|The computed part lies outside the permitted workspace.
Die Modellhistorie unterstützt maximal 5000 Formen und 12 Gruppenebenen.|Model history supports up to 5000 shapes and 12 group levels.
Doppelte Formkennung innerhalb einer Gruppe.|Duplicate shape identifier in a group.
Die gespeicherte Bezugsfläche ist nicht mehr gültig.|The saved reference face is no longer valid.
Projektdatei ist größer als 50 MB.|Project file exceeds 50 MB.
Import ist auf 30 MB je Datei begrenzt.|Import is limited to 30 MB per file.
Unterstützte Formate: STL, OBJ und SVG.|Supported formats: STL, OBJ and SVG.
Leeres oder zu großes Mesh.|Empty or oversized mesh.
Geschlossenes Mesh importiert. Dateikoordinaten werden als Millimeter verwendet.|Closed mesh imported. File coordinates are interpreted as millimetres.
Start fehlgeschlagen. Bitte die Anwendung neu starten.|Startup failed. Please restart the application.
So funktioniert Formnaro|How Formnaro works
Auswählen / Mehrfachauswahl|Select / multi-select
Linksklick / Umschalt+Klick|Left click / Shift+click
Auswahlrahmen|Selection box
Leere Fläche links ziehen|Left drag on empty space
Ansicht drehen / verschieben|Orbit / pan
Rechts ziehen / Mittlere Taste ziehen|Right drag / Middle drag
Zoom / Modell einpassen|Zoom / fit model
Mausrad / F|Mouse wheel / F
Verschieben / Größe / Drehen|Move / scale / rotate
Werkzeug oben rechts / T, S, R|Top-right tool / T, S, R
Duplizieren mit Wiederholung|Duplicate and repeat
Gruppieren / Auflösen|Group / ungroup
Körper / Loch|Solid / hole
Ausrichten / Spiegeln / Absetzen|Align / mirror / drop
Alles auswählen / Entfernen|Select all / delete
Rückgängig / Wiederholen|Undo / redo
Speichern / Öffnen|Save / open
Kopieren / Einfügen|Copy / paste
Löcher:|Holes:
Lineal und Muster:|Ruler and arrays:
Formparameter:|Shape parameters:
Arbeitsebene:|Workplane:
Formen links anklicken oder auf die Arbeitsfläche ziehen. Einheiten: Millimeter. Alle Berechnungen laufen auf deinem Computer.|Click shapes on the left or drag them onto the workspace. Units: millimetres. All calculations run on your computer.
Griffe arbeiten beim Verschieben entlang der Arbeitsebene oder Weltachsen. Drehen und Skalieren verändern die lokalen Formachsen vor der Gruppenskalierung.|Move handles use workplane or world axes. Rotate and scale change the shape's local axes before group scaling.
Formen und Vorlagen|Shapes and templates
Gruppenbearbeitung|Group editing
Modellhistorie · Quellen mit Griffen bearbeiten|Model history · edit sources with handles
Einstellungen können während einer Griffbewegung nicht geöffnet werden.|Settings cannot be opened during a handle drag.
Maße und XYZ-Position gelten im lokalen System der übergeordneten Gruppe vor deren Skalierung. Orange zeigt die Ausgangsform. Verschieben, Drehen und Größe oben rechts wählen und die Griffe auf der Fläche ziehen.|Dimensions and XYZ positions use the parent group's local coordinates before scaling. Orange shows the original shape. Choose Move, Rotate or Scale at the top right and drag the on-canvas handles.
Escape hat die Griffbewegung verworfen.|Escape cancelled the handle drag.

Weitere Parameter|More parameters
☰ Formen|☰ Shapes
☷ Eigenschaften|☷ Properties
Fertige Gruppe · Weltgrenzen|Finished group · world bounds
Lokale Formachsen · mm|Local shape axes · mm
Quelle · lokal · mm|Source · local · mm
Elterngruppe · lokal · mm|Parent group · local · mm
Weltachsen · Mittelpunkt · mm|World axes · centre · mm
↔ Messen|↔ Measure
Wanddickenkarte|Wall thickness map
Ansicht & Prüfen|View & Inspect
Ansichten|Views
Schnittansicht|Section view
Modell prüfen|Inspect model
Vorlagen|Templates
☆ Favoriten|☆ Favorites
Persönliche Vorlagen|Personal templates
Auswahl speichern|Save selection
Bibliothek importieren|Import library
Bibliothek exportieren|Export library
Vorlage bearbeiten|Edit template
Vorlage speichern|Save template
Vorlagenmaße|Template dimensions
+ Maßparameter|+ Dimension parameter
Parametername|Parameter name
Standardmaß|Default dimension
Gesteuertes Maß|Linked dimension
Maßformel|Dimension formula
Deckkraft (%)|Opacity (%)
Quellenfarben erhalten|Keep source colors
Modellnotiz|Model note
Schrift|Font
Abstand (mm)|Distance (mm)
Zweipunktabstand|Point-to-point distance
Neue Punkte|New points
Schließen|Close
Achse|Axis
Schnitthöhe (mm)|Section offset (mm)
Gegenüberliegende Seite|Opposite side
Schnitt aus|Section off
Anzeigen|Show
Mindestwand (mm)|Minimum wall (mm)
Prüfung starten|Start inspection
Importgröße|Import size
Einheit|Unit
Millimeter|Millimetres
Zentimeter|Centimetres
Zoll|Inches
Zielbreite (mm; 0 = Original)|Target width (mm; 0 = original)
SVG-Höhe (mm)|SVG height (mm)
Importieren|Import
Passungsvorlagen …|Fit presets …
Passungsvorlagen|Fit presets
Radiales Spiel (mm)|Radial clearance (mm)
Auf Form anwenden|Apply to shape
Bündeln|Bundle
Teile bündeln|Bundle parts
Berechnung abgebrochen. Das Modell bleibt erhalten.|Calculation cancelled. The model is preserved.
Diese Aktion betrifft ganze Teile. Zuerst „Zur fertigen Gruppe“ wählen.|This action affects complete parts. Choose “Back to finished group” first.
Kopieren betrifft ganze Teile. Zuerst „Zur fertigen Gruppe“ wählen.|Copy affects complete parts. Choose “Back to finished group” first.
Einfügen betrifft ganze Teile. Zuerst „Zur fertigen Gruppe“ wählen.|Paste affects complete parts. Choose “Back to finished group” first.
Kanten …|Edges …
Kanten ...|Edges ...
Passung …|Fit …
Passung ...|Fit ...
Abbrechen|Cancel
Vorlagenname|Preset name
CAD-Kanten|CAD edges
Kantenvorschau|Edge preview
Beim Ziehen aus der Formenbibliothek werden neue Formen am Loslasspunkt auf der getroffenen Körperfläche aufgesetzt und ausgerichtet. Ohne Flächentreffer oder bei einem Bibliotheksklick gilt die Arbeitsebene. Vorhandene Formen werden beim Verschieben nicht automatisch aufgesetzt.|When dragging from the shape library, new shapes sit on and align to the solid face under the drop point. Dropping over empty space or clicking a library shape uses the workplane. Moving existing shapes does not automatically place them on surfaces.
Kanten bearbeiten|Edit edges
🧲 Magnet|🧲 Magnet
Ausgewähltes Teil mit Magnet auf eine Körperfläche ziehen|Drag the selected part onto a solid face with the magnet
Magnet: markiertes Teil auf eine Körperfläche ziehen · Escape bricht ab|Magnet: drag the marked part onto a solid face · Escape cancels
Magnet: loslassen zum Aufsetzen · Escape bricht ab|Magnet: release to place · Escape cancels
Magnet: keine Körperfläche getroffen · auf eine Fläche ziehen|Magnet: no solid face found · drag onto a face
Modell geändert. Magnet erneut aktivieren.|Model changed. Activate the magnet again.
Keine Körperfläche getroffen. Platzierung verworfen.|No solid face found. Placement discarded.
Teil mit Magnet aufgesetzt.|Part placed with magnet.
Für den Magnet zuerst „Zur fertigen Gruppe“ wählen.|Choose “Back to finished group” before using the magnet.
Kanten anklicken oder mit gedrückter linker Maustaste einen Rahmen ziehen.|Click edges or hold the left mouse button and drag a selection rectangle.
Rahmen: ersetzt die Auswahl. Umschalt: hinzufügen. Alt: entfernen. Vollständig eingeschlossene Kanten werden ausgewählt, auch auf der Rückseite. Maximal 128 Kanten.|Rectangle: replaces selection. Shift: add. Alt: remove. Fully enclosed edges are selected, including edges on the back. Maximum 128 edges.
Fase|Chamfer
Radius|Radius
Radius / Fasenmaß (mm)|Radius / chamfer size (mm)
Bei bereits bearbeiteten Gruppen gilt das Maß vor deren Skalierung. Quellen bleiben im Objektbaum bearbeitbar.|For finished groups, this size applies before group scaling. Sources remain editable in the object tree.
Auswahl leeren|Clear selection
Letzte Kantenoperation entfernen|Remove last edge operation
Vorschau berechnen|Compute preview
Kanten werden vorbereitet …|Preparing edges …
Kantenbearbeitung übernommen.|Edge operation applied.
Kantenbearbeitung geschlossen.|Edge editing closed.
Modell geändert. Kantenbearbeitung erneut öffnen.|Model changed. Open edge editing again.
Modell geändert: Kantenbearbeitung geschlossen.|Model changed: edge editing closed.
Genau ein entsperrtes Teil auswählen.|Select exactly one unlocked part.
Ein Teil oder eine Bohrungsquelle auswählen.|Select a part or a hole source.
Für die Kantenbearbeitung zuerst „Zur fertigen Gruppe“ wählen.|Choose “Back to finished group” before editing edges.
Für die Kantenauswahl zuerst die Schnittansicht ausschalten.|Turn off the section view before selecting edges.
Maximal 128 Kanten je Operation; einen kleineren Ausschnitt markieren.|Up to 128 edges per operation; select a smaller region.
Kanten auswählen und Radius/Fase zwischen 0,01 und 1000 mm eingeben.|Select edges and enter a radius/chamfer between 0.01 and 1000 mm.
Kantenoperation nicht möglich. Radius/Fase verkleinern oder Kanten einzeln bearbeiten.|Edge operation is not possible. Reduce the radius/chamfer or edit edges individually.
Eine bearbeitete Kante ist nach der Quellenänderung nicht mehr eindeutig vorhanden. Kantenoperation entfernen und neu auswählen.|An edited edge can no longer be identified after the source change. Remove the edge operation and select it again.
Passungshilfe|Fit assistance
Spiel je Seite für Zapfen/Bohrung oder Deckel/Aufnahme. Bei 0,2 mm Spiel wird eine Öffnung insgesamt 0,4 mm größer, ein Einsatz 0,4 mm kleiner.|Per-side clearance for peg/hole or lid/recess. With 0.2 mm clearance, an opening grows by 0.4 mm overall and an insert shrinks by 0.4 mm.
Bearbeitung|Adjustment
Bohrung / Aufnahme vergrößern|Enlarge hole / recess
Zapfen / Deckel verkleinern|Shrink peg / lid
Spiel je Seite (mm)|Clearance per side (mm)
Ändert die Abmessungen entlang der lokalen Formachsen. Komplexe Konturen werden dabei skaliert. Werte beziehen sich auf das gedruckte Teil, auch unter Gruppenskalierung. Eigene erprobte Druckspiele verwenden.|Changes dimensions along local shape axes. Complex contours are scaled. Values refer to the printed part, including parent group scaling. Use your own tested printing clearances.
Gespeichertes Druckspiel|Saved printing clearance
Eigener Wert|Custom value
Spiel speichern|Save clearance
Vorlage entfernen|Remove preset
Lochform als Gegenstück|Matching hole shape
Maße übernehmen|Apply dimensions
Druckspiel gespeichert.|Printing clearance saved.
Passungsmaße angewendet.|Fit dimensions applied.
Lochform mit Druckspiel erzeugt.|Hole shape with printing clearance created.
Auswahl oder Modell wurde geändert. Passung erneut öffnen.|Selection or model changed. Open fit assistance again.
Passung: 0–5 mm Spiel je Seite und mindestens eine Achse wählen.|Fit: choose 0–5 mm clearance per side and at least one axis.
Die Passung würde das Teil zu klein oder zu groß machen.|The fit would make the part too small or too large.
Unterstützte Formate: STL, OBJ, SVG und STEP/STP.|Supported formats: STL, OBJ, SVG and STEP/STP.
STL: ein fertiger Körper für 3D-Druck. 3MF: getrennte Teile mit Farben für Slicer. OBJ: Geometrie für 3D-Programme. GLTF: farbige Darstellung (Meter). SVG: Umriss in der XY-Draufsicht (Millimeter). STEP: getrennte CAD-Körper in Millimetern; STEP-Kurven bleiben bei gleichmäßiger Skalierung erhalten, Netzteile bleiben facettiert. STEP enthält keine Formnaro-Quellenhistorie oder Farbzuordnung. Bei Mehrfarbgruppen erhält die erste Quelle überlappendes Material.|STL: finished geometry for 3D printing. 3MF: separate colored parts for slicers. OBJ: geometry for 3D software. GLTF: colored display (metres). SVG: XY outline (millimetres). STEP: separate CAD solids in millimetres; STEP curves survive uniform scaling, mesh parts stay faceted. STEP includes no Formnaro source history or colors. In multicolor groups, the first source receives overlapping material.
Auswahl isolieren|Isolate selection
Auswahl isoliert|Selection isolated
Isolation beenden|End isolation
Bitte ein sichtbares Teil auswählen.|Please select a visible part.
Exportiert werden dauerhaft sichtbare Teile. Die Auswahlisolation begrenzt nur die Ansicht.|Exports include permanently visible parts. Selection isolation only limits the view.
Kein Vorschaubild|No preview image
Projektvorschau|Project preview
Auf Fläche legen|Lay on face
Eine eigene native ebene Außenfläche anklicken. Das Teil wird darauf gedreht; Maße, Spiegelung, Scherung und Quellen bleiben erhalten.|Click a native planar outer face of the part. Its pose changes while dimensions, reflection, shear and sources are retained.
Auflage|Support plane
Aktuelle Arbeitsebene|Current workplane
Grundebene Z = 0|Ground plane Z = 0
Auflagefläche auswählen.|Choose a support face.
Native Auflage wird geprüft …|Checking native support …
Native Auflage geprüft. Vorschau übernehmen oder abbrechen.|Native support verified. Apply or cancel the preview.
CAD-Teil auf die gewählte Fläche gelegt.|CAD part placed on the selected face.
Ein sichtbares entsperrtes fertiges CAD-Teil auswählen.|Select a visible unlocked finished CAD part.
Eine sichtbare eigene Auflagefläche des ausgewählten Teils anklicken.|Click a visible support face of the selected part.
Eine eindeutige native ebene Außenfläche anklicken.|Click an unambiguous native planar outer face.
Diese Fläche trägt das Teil nicht: Material würde unter der Auflage liegen.|This face cannot support the part: material would lie below the support plane.
Zuerst eine geprüfte native Auflagefläche wählen.|Choose a verified native support face first.
Die Auswahl wurde geändert.|The selection changed.
Für eine neue Auswahl „Andere Fläche wählen“ verwenden.|Use “Choose another face” to pick again.
An Bezugspunkt|Reference placement
An Bezugspunkt platzieren|Place at reference point
Bohrung erstellen|Create bore
Bohrung erstellen …|Create bore …
Native Bezugspunkte wählen und versetzen; die Drehung bleibt erhalten.|Choose native reference points and offsets; rotation is retained.
Normale Bohrung, kegelige Senkung oder Schraubenkopfaufnahme mit nativer Vorschau.|Plain bore, countersink or counterbore with native preview.
Eckpunkt|Vertex
Kantenmitte|Edge midpoint
Kreismitte|Circle center
Flächenschwerpunkt|Face centroid
Freier Flächenpunkt|Free face point
Eckpunkte|Vertices
Kantenmitten|Edge midpoints
Kreismitten|Circle centers
Flächenschwerpunkte|Face centroids
Fangziele|Snap targets
Alle|All
Neu wählen|Pick again
Bohrung|Bore
Normale Bohrung|Plain bore
Kegelige Senkung|Countersink
Schraubenkopfaufnahme|Counterbore
Bohrung Ø (mm)|Bore diameter (mm)
Durchgehend|Through
Tiefe (mm)|Depth (mm)
Kopf / Senkung Ø (mm)|Head / sink diameter (mm)
Kopftiefe (mm)|Head depth (mm)
Senkwinkel (°)|Countersink angle (°)
Passungsvorlage|Fit preset
Arbeitsebenenursprung als Ziel|Workplane origin as target
Eigenen Bezugspunkt oder freien Flächenpunkt wählen.|Choose an own reference or free face point.
Zielteil anklicken, dann seinen Bezugspunkt wählen. Die Drehung bleibt erhalten.|Click the target part, then choose its reference point. Rotation is retained.
Bezugspunktmarkierung oder freien Flächenpunkt anklicken.|Click a reference marker or a free face point.
Verdeckter Bezugspunkt. Ansicht ändern.|Occluded reference point. Change the view.
Sichtbare native CAD-Fläche wählen.|Choose a visible native CAD face.
Eigenen Bezug am ausgewählten Teil wählen.|Choose an own reference on the selected part.
Ein anderes Zielteil wählen.|Choose another target part.
Ziel: Arbeitsebenenursprung.|Target: workplane origin.
Native Vorschau wird berechnet …|Computing native preview …
Native Vorschau geprüft. Übernehmen oder abbrechen.|Native preview verified. Apply or cancel.
Native Bearbeitung übernommen.|Native edit applied.
Viele Bezugspunkte: freien Flächenpunkt anklicken.|Many reference points: click a free face point.
KI-Markierungen|AI annotations
Modellbild anhängen|Attach model image
Modellbild konnte nicht erstellt werden.|Could not capture the model image.
Sichtbare Modellstelle anklicken.|Click a visible model surface point.
Sichtbare Modellstelle anklicken. Flächenbezüge werden nativ geprüft; verlorene Hinweise bleiben als veraltet sichtbar.|Click a visible model point. Face references are checked natively; lost notes remain visible as stale.
Modellstellen mit Hinweis, Farbe und Radius markieren; Flächenbezüge nativ prüfen.|Annotate model points with a note, color and radius; check face references natively.
Hinweis|Note
Veraltet|Stale
Fläche mehrdeutig|Ambiguous face
Fläche verloren|Lost face
Normale nicht bestimmbar|Undefined normal
Noch keine Markierungen.|No annotations yet.
Native Modellstelle wird geprüft …|Checking the native model point …
Keine native Modellfläche getroffen.|No native model face was hit.
Modellstelle gewählt. Hinweis eingeben und Vorschau berechnen.|Point selected. Enter a note and compute the preview.
Markierung wird nativ geprüft …|Checking the annotation natively …
Geprüfte Vorschau. Das Modell bleibt unverändert.|Verified preview. The model is unchanged.
Markierung übernommen.|Annotation applied.
Hinweis ändern und Vorschau berechnen.|Change the note and compute the preview.
Zuerst eine Modellstelle oder Markierung wählen.|Choose a model point or annotation first.
Ungültige CAD-Markierung.|Invalid CAD annotation.
Eine sichtbare Stelle an einem fertigen CAD-Teil markieren.|Annotate a visible point on a completed CAD part.
Der native Flächenpunkt ist verloren oder mehrdeutig. Eindeutige Flächenstelle wählen.|The native surface point is lost or ambiguous. Choose an unambiguous surface point.
Die Markierung ist nicht mehr vorhanden.|The annotation no longer exists.
Eine sichtbare native CAD-Fläche wählen.|Choose a visible native CAD face.
Ein fertiges CAD-Teil oder keine Auswahl für alle Markierungen wählen.|Select one completed CAD part, or clear the selection for all annotations.
`.trim().split('\n').map(line=>line.split('|'));
pairs.push(
  ['Bedienmodus','Workspace mode'],['Normal','Normal'],['Bearbeiten','Edit'],
  ['Anordnen','Arrange'],['CAD-Werkzeuge','CAD tools'],['Netz-Werkzeuge','Mesh tools'],
  ['Umwandeln','Convert'],['Extras','Extras'],['Weitere','More'],['Weitere Werkzeuge','More tools'],
  ['Unbekannter Bedienmodus.','Unknown workspace mode.'],
  ['Ziehe eine Form von rechts auf die Arbeitsfläche oder klicke auf einen Grundkörper.','Drag a shape from the right onto the workplane or click a basic shape.']
);
pairs.push(['Alle Werkzeuge und Bereiche anpassen','Customize all tools and sections'],['Werkzeug','Tool'],['Bereich','Area'],['Dateileiste oben','Top file bar'],['Werkzeugleiste','Toolbar'],['← Früher','← Earlier'],['Später →','Later →'],['Werkzeug anzeigen','Show tool'],['Formen oben','Shapes first'],['Objekte oben','Objects first'],['Form bearbeiten oben','Object properties first'],['Arbeitsfläche oben','Workplane first']);
pairs.push(['Arbeitsbereich','Workspace'],['Netz','Mesh'],['Nur CAD-Teile bearbeiten und neue CAD-Formen erstellen.','Edit only CAD parts and create new CAD shapes.'],['Nur Netzteile bearbeiten und neue Netzformen erstellen.','Edit only mesh parts and create new mesh shapes.'],['Diese Datei im CAD-Bereich importieren.','Import this file in the CAD workspace.'],['Diese Datei im Netz-Bereich importieren.','Import this file in the mesh workspace.'],['Sichtbare Netzteile','Visible mesh parts'],['Sichtbare CAD-Teile','Visible CAD parts'],['Exportiert nur die sichtbaren Netzteile dieses Arbeitsbereichs.','Exports only the visible mesh parts in this workspace.'],['Exportiert nur die sichtbaren CAD-Teile dieses Arbeitsbereichs.','Exports only the visible CAD parts in this workspace.'],['Zum Einfügen in den passenden CAD- oder Netz-Bereich wechseln.','Switch to the matching CAD or mesh workspace to paste.']);
const EN=Object.fromEntries(pairs);
export function translateText(text,language){
  if(language!=='en')return text;const trimmed=text.trim();let result=EN[trimmed];
  if(result===undefined){
    const rules=[[/^Unbekanntes Maß: (.*)$/,(_,v)=>'Unknown dimension: '+v],[/^Zyklische Maßbeziehung: (.*)$/,(_,v)=>'Cyclic dimension relationship: '+v],[/^(width|depth|diameter|height): Maß muss zwischen 0,01 und 10000 mm liegen\.$/,(_,v)=>v+': dimension must be between 0.01 and 10000 mm.'],[/^CAD-Autosicherung konnte nicht geladen werden; automatische Sicherung bleibt gesperrt: (.*)$/s,(_,v)=>'CAD recovery could not be loaded; automatic saving remains disabled: '+translateText(v,language)],[/^Gewählt: (.*?)\. Versätze einstellen und Vorschau berechnen\.$/,(_,v)=>'Selected: '+translateText(v,language)+'. Set offsets and compute a preview.'],[/^Layoutdatei konnte nicht gelesen werden: (.*)$/s,(_,v)=>'Layout file could not be read: '+v],[/^(CAD-Kanten|Kantenvorschau)( · .*| …)$/,(_,v,suffix)=>EN[v]+suffix],[/^(\d+) von (\d+) Kanten ausgewählt$/,(_,n,total)=>n+' of '+total+' edges selected'],[/^Vorher: (.*) · Nachher: (.*)$/,(_,before,after)=>'Before: '+before+' · After: '+after],[/^((?:\d+\. (?:Radius|Fase) [\d,.]+ mm)(?: · \d+\. (?:Radius|Fase) [\d,.]+ mm)*)$/,(_,v)=>v.replaceAll('Fase','Chamfer')],[/^Aktiv: (.*)$/s,(_,v)=>'Active: '+v],[/^Arbeitsfläche (.*)$/s,(_,v)=>'Workspace '+v],[/^Auswahl: (.*) · Unterkante Z (.*)$/s,(_,v,z)=>'Selection: '+v+' · Bottom Z '+z],[/^(?:Feste Referenz|Referenz): (.*)$/s,(_,v)=>'Reference: '+v],[/^Ursprung (.*)$/s,(_,v)=>'Origin '+v],[/^Gruppe aus (\d+) Formen(.*)$/s,(_,v,x)=>'Group of '+v+' shapes'+translateText(x,language)],[/^(\d+) Formen ausgewählt$/,(_,v)=>v+' shapes selected'],[/^([UVNXYZ]): (Minimum|Mitte|Maximum) ausrichten$/,(_,a,v)=>a+': align '+(v==='Mitte'?'centre':v.toLowerCase())],[/^([UVNXYZ]) · Abstand$/,(_,v)=>v+' · Distance'],[/^Linealabstand ([UVNXYZ])$/,(_,v)=>'Ruler distance '+v],[/^Linealursprung ([UVNXYZ])$/,(_,v)=>'Ruler origin '+v],[/^(Breite|Tiefe|Höhe) direkt am Modell$/,(_,v)=>EN[v]+' on model'],[/^(Größe|Position|Drehung) ([XYZ])$/,(_,v,a)=>EN[v]+' '+a],[/^(.*) hinzufügen$/,(_,v)=>'Add '+translateText(v,language)],[/^(Körper|Loch) in der Modellhistorie bearbeiten$/,(_,v)=>'Edit '+EN[v].toLowerCase()+' in model history'],[/^(.*?) (\((?:mm|°)\))$/,(_,v,u)=>translateText(v,language)+' '+u]];
    for(const [regex,replace]of rules){if(regex.test(trimmed)){result=trimmed.replace(regex,replace);break;}}
    if(result===undefined&&trimmed.startsWith('Teilkreis Ø '))result=trimmed.replace('Teilkreis Ø ','Pitch Ø ').replace('Kopfkreis Ø ','Tip Ø ').replace('Fußkreis Ø ','Root Ø ').replace('Evolventenflanken; Fußübergang vereinfacht, ohne Wälzfräs-Unterschnitt. Modul gilt bei Originalgröße.','Involute flanks; simplified root transition, no generated undercut. Module applies at original size.');
    if(result===undefined&&trimmed.startsWith('Leitweg '))result=trimmed.replace('Leitweg ','Lead ').replace('mm/Umdrehung','mm/revolution').replace('Profiltiefe','Profile depth').replace('Passungsspiel wirkt radial: außen kleiner, innen größer. Annäherung mit flacher Profilwurzel; keine ISO-Toleranzklasse. Gewindemaße gelten bei Originalgröße.','Clearance is radial: external smaller, internal larger. Approximation with flat roots; no ISO tolerance class. Thread dimensions apply at original size.');
    if(result===undefined&&trimmed.startsWith('Als Lochform mit dem Zielkörper gruppieren. Senktiefe '))result=trimmed.replace('Als Lochform mit dem Zielkörper gruppieren. Senktiefe ','Group as a hole with the target solid. Countersink depth ').replace('; Senkung an der Oberseite.','; countersink on top.');
    if(result!==undefined)result=result.replace(' Aktuell skaliert: „Originalgröße“ stellt die berechneten Maße wieder her.',' Currently scaled: “Original size” restores the calculated dimensions.');
    if(result===undefined&&/^[-\d,.]+ bis [-\d,.]+(?: mm|°)?$/.test(trimmed))result=trimmed.replace(' bis ',' to ');
    if(result===undefined&&trimmed.startsWith(' · '))result=' · '+translateText(trimmed.slice(3),language);
    if(result===undefined&&trimmed.startsWith('Strg+'))result=trimmed.replaceAll('Strg','Ctrl').replaceAll('Umschalt','Shift');
  }
  return result===undefined?text:text.replace(trimmed,result);
}
export function createLocalization(getLanguage){
  const texts=new WeakMap(),attributes=new WeakMap();let scheduled=false;
  function excluded(element){return element?.closest('[data-no-translate],.object-label,#history-path,script,style,svg');}
  function refresh(){scheduled=false;const language=getLanguage();document.documentElement.lang=language;
    const walker=document.createTreeWalker(document,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){if(excluded(node.parentElement)||!node.nodeValue.trim())continue;const old=texts.get(node),source=old&&node.nodeValue===old.last?old.source:node.nodeValue,last=translateText(source,language);texts.set(node,{source,last});if(node.nodeValue!==last)node.nodeValue=last;}
    for(const element of document.querySelectorAll('[title],[aria-label],[placeholder]')){if(excluded(element))continue;const state=attributes.get(element)||{};for(const name of ['title','aria-label','placeholder']){if(!element.hasAttribute(name))continue;const value=element.getAttribute(name),old=state[name],source=old&&value===old.last?old.source:value,last=translateText(source,language);state[name]={source,last};if(value!==last)element.setAttribute(name,last);}attributes.set(element,state);}
  }
  new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});
  return {refresh,t:text=>translateText(text,getLanguage())};
}
