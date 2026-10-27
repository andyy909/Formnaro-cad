# Gezielte Netzreparatur – Paket 17, Formnaro 0.36.0

Ein sichtbares, entsperrtes **Netzteil auswählen → Netz reparieren …**.
Zuerst die gewünschten Schritte ankreuzen, **Vorschau** berechnen, zwischen
**Original** und **Reparierter Vorschau** vergleichen. **Übernehmen** ist ein
gemeinsamer Modell-Undo-Schritt. **Abbrechen**, × oder Escape verwirft den
Entwurf. Erst Übernehmen ändert das Projekt. Rückgängig stellt den vollständigen
vorherigen Stand wieder her, Wiederholen das reparierte Ergebnis.

## Die drei einfachen Schritte

- **Sicher entartete Dreiecke entfernen:** nur bestätigte Nullflächen, etwa
  zusammenfallende oder exakt kollineare Ecken. Kein Grenzwert, der schmale
  gültige Flächen als Abfall behandelt. Numerisch problematische, aber nicht
  sicher flächenlose Dreiecke werden hier nicht gelöscht.
- **Zusätzliche doppelte Flächen entfernen:** exakt dieselben drei Koordinaten
  gelten als deckungsgleich. Die erste ursprüngliche Fläche bleibt erhalten,
  auch bei Gegenrichtung. Welche Richtung anschließend sinnvoll ist, lässt sich
  über den nächsten Schritt prüfen. Es wird nichts toleranzbasiert verschmolzen.
- **Geeignete Flächenbereiche einheitlich ausrichten:** Nachbarflächen folgen
  gemeinsamen Kanten in entgegengesetzter Richtung. Pro geeignetem Bereich wird
  die kleinere Anzahl Flächen umgedreht. Bei Gleichstand bleibt die erste
  Originalfläche richtungsgebend. Nicht orientierbare Bereiche, mehr als zwei
  Flächen je Kante oder weiterhin doppelte/entartete Nachbarflächen verhindern
  die Orientierung dieses gesamten Bereichs. Übersprungene Bereiche werden
  gezählt. Es gibt keine automatische Bestimmung von innen und außen.

Die Schritte sind einzeln wählbar und anfangs ausgeschaltet. Entfernen von
Nullflächen und Duplikaten wird vor dem Ausrichten berechnet und kann einen
bisher ungeeigneten Bereich dadurch eindeutig machen. Ohne tatsächliche Änderung
entsteht keine übernehmbare Vorschau und kein Undo-Eintrag.

## Kleine Nebenbestandteile

Den Abschnitt **Kleine Nebenbestandteile gezielt entfernen** aufklappen.
Die Grenze bezieht sich auf die Dreieckszahl je kantenverbundenem Bestandteil,
Standard 20. **0** schaltet die Liste aus. Der größte Bestandteil bleibt
Hauptbestandteil; bei Gleichstand entscheidet die erste Originaldreiecksnummer.
Bestandteile, die nur an einem exakten Punkt an andere Teile anschließen, werden
zum Entfernen gesperrt. Es wird kein Materialkörper aus bloßer Topologie abgeleitet.

**Ansehen** richtet die Kamera auf einen Bestandteil. Nur ausdrücklich
angekreuzte Einträge werden entfernt. Andere kleine Teile bleiben erhalten.
Die Liste besitzt Seiten mit je 128 Einträgen; maximal 256 gewählte Bestandteile
werden in einem Reparaturschritt entfernt. Größere Aufräumarbeiten lassen sich
in mehreren geprüften Schritten ausführen. Bei geänderter Grenze wird die
Teil-Auswahl geleert. Vor jeder Übernahme das Ergebnis prüfen.

## Vorschau, Quellen und Schutz

Die Vorschau zeigt die neue Geometrie und zählt entfernte Flächen, gewählte
Nebenbestandteile, gedrehte Flächen sowie verbleibende Inspektor-Auffälligkeiten
vorher und nachher. Einpassen mit **F** zeigt das gesamte Modell. Nach dem
Fokussieren eines entfernten Teils kann in der reparierten Ansicht dort bewusst
nichts mehr liegen; **Original** zeigt den Vergleich.

