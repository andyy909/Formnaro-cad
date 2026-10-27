# CAD 0.14.0: Auf Fläche legen

Paket 2 enthält die Übersichtfunktionen aus Paket 1 und ein neues natives
Auflagewerkzeug. Projektformat 5 und lokale API 1 bleiben erhalten.

## Bedienung

1. Ein sichtbares entsperrtes fertiges CAD-Teil auswählen.
2. Neben **Absetzen** auf **Auf Fläche legen** klicken.
3. **Aktuelle Arbeitsebene** oder **Grundebene Z = 0** wählen.
4. Eine eigene ebene Außenfläche des Teils anklicken.
5. Die geprüfte Vorschau ansehen und **Übernehmen** klicken. **Einpassen (F)** zeigt die vorgeschlagene Lage.

**Andere Fläche wählen** entfernt die Vorschau und erlaubt eine neue Wahl.
**Abbrechen** und Escape erhalten das Modell und die Undo-Historie. Eine
geänderte Auswahl, Modellrevision oder Sperre verwirft die Vorschau. Laufende
Berechnungen werden durch Beenden des nativen Workers abgebrochen.

Das Teil wird starr gedreht und entlang der Auflagennormalen verschoben.
Der angeklickte Kontaktpunkt behält seine seitlichen Ebenenkoordinaten.
Maße, Skalierung, Spiegelung, Scherung, Quellen, Parameter, Farben, Layer
und unbeteiligte Teile bleiben erhalten. Übernehmen erzeugt einen Undo-Schritt;
Redo und Speichern/Neuöffnen behalten den bestätigten Stand.

Eine am bewegten Teil befestigte Arbeitsebene wird beim Übernehmen gelöst.
Sie bleibt in ihrer bisherigen Weltlage. Die Auswahl **Grundebene** verändert
die aktuelle Arbeitsebene nicht.

## Native Prüfung und Grenzen

Die Flächenwahl nutzt einen nativen CAD-Strahlschnitt. Die Originalgeometrie
muss genau eine passende getrimmte ebene Fläche besitzen. Analytische Ebenen
werden vor der affinen Welttransformation geprüft; deshalb bleiben auch
gespiegelte, geschert und ungleichmäßig skalierte Teile bearbeitbar.

Native Körpergrenzen in der Zielbasis prüfen die gesamte Materialausdehnung.
Eine innere Vertiefung oder andere Fläche, unter der Material läge, wird
abgewiesen. Die Prüfung berücksichtigt die native OCCT-Präzisionsreserve
von zweimal `Precision::Confusion()` (gewöhnlich 0,0000002 mm) sowie
größenabhängige Gleitkommareserven. Es werden keine Dreiecksstichproben als
Geometriebeweis verwendet. Die Oberfläche lässt keine Wahl durch ein sichtbar
davorliegendes Teil zu.

Diese Ausbaustufe unterstützt ausschließlich native ebene Auflageflächen.
Gekrümmte Flächen, Netzreferenzen, gesperrte Teile, reine Lochkörper und
Gruppenquellen als einzelne Zielteile werden mit Erklärung abgewiesen.

## Lokale KI

Der neue CAD-Befehl `layOnFace` akzeptiert `target`, einen Weltstrahl
`ray: {origin, direction}` und optional `ground: true`. Er verwendet dieselbe
native Prüfung und bleibt eine unbestätigte Vorschau bis zu `offlinecad_apply`.
Kontext und JSON-Schema beschreiben den neuen Befehl und den dauerhaften
Gesamtprojektumfang bei temporärer Auswahlisolation.

Diese portable Etappe ersetzt keine vorhandene Installation. Quellen,
Lizenzen, Anleitung und Prüfnachweise liegen im Auslieferungspaket.
