# Gelenke und geführte Bewegung

Im CAD-Bereich öffnet „Gelenke“ einen seitlichen Bereich. Die 3D-Ansicht bleibt zum Drehen und Verschieben der Kamera bedienbar. Zwei ausgewählte fertige Materialteile werden als Elternteil und bewegtes Kind vorgeschlagen. Unterstützt werden starre CAD- und Netzteile.

## Verbindungen anlegen

1. Feste Verbindung, Drehgelenk oder Schiebegelenk wählen.
2. Elternteil und Kind festlegen. Eine verbundene Gruppe erhält eine feste Basis.
3. Bezugspunkt in Weltkoordinaten und Achsenrichtung angeben. Für Drehung gelten Grad, für Führung Millimeter. Die Achse wird auf Länge eins normiert.
4. Bei beweglichen Gelenken untere und obere Grenze festlegen. Der Anfangswert ist null und muss innerhalb der Grenzen liegen.
5. „Verbindung anlegen“ bestätigt die Definition mit einem Undo-Schritt und erhält die aktuelle Teilposition.

Jedes Kind besitzt genau einen Elternbezug. Geschlossene Gelenkketten sind in dieser Ausbaustufe ausgeschlossen. Insgesamt sind 256 Gelenke und 500 feste Basen möglich; Winkel bleiben innerhalb ±36.000°, Wege innerhalb ±100.000 mm. Auch die vollständigen Teilbegrenzungen müssen im bestehenden Modellbereich bleiben.

## Bewegung prüfen und übernehmen

Regler und Zahlenfelder bewegen ausschließlich die Anzeigematrizen der betroffenen Teile und ihrer Mitnehmer. BReps, Netzdaten, gespeicherte Quellen und Modellhistorie bleiben während dieser Vorschau erhalten. Die Bewegung startet keine Geometrie- oder Kollisionsberechnung. Spiegelungen, Scherungen und vorhandene Skalierungen werden als vollständige affine Matrizen erhalten.

„Bewegung übernehmen“ bestätigt alle gesammelten Gelenkwerte und Teilpositionen gemeinsam mit genau einem Undo-Schritt. „Abbrechen“ und „Bewegung zurücksetzen“ stellen die bestätigte Ausgangslage wieder her. Ungültige Werte oder ein gesperrtes betroffenes Teil erhalten die letzte gültige Vorschau. Eine gesperrte feste Basis darf als unveränderte Referenz dienen; unbewegte andere Zweige bleiben bedienbar.

## Grenzen und Bezüge bearbeiten

Der aufklappbare Bereich bietet Grenzen, „Bezug erneuern“ und „Verbindung lösen“. Jede ausdrücklich übernommene Definitionsänderung ist ein eigener Undo-Schritt. Neue Grenzen müssen den bestätigten Wert einschließen. Eine noch unbestätigte Bewegung zuerst übernehmen oder zurücksetzen.

Freies Verschieben, Geometrieänderungen oder Gruppieren außerhalb des Gelenkbereichs können gespeicherte Bezüge veralten lassen. Fehlende Teile bleiben als beschädigte Bezüge gespeichert. Die Bewegung ist dann gesperrt, bis die betroffenen Bezüge ausdrücklich erneuert oder gelöst wurden. „Bezug erneuern“ verwendet den oben angegebenen Weltpunkt und die Achse und erhält den gesamten aktuellen Körper sowie den bestätigten Bewegungswert. Es erfolgt keine automatische Suche nach ähnlichen Flächen. Diese erste Stufe verlangt gültige Bezüge für den gesamten gespeicherten Gelenkbaum.

## Kollision ausdrücklich prüfen

Im Bereich „Ausdrückliche Kollisionsprüfung“ zwei sichtbare fertige Materialteile auswählen und „Kollision jetzt prüfen“ betätigen. Die Prüfung verwendet die unbestätigte Stellung, speichert sie aber nicht.

- CAD/CAD: nativer BRep-Volumenschnitt.
- Netz/Netz: Volumenschnitt der vorhandenen geschlossenen Netze im Netzkern.
- CAD/Netz: ausdrücklich gekennzeichnete Näherung mit Vernetzungsziel 0,01 mm und 5° für den CAD-Körper. Das Ziel ist keine garantierte Maximalabweichung.

Geprüft werden nur die zwei Teile in dieser Stellung und ein positiver Volumenschnitt. Berührung ohne Volumen und der gesamte Bewegungsweg sind damit nicht nachgewiesen. Es gibt keine ständig laufende Kollisions- oder Physiksimulation. Die Netzprüfung ist auf je 200.000 Dreiecke und nachweislich geschlossene Netze begrenzt. Abbruch verwirft die interne Prüfvorschau ohne Undo-Schritt.

## Speichern, Kopieren und lokale KI

Gelenke verwenden Projekt- und Bibliotheksformat 16. Alte Formate 5 und 7–15 bleiben lesbar. Jede Verbindung speichert zwei vollständige körperlokale Bezugsmatrizen, Kennungen, Art, Bewegungswert und Grenzen. Die ursprüngliche STEP-Datei wird für diese gespeicherten BReps nicht benötigt.

Kopien und Vorlagen übernehmen ausschließlich Verbindungen zwischen den tatsächlich mitkopierten Teilen, mit frischen Gelenk- und Teilkennungen. Eine ausgeschnittene Untergruppe erhält eine eigene feste Basis. Ein allein kopiertes Kind bleibt von seinem bisherigen Elternteil gelöst. Die bestehenden Originale bleiben erhalten.

Die lokale KI kann über `op:joint` Definitionen anlegen, bewegen, lösen, neu binden und Grenzen ändern. Ein Vorschauauftrag enthält genau einen Gelenkbefehl; mehrere Bewegungswerte werden darin gesammelt. `app/joints` liefert begrenzte Listen und Status ohne Kernelstart. `app/jointCollision` ist eine getrennte, ausdrücklich angeforderte Analyse. Revision, Vorschau, Übernehmen und Verwerfen folgen dem bestehenden lokalen Transaktionsvertrag. Zugangsdaten sind dafür nicht in Projekte oder Vorlagen einzutragen.
