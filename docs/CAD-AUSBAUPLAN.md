> Historische Referenz. Aktueller Folgeauftrag ab 26.10.2026: [Ausbauplan ab 0.106](AUSBAUPLAN-AB-0.106.md). Die damaligen Pakete sind abgeschlossen; die zusätzliche Druckprüfung bleibt gestrichen.

# Die restlichen CAD-Funktionen ergänzen und die Geschwindigkeit erhalten

## Ziel und feste Entscheidungen

Ausgangspunkt ist die geprüfte Formnaro-Version **0.81.0**. Ergänzt werden die sechs offenen Bereiche: technische Zeichnungen, projektweite Parameter und Varianten, verknüpfte Konturen, Skizzenbedingungen, Gelenke und echtes selektives Laden großer Baugruppen.

Die bisherigen Geometriegrenzen von Flächenversatz, Shell, Loft und Sweep bleiben zunächst bestehen.

Festgelegt ist:

- Verknüpfte Änderungen werden **gesammelt per Knopfdruck** berechnet.
- Skizzenbedingungen werden **beim Loslassen** gelöst; während des Ziehens bleibt eine leichte Vorschau.
- Veraltete verknüpfte Ergebnisse müssen vor ihrem Export aktualisiert werden.
- Zeichnungen erhalten **PDF-, SVG- und DXF-Ausgabe**.
- Jedes Paket erhält eine eigene geprüfte portable Ausgabe, bevor das nächste beginnt.
- Alles bleibt lokal. Bestehende Genauigkeitsvorgaben, Originalquellen und ältere Ausgaben bleiben erhalten.

## Abgenommener Stand am 25.10.2026

Pakete **1–7 sind vollständig abgeschlossen** (0.82–0.88), einschließlich eigener portabler Ausgaben und vollständiger Abnahmen. **Planpunkt 9 ist mit Paket 7 vollständig erfüllt.** Die neueste Ausgabe ist 0.88.0 mit dem eigenständigen indexierten Geometriepaket `.fnpack`.

Paket 4 (0.85): 547 Kernprüfungen und je 650 Bedienprüfpunkte an Quelle und EXE. Paket 5 (0.86): 582 und je 671. Paket 6 (0.87): 596 und je 689. Paket 7 (0.88): 621 und je 717, mit 20 Abschlussprüfbereichen und 1.063 Belegen. Alle Ausgaben besitzen unabhängige Exportleser, vollständige Leistungsvergleiche, geprüfte Quellarchive sowie Sicht- und Auslieferungsbelege. Frühere Ausgaben und nicht abgenommene Prüfläufe bleiben erhalten.

## Umsetzung in sieben Paketen

### 1. Technische Zeichnungsblätter

**Funktionsumfang:** A4/A3, Hoch-/Querformat, Maßstab, Titelblock, Vorder-/Seiten-/Draufsicht und Schnittansichten. Dazu ausgewählte Längen-, Winkel-, Radius- und Durchmessermaße sowie Beschriftungen.

Die vorhandene native CAD-Projektion und Schnittberechnung liefern gemeinsame 2D-Kurvendaten für alle Ausgabeformate. PDF entsteht lokal über Electron; SVG bleibt eine Vektorausgabe. DXF wird als ASCII-DXF für AutoCAD 2000 ausgegeben, mit Modellgeometrie **1:1 in Millimetern**, unabhängig vom Papiermaßstab. Grundlage ist die [offizielle DXF-Referenz](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm).

**Geschwindigkeitsschutz:** Projektionen entstehen ausschließlich über „Blatt aktualisieren“. Blattzoom, Verschieben von Ansichten und Maßtexten sowie Papiermaßstab verwenden vorhandene Kurvendaten weiter. Native Berechnungen laufen abbrechbar im bestehenden CAD-Dienst; es wird keine dauerhafte zweite Kernelinstanz gestartet.

Zeichnungen verwenden zunächst native CAD-Teile. Industrielle Form- und Lagetoleranzen sowie automatische Vollbemaßung gehören nicht zu diesem Paket.

