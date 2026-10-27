# Formnaro CAD 0.17.0 – Paket 5

## Einen Körper teilen

Ein fertiges, sichtbares und entsperrtes CAD-Teil auswählen. „Mit Ebene teilen“
in der Werkzeugleiste oder „Körper mit Ebene teilen“ unter Funktionen öffnen.
Welt X, Y oder Z verwendet den Abstand vom Weltursprung entlang der gewählten
Achse. „Arbeitsebene“ verwendet einen Versatz von der aktuellen Arbeitsebene.
„Eigene Normale“ erlaubt drei Richtungskomponenten und einen Abstand vom
Weltursprung. Die Richtung wird normiert; Abstände sind physische Millimeter.

„Vorschau berechnen“ erzeugt beide geschlossenen Seiten im nativen CAD-Kern.
Orange kennzeichnet die positive, Blau die negative Seite. Der Anzeigeabstand
trennt sie ausschließlich im Bild. Seine Änderung verschiebt vorhandene
Vorschauflächen ohne neue CAD-Berechnung oder neue GPU-Geometrie.

„Beide Seiten übernehmen“ ersetzt das Original durch beide Ergebnisse in der
ursprünglichen Lage und erzeugt genau einen Undo-Schritt. Anzeigeabstand wird
weder in die Modelllage übernommen noch gespeichert. Abbrechen, Escape,
Auswahlwechsel und veraltete Vorschauen erhalten Modell und Historie. Laufende
Berechnungen lassen sich durch Beenden des CAD-Workers tatsächlich abbrechen.

## Quellen und Lage bleiben erhalten

Jede Seite erhält eine unabhängige Kopie der vollständigen Originalquellen mit
neuen Quellenkennungen sowie ein natives Teilungsrezept. Die ursprüngliche
affine Matrix wird zum Bezug der neuen Seite; die Originalquelle liegt darin
ohne zusätzliche Transformation. Damit bleiben Weltlage, Drehung, Spiegelung,
ungleichmäßige Skalierung und Scherung erhalten. Untergeordnete Quellen,
Formparameter, BRep-Daten, Farben, Sperren und unbeteiligte Teile bleiben erhalten.
Auch negative CAD-Körper behalten ihren Lochstatus.

Im Quellenbaum lässt sich die Originalquelle einer Seite öffnen und bearbeiten.
Die betreffende Seite wird daraus erneut berechnet; die andere Kopie bleibt
unverändert. Die Eigenschaften zeigen Ebenenseite und lokale Ebene. Bewegen
oder Drehen einer Seite bewegt ihre gespeicherte Ebene und ihre Quellen mit.
Duplikate und Bibliotheksvorlagen behalten das Rezept und erhalten eigene IDs.
Neue Schnittkanten können mit den vorhandenen nativen Kantenwerkzeugen
weiterbearbeitet werden.

Ein abgeleitetes Teil lässt sich nicht gewöhnlich auflösen: Das würde die
vollständige Originalgeometrie zurückbringen. Eine am Original befestigte
Arbeitsebene bleibt verbunden, wenn genau eine Seite ihren Bezug nativ besitzt.
Bei einem mehrdeutigen Bezug auf der Schnittnaht bleibt sie in ihrer Weltlage
gelöst. Unbeteiligte Arbeitsebenen werden erhalten.

## Native Prüfung und Dateiformat

Die Teilung verwendet den vorhandenen OCCT-Splitter mit einer echten CAD-Ebene.
Neue native Volumenkörper, geschlossene Topologie, eindeutige Seitenzuordnung
und Materialerhalt werden geprüft. Tangenten, außerhalb liegende Ebenen und
Schnitte ausschließlich durch Materiallücken werden abgewiesen. Hohlräume
bleiben Bestandteil der zugehörigen Körper. Anzeige-Dreiecke entscheiden
weder die Teilung noch ihre Genauigkeit.

Teilungsrezepte benötigen CAD-Dateiformat 7. Gewöhnliche Projekte bleiben 5;
CAD 5 wird weiterhin gelesen, Netz 6 bleibt getrennt. Die in Paket 4 eingeführten
CAD-7-Sicherungen und Bibliotheksbestände werden weiterverwendet.

## Lokale KI und Abnahme

API 1 und die MCP-Werkzeugnamen bleiben erhalten. `split` adressiert einen
fertigen CAD-Körper; `asPositive` und `asNegative` geben getrennte Ergebnis-Aliase.
Das Szenenformat liefert das lokale Rezept und seine aktuelle Weltebene.
Vorschau gegen die aktuelle Revision, Prüfung und Übernahme bleiben verpflichtend.

Die Abnahme umfasst native Grundformen, STEP-Eingänge, Gruppen und innere
Hohlräume, volle affine Lage, native Volumen und STEP-Rundläufe. Echte Maus-
und Tastaturbedienung prüft beide Vorschauseiten, rein optischen Abstand mit
wiederverwendeter GPU-Geometrie, Quellenbearbeitung, Bibliothek, Sperren,
Undo/Redo, Neuöffnen und Worker-Abbruch. Auch die gepackte EXE wird geprüft.
Portable Ausgabe, passende Anwendungs-/Konverter-/CAD-Kernquellen, Lizenzen und
Prüfnachweise sind beigelegt. Die vorhandene Installation wird nicht ersetzt.
