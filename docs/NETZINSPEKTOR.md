# Netzinspektor – Paket 16 (Formnaro 0.35.0)

Ein vollständiges sichtbares Netzteil auswählen und **Netzinspektor …** öffnen.
Die Diagnose beginnt automatisch. Auch gesperrte oder geschützte Netzteile
können untersucht werden. CAD-Körper, Ansichtsvorlagen und historische Quellen
bleiben eigene Objektarten und sind keine Ziele dieses Werkzeugs.

## Sichtbare Diagnose

| Kategorie | Anzeige und Bedeutung |
|---|---|
| Offene Randkanten | Orange Linien: genau eine angrenzende, nicht bereits entartete/doppelte Fläche. Ein offener Rand kann ein gewollter Durchbruch sein. |
| Doppelte Dreiecke | Rosa Flächen: alle betroffenen Originaldreiecke mit denselben drei exakten Koordinaten, auch bei umgekehrter Richtung. Gezählt werden betroffene Dreiecke, nicht zusätzliche Kopien. |
| Entartete Dreiecke | Gelbe Linien und Punkte: zusammenfallende Ecken oder numerisch nicht eindeutig bestimmbarer Flächeninhalt. Sehr schmale, aber nicht entartete Dreiecke sind keine automatische Fehlermeldung. |
| Widersprüchliche Flächenrichtung | Rote gemeinsame Kanten, denen zwei benachbarte Flächen in derselben Richtung folgen. Welche der beiden Flächen falsch liegt, wird nicht geraten. |
| Problematische Kanten | Violette Linien: mehr als zwei angrenzende Dreiecke. Doppelte Flächen können zusätzlich solche Kanten verursachen. |
| Problematische Punktverbindungen | Violette Punkte: mehrere voneinander getrennte Flächenfächer treffen sich nur an einem gemeinsamen Punkt. Bei bereits defekten Nachbarflächen/Kanten werden zusätzliche Punktmeldungen unterdrückt. |
| Kleine Nebenbestandteile | Blaue Flächen: kantenverbundene Bestandteile bis zur eingestellten Dreieckszahl. Der größte Bestandteil bleibt Hauptbestandteil; bei gleicher Größe entscheidet die erste Originaldreiecksnummer. Das ist keine automatische Einstufung als Abfall. |

Kategorien einzeln an- und ausschalten. **Markierungen durch das Bauteil zeigen**
blendet auch verdeckte Fundstellen ein; normalerweise gilt die Tiefenprüfung.
Über **Fundstellen ansehen**, **Vorherige** und **Nächste Fundstelle** wird die
Kamera auf eine einzelne Stelle gerichtet. Auswahl und Modell bleiben gleich.
Die Grenze kleiner Nebenbestandteile ist eine ganze Dreieckszahl (Standard 20);
**0** schaltet diese Markierung aus. Nach einer Änderung **Neu prüfen** drücken.

## Grenzen und Erhalt der Daten

Dies ist eine **reine Topologieprüfung**. Keine automatische Reparatur, kein
Schließen von Öffnungen, kein Entfernen von Teilen und kein Umkehren von Flächen.
Selbstüberschneidungen, Wandstärken und Druckbarkeit werden nicht untersucht.
Auch eine einheitlich nach innen gerichtete geschlossene Hülle kann in diesen
Kategorien unauffällig sein. Ein Bericht ohne Fundstellen beweist keinen gültigen
Materialkörper. Die vorhandene Körperprüfung und Wandstärken-Stichproben bleiben
separate Werkzeuge mit ihrem bisherigen Umfang.

Exakt gleiche Koordinaten werden nur für die Analyse als derselbe Punkt behandelt
(etwa die mehrfach gespeicherten Ecken einer STL-Datei). Es gibt keine
Toleranzverschmelzung und keine Änderung gespeicherter Punkte oder Indizes.
Nahe, aber unterschiedliche Oberflächen bleiben getrennt.

Analysegrenze: **500.000 Dreiecke / 1.000.000 gespeicherte Punkte je Netz**.
Die Berechnung läuft im eigenen abbrechbaren Hintergrundworker. Schließen,
Abbrechen oder Escape entfernt die temporären Markierungen. Eine tatsächliche
Geometrieänderung verwirft den alten Bericht; Lage/Farbe/affine Größe behalten
seinen gültigen Geometriebezug. Bei einer Projektänderung während einer laufenden
Berechnung wird diese verworfen. Schnittansichten/Quellenvorschauen unterdrücken
Markierungen des vollständigen Netzes; die Oberfläche weist darauf hin.

Keine Modell-Historie wird angelegt. Bestehende Quellen, Sperren, Schutzbereiche,
Originaldreiecke und CAD-BReps bleiben unverändert. Diagnoseberichte und
Ansichtspuffer werden nicht in die Projektdatei geschrieben. Nach Wiederöffnen
**erneut prüfen**. Speichern und Export behalten vollständige Objekte; farbige
Diagnoselinien und Punkte werden nicht als Geometrie exportiert. Der bisherige
STL-Export weist Dreiecke ohne Flächeninhalt weiterhin ab; es wird nichts still
entfernt. Das Projektformat und OBJ können solche Originalflächen erhalten.

## Prüfung und separate Ausgabe

Neue begrenzte Technik- und UI-Prüfungen decken alle sieben Kategorien,
Abbruch/verspätete Antworten, Sperren/Schutz, affine Lage, echtes Dateispeichern
und Wiederöffnen sowie vollständige OBJ- und STL-Exporte ab. Die tatsächliche neue
EXE erhält dieselben Prüfungen. Maßgeblich sind erfolgreiche aktuelle
`work/mesh-inspector/checks/final-audit.json` und `delivery.json`; sie binden die
öffentlichen Quellen und vollständigen Auslieferungsdateien an die Rohberichte.
Die bisherige Ausgabe 0.34.0 und der eigenständige Konverter bleiben erhalten.
Neue Reparaturverfahren aus Paket 17 sind hier noch nicht enthalten.