### 2. Gemeinsame Parameter, Varianten und gezielte Aktualisierung

Eine zentrale Parametertabelle steuert ausdrücklich gebundene Skizzenmaße, native Formparameter und vorhandene Modelliermaße wie Wandstärke oder Sweep-Radius. Varianten speichern alternative Werte sowie konfigurierte Sichtbarkeit und Unterdrückung.

**Umfang:** zunächst höchstens 100 Projektparameter, 500 Bindungen und 32 Varianten. Nur die aktive Variante erhält vollständig berechnete Geometrie.

Dafür entsteht ein gerichteter Abhängigkeitsgraph mit stabilen Kennungen und Zyklusprüfung. Alle Änderungen werden zunächst gesammelt und ausgewertet. „Aktualisieren“ berechnet ausschließlich betroffene Teile in Abhängigkeitsreihenfolge; „Übernehmen“ bestätigt Parameter und Geometrie gemeinsam mit einem Undo-Schritt.

**Wichtige Änderung:** Der vorhandene Vorlagenweg baut heute nach einzelnen Bindungen wiederholt das Gesamtprojekt auf. Das wird durch gesammelte Bindungen und einen gezielten Teilaufbau ersetzt. Jedes betroffene Teil wird innerhalb einer Aktualisierung höchstens einmal konstruiert.

Kamera, Auswahl, Farben und ungenutzte Parameter lösen keine Konstruktion aus. Variantenwechsel werden ausdrücklich angefordert; ein begrenzter Cache hält zuletzt verwendete Ergebnisse.

### 3. Dauerhaft verknüpfte Konturen

Die vorhandene Konturkopie bekommt eine zusätzliche Option **„Mit Ausgangsteil verknüpfen“**. Eine Änderung des Originals kennzeichnet die abgeleitete Skizze als aktualisierungsbedürftig. Erst „Aktualisieren“ übernimmt die neue Kontur in eine Vorschau.

Gespeichert werden stabile Objekt-, Quellen- und Elementbezüge sowie die zuletzt verwendete Eingangsgeometrie. Dauerhafte Flächennummern und eine automatische Zuordnung zur „nächstgelegenen ähnlichen Fläche“ sind ausgeschlossen.

Zunächst werden eindeutige Flächenrollen nativer Quader, Zylinder und Skizzenextrusionen unterstützt. Bei importierten STEP-Teilen werden unveränderte Geometrie und Lageänderungen nachvollzogen. Nach Geometrieaustausch oder mehrdeutigen Änderungen muss der Nutzer den Bezug neu wählen.

**Geschwindigkeitsschutz:** Das Paket verwendet den Abhängigkeitsgraphen aus Paket 2. Nur tatsächlich betroffene Konturen und nachgelagerte Teile werden erneuert. Zeichnungsansichten und Maßbezüge werden an dieselbe Aktualisierungsgrundlage angeschlossen.

### 4. Dauerhafte Skizzenbedingungen

Ein eigener 2D-Löser ergänzt Koinzidenz, horizontal/vertikal, parallel, rechtwinklig, gleiche Längen und Radien, konzentrisch, Symmetrie, Tangente und Fixierung. Vorhandene Maßformeln bleiben verbindliche Vorgaben und werden nicht durch berechnete Zahlen überschrieben.

Neue Beziehungen verwenden stabile Elementkennungen in **Skizzenversion 3**. Skizzenversionen 1 und 2 bleiben unverändert lesbar.

Da bisher kein Solver vorhanden ist, entsteht ein begrenztes numerisches Modul mit gedämpfter Ausgleichsrechnung und rangprüfender QR-Zerlegung. Es arbeitet in einem kleinen Worker ohne CAD- oder Mesh-Kernel.

**Geschwindigkeitsschutz:**

