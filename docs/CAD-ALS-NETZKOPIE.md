# CAD als bearbeitbare Netzkopie · Paket 10 · Formnaro 0.29.0

1. Einen fertigen, sichtbaren und entsperrten CAD-Körper auswählen. Bei einer
   Baugruppe die ganze Baugruppe wählen, nicht eine einzelne enthaltene Quelle.
2. **CAD → Netzkopie** in der Werkzeugleiste oder **Funktionen → CAD als
   Netzkopie** öffnen.
3. **Grob**, **Standard**, **Fein** oder eigene Werte wählen. Kleinere Werte für
   Vernetzungsziel und Winkel ergeben gewöhnlich mehr Dreiecke. Diese Qualität
   ist unabhängig von der Anzeige- und Exportqualität.
4. **Vorschau berechnen**. Mit **Vergleich** zwischen Original und Netzkopie
   wechseln. Dreieckszahl und Volumenvergleich helfen beim Beurteilen. Kleine
   Bohrungen und dünne Wände gezielt ansehen.
5. **Übernehmen** erzeugt ein zusätzliches, unabhängiges Netzteil. Erst dieser
   Schritt ändert das Projekt. Abbrechen oder Escape verwirft die Vorschau.

Die CAD-Quelle bleibt einschließlich BRep, Parametern, Quellen, Markierungen,
Farben und Sperren erhalten. Die Kopie übernimmt die vollständige Lage,
Skalierung und Scherung sowie Objektfarbe, Deckkraft, Layer und Ordner.
CAD-Quellenfarben bleiben im Original; die Kopie verwendet die Objektfarbe.
Ein gespeicherter Quellenverweis hält fest, aus welcher CAD-Geometrie und Lage
die Kopie entstanden ist. Spätere Änderungen oder das Löschen der CAD-Quelle
ändern die Netzkopie nicht automatisch.

Standardmäßig wird nach der Übernahme nur die neue Kopie angezeigt. Das ist
eine vorübergehende **Ansichtsisolation**. **Isolation beenden** zeigt auch
die CAD-Quelle und die anderen Teile wieder. Kein Original wird dafür dauerhaft
ausgeblendet. Die Option kann vor Übernehmen ausgeschaltet werden.

Die Kopie ist ein normales Netzteil: vorhandene Netz-Werkzeuge wie Teilen,
Bohrungen oder Gruppieren arbeiten nach ihrer Körperprüfung damit weiter.
Die gemeinsame Rückgängig-Funktion setzt die Erstellung beziehungsweise jede
folgende Bearbeitung einzeln zurück. Speichern und Wiederöffnen erhalten die
Kopie und ihren Quellenverweis im gemeinsamen Projektformat 8.

**Beim Export nur der Kopie „Ausgewählte Teile“ wählen.** Die Ansichtsisolation
beschränkt den Export nicht. STL/OBJ/3MF/GLB enthalten dann die ausgewählte
Netzkopie; STEP bleibt für die erhaltenen CAD-Körper vorgesehen.

Eine Netzkopie nähert die CAD-Oberfläche durch Dreiecke an. Das Vernetzungsziel
ist kein gemessener oder garantierter maximaler Oberflächenfehler. Auch ein
kleiner Volumenunterschied beweist keine maßhaltige lokale Bohrung. Extrem feine,
zu große oder nicht geschlossene Vernetzungen werden verständlich abgewiesen;
es wird weder stillschweigend vereinfacht noch repariert.

Separate Ausgabe: `release-formnaro-cad-netzkopie-v0.29.0/Formnaro-win32-x64`.
Portable ZIP: `output/Formnaro-CAD-Netzkopie-v0.29.0.zip`.
Das gesamte Archiv in einen eigenen kurzen lokalen Ordner entpacken, etwa
`C:\Formnaro029`, und `App/Formnaro.exe` starten. Persönliche Daten einer anderen
portablen Ausgabe werden dabei nicht automatisch kopiert.

Paket 10 ergänzt nur die ausdrückliche CAD-zu-Netzkopie. Die umgekehrte Übergabe
eines ausgewählten Netzes an den Konverter ist Paket 11. Neue Netzverfahren
bleiben eigene spätere Pakete; die vorhandene gemeinsame KI-Anbindung bleibt.