Verwendete Koordinaten bleiben exakt erhalten. Unbenutzte Punkte entfallen;
Indizes werden ohne Toleranzverschmelzung neu zugeordnet. Deshalb sind frühere
Flächenmarkierungen nach einer Reparatur neu auszuwählen. Bestehende Namen,
Farben, Deckkraft, affine Lage, Layer, Ordner, Rollen und Quellenverweise bleiben
erhalten. Das gesamte Originalnetz einschließlich seiner bisherigen Quellen
wird als Reparaturquelle im Projekt gespeichert. Andere Objekte bleiben gleich.

Vorhandene **Schutzbereiche** sperren Geometrieänderungen weiterhin zentral.
Diese zunächst im Werkzeug **Netzflächen auswählen** ausdrücklich entfernen,
danach die Reparatur erneut öffnen. Es gibt keine automatische Freigabe oder
scheinbare Weiterverwendung alter Schutz-IDs. Gesperrte oder versteckte Teile,
CAD-Körper, Ansichtsvorlagen und historische Quellpfade sind keine Reparaturziele.

Optionen ändern verwirft die bisherige Vorschau. Projekt- oder Auswahlwechsel
schließt den Entwurf; veraltete Ergebnisse lassen sich nicht übernehmen.
Schließen bricht den eigenen Hintergrundauftrag ab. Während eines Entwurfs
zuerst übernehmen oder abbrechen, dann speichern oder ein anderes Werkzeug
aufrufen. Speichern/Wiederöffnen erhalten das bestätigte Ergebnis und alle
archivierten Originaldaten, keine laufende Vorschau.

## Grenzen

Bis **500.000 Dreiecke und 1.000.000 gespeicherte Punkte** je Eingabenetz;
zusätzlich gelten die gemeinsamen Projekt- und Speichergrenzen einschließlich
der archivierten Quelle. Die Berechnung läuft im abbrechbaren Worker.

Diese Reparatur fügt keine Flächen hinzu, schließt keine Öffnungen, verschiebt
keine Punkte und trennt keine T-Verbindungen auf. Nichtmannigfaltige Kanten,
Punktkontakte, Selbstüberschneidungen und komplexe Defekte können bestehen bleiben.
Eine einheitlich nach innen gerichtete Hülle wird nicht pauschal umgedreht:
Innenräume können beabsichtigt sein. Keine Druckbarkeits- oder Körpergarantie.
Auch ein topologisch unauffälliges Ergebnis benötigt die vorhandene unabhängige
Körperprüfung, bevor Körperwerkzeuge verfügbar sind.

Die Reparaturquelle verwendet das vorhandene Netzquellformat 3 mit explizitem
Verfahren `repair/options.method = simple-v1` und exaktem Quelldigest. Es gibt
keinen stillen Rückfall auf die umfassendere Import-Reparatur. Ein nachträglich
geändertes historisches Eingabenetz kann einen neuen Reparaturauftrag erfordern.
Das gemeinsame Projektformat bleibt 8. Exportiert wird das vollständige aktuelle
Objekt; die historische Quelle und Vorschau werden nicht als zusätzliche Teile
in STL/OBJ ausgegeben. Ein weiterhin entartetes Netz kann den bisherigen
STL-Exportfehler auslösen; offene Netze bleiben offen exportierbar.

## Abnahme und Ausgabe

Die neue Oberfläche wird mit synthetischen offenen und geschlossenen Netzen,
Duplikaten, Nullflächen, einer falschen Nachbarrichtung und ausdrücklich gewählten
Nebenbestandteilen geprüft. Dazu gehören Vorschau, Vergleich, Abbruch, veraltete
Ergebnisse, Schutz/Sperren, gemeinsames Undo/Redo, normales Speichern/Wiederöffnen
und physische Exporte. Dieselben Prüfungen laufen in der separaten neuen EXE.
Maßgeblich sind die erfolgreichen vollständigen Nachweise
`work/mesh-simple-repair/checks/final-audit.json` und `delivery.json`.

Die bisherige Ausgabe 0.35.0 und der eigenständige Konverter bleiben erhalten.
Öffnungen schließen gehört zu Paket 18 und ist hier nicht enthalten.