- Während des Ziehens wird nur die Vorschau bewegt; gelöst wird beim Loslassen oder ausdrücklichen Setzen eines Maßes.
- Nur die zusammenhängende betroffene Bedingungsgruppe wird berechnet.
- Grenze: 128 Elemente, 256 Bedingungen, höchstens 80 Iterationen beziehungsweise eine Sekunde Rechenzeit.
- Unterbestimmte Skizzen bleiben bearbeitbar. Widersprüche oder Zeitüberschreitungen erhalten den letzten gültigen Zustand und zeigen die betroffenen Bedingungen.

Erst die anschließend angeforderte CAD-Vorschau erzeugt oder verändert den 3D-Körper.

### 5. Gelenke und geführte Bewegung

Ein einfacher Baugruppenmodus ergänzt feste Verbindungen, Drehgelenke und Schiebegelenke mit Winkel- beziehungsweise Weggrenzen. Er unterstützt starre CAD- und Netzteile.

Jede verbundene Gruppe erhält eine feste Basis. Die erste Ausbaustufe verwendet einen eindeutigen Gelenkbaum ohne geschlossene Mechanikketten. Gelenkachsen werden über gespeicherte Bezugssysteme definiert.

**Geschwindigkeitsschutz:** Bewegungen verändern vorübergehend ausschließlich die Anzeigematrizen fertiger Teile. BReps, Anzeigenetze und das Gesamtprojekt werden währenddessen nicht neu aufgebaut oder vollständig kopiert. Vorhandene Spiegelungen und Scherungen bleiben erhalten.

Eine bestätigte Bewegung erzeugt einen gemeinsamen Undo-Schritt. Abgebrochene Vorschauen stellen die Ausgangslage wieder her. Kontaktprüfungen bleiben ausdrücklich angeforderte Prüfungen ausgewählter Teile; es gibt keine ständig laufende Kollisions- oder Physiksimulation. Diskrete Bewegungsprüfungen werden nicht als Nachweis vollständiger Kollisionsfreiheit ausgegeben.

### 6. Vereinfachte Baugruppenanzeige

Große Baugruppen erhalten „Nur Auswahl vollständig darstellen“, „Teil nachladen“ und „Alles darstellen“. Nicht vollständig dargestellte Komponenten erscheinen als gekennzeichnete Begrenzungsrahmen.

Das Ladeset wird getrennt von der vorhandenen Sichtbarkeit gespeichert. **Ausgeblendet** und **noch nicht vollständig dargestellt** dürfen unterschiedliche Exportfolgen nicht vermischen.

**Geschwindigkeitsschutz:** Nur benötigte Teile werden vernetzt und mit vollständigen Anzeigedaten versehen. Dieses Paket erhält zunächst weiterhin die gesamte gespeicherte CAD-Geometrie.

Paket 6 erfüllt den Anzeigeteil von Punkt 9. Die echte Geometrieauflösung wurde anschließend mit Paket 7 vollständig ergänzt.

### 7. Echtes selektives Laden und schnelles Wiederöffnen

Ein optionales, eigenständiges Projektpaket **`.fnpack`** ergänzt die bisherigen `.ocad`-Dateien. Es enthält ein kleines Manifest sowie nach Inhalt adressierte Geometrieblöcke. Wiederverwendete STEP-Geometrie wird einmal gespeichert; Instanzen behalten eigene Namen, Farben und vollständige Platzierungen.

Der Container wird indexiert gelesen. Es darf weder das gesamte Archiv entpackt noch jede BRep beim Öffnen materialisiert werden. Eine neue Sitzungsschicht trennt den Teilekatalog von den tatsächlich geladenen, nativ geprüften Teilen.

- Auswahl und Kamerabedienung können mit Katalogdaten arbeiten.
- Messung und Bearbeitung laden und prüfen zuerst die benötigte Geometrie und deren Abhängigkeiten.
- Speichern erhält ungeladene Blöcke vollständig.
- Gesamtexport löst alle dafür erforderlichen Teile auf; fehlende Teile führen zum Abbruch.
- Das Paket funktioniert nach Verschieben auf einen anderen Rechner ohne ursprüngliche STEP-Datei.

**Abgrenzung:** Der erste STEP-Lese- und Transferprozess bleibt beim vorhandenen Leser vollständig. Vermiedene Nacharbeit und Vernetzung werden getrennt gemessen; eine Beschleunigung des eigentlichen Parsens wird nicht vorausgesetzt. Mit der vollständig abgenommenen Ausgabe 0.88.0 ist Punkt 9 umgesetzt. Der erste STEP-Import bleibt bewusst vollständig; das bedarfsgerechte Wiederöffnen und Nachladen übernimmt `.fnpack`. Anleitung: [Geometriepakete](FNPACK.md), technisches Format: [FNPACK-FORMAT.md](FNPACK-FORMAT.md).

## Gemeinsame Daten- und Schnittstellenregeln

- Neue gespeicherte Funktionen erhalten streng versionierte Projekt-, Bibliotheks- und gegebenenfalls Arbeitsplatzschemas. Alte Formate 5–11 bleiben lesbar; reine Altprojekte werden nicht pauschal umgeschrieben.
- Die Aktualisierungsschnittstelle verarbeitet nur betroffene Teilmengen und liefert revisionsgebundene Änderungen zurück. Unbeteiligte bestätigte Geometrie wird weiterverwendet.
- Separat geänderte Quellen dürfen abgeleitete Ergebnisse als **„Aktualisierung nötig“** zurücklassen. Dieser Zustand ist speicherbar; der Export betroffener Ergebnisse bleibt bis zur erfolgreichen Aktualisierung gesperrt.
- Verlorene Bezüge erfordern erneute Zuordnung oder ausdrückliches Lösen der Verknüpfung. Fehler, Abbruch und veraltete Antworten erzeugen keine Teilübernahme.
- Duplizieren und Bibliothekseinträge schreiben interne Kennungen korrekt um und erhalten benötigte Parameter und Referenzen.
- Die lokale KI-Schnittstelle erhält dieselben Fähigkeiten mit denselben Vorschau-, Revisions- und Prüfregeln wie die Oberfläche.

## Leistungsprüfung, Abnahme und Auslieferung

**Feste Vergleichsbasis:** unveränderte Version 0.81 und zusätzlich die jeweils vorherige abgenommene Ausgabe. Messungen laufen abwechselnd und ohne parallele Tests, damit Rechnerlast nicht als Funktionsgewinn erscheint.

Pro Paket werden Auswahl, Verschieben, Drehen, Zoom, Speichern, Wiederöffnen, Vorschau und Export gemessen. Häufige kurze Vorgänge erhalten ausreichend Wiederholungen für Median und p95; langsame Kaltläufe werden gesondert ausgewiesen.

**Freigabegrenze:** Eine wiederholbare Verschlechterung von mehr als **25 % und zugleich 10 ms** bei bisherigen Abläufen verhindert die Freigabe. Die Funktion wird dann nachgebessert. Geometriegenauigkeit und Exportqualität werden dafür nicht reduziert.

Zusätzliche Abnahmefälle:

- Zehn abhängige Teile: ausschließlich diese Teile werden jeweils einmal aktualisiert.
- Parameterzyklen, widersprüchliche Bedingungen, verlorene Bezüge, gesperrte Ziele, Abbruch und Undo/Redo.
- PDF-Papiermaße, Zeichnungsmaßstab und unabhängig gelesene DXF-Geometrie.
- Gelenke an gedrehten und gespiegelten Teilen, ohne native Neubauten während der Vorschau.
- Selektiv und vollständig geladene Baugruppen liefern dieselben vollständigen Exporte; Nachladen und Cacheverdrängung verändern keine Modelle.
- Sämtliche bisherigen Kern- und Bedienprüfungen bleiben erhalten und werden paketweise erweitert.

Jede Ausgabe erhält Source- und EXE-Abnahme, unabhängige Dateiprüfungen und einen Leistungsbericht. Der Fortschrittsstand benennt danach ausdrücklich, welche ursprünglichen Punkte vollständig, teilweise oder noch nicht umgesetzt sind.
