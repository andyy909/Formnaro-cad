# Teile, Material und Baugruppen – Paket 10

Abgenommene Windows-Ausgabe 0.117.0-r7 vom 28.10.2026. Paket 10 und die
allgemeine gemeinsame Ausbauprüfung bestanden.
[Prüfumfang und Grenzen](GESAMTABNAHME-AUSBAU-0.117.md).

In **Normal** und **Easy Tinker** steht **Teile & Material** unter
**Ansicht & Prüfen**, in **Solid** und **Fusion** unter **Extras**.
Die vier Bereiche teilen dieselben bestätigten Teile und Transaktionen.

## Material und Dichte

Ein vollständiges sichtbares und entsperrtes CAD- oder Netzteil wählen.
Materialgruppe benennen und die Dichte ausdrücklich in **g/cm³** eingeben.
Eine leere Dichte bleibt unbekannt. Weder Materialname noch Farbe bestimmen
automatisch einen Zahlenwert. Ein fertiges Teil besitzt hier ein homogenes
Material; verschiedene Dichten in einzelnen Flächen werden nicht behauptet.

**Vorschau** verändert kein gespeichertes Modell. **Übernehmen** erzeugt einen
Rückgängig-Schritt. BRep, Netzpunkte, Montage, Parameter und Originalquellen
werden durch diese Eigenschaften nicht geändert.

## Flächenfarben und Gruppen

Ein vollständig geladenes Teil wählen. CAD-Flächen im Modell anklicken;
bei Netzen einzelne Dreiecke anklicken oder eine bereits übernommene
Netz-Flächenauswahl verwenden. Erneutes Anklicken entfernt eine Fläche aus
der neuen Auswahl. Gruppenname und Farbe eingeben, Vorschau prüfen und
übernehmen. Eine Fläche gehört höchstens einer ausdrücklich gespeicherten
Gruppe an. Eine neue Zuweisung ersetzt dort die vorherige Zuweisung.
Importierte STEP-Farben anderer Flächen bleiben erhalten. Bei mehrfarbigen
Quellgruppen haben die ausdrücklich aktivierten Quellenfarben Vorrang.
Für eigene Flächengruppen zuerst **Quellenfarben erhalten** am fertigen Teil
abschalten; Quellen bleiben gespeichert. Erneutes Einschalten zeigt wieder
die Quellenfarben und deaktiviert eigene Flächengruppen in Ansicht/Export.

Native Flächenindizes sind an das genaue unveränderte lokale BRep gebunden;
Netzgruppen an die genauen Punkte und Dreiecke. Montageverschiebung oder
Drehung verändert diese Identität nicht. Nach Geometrieänderung werden die
alten Gruppen als veraltet gemeldet und färben die neue Geometrie nicht.
Die gespeicherten Angaben bleiben zur Neuorientierung erhalten.
**Eigene Flächengruppen entfernen …** bereitet eine rückgängig machbare Vorschau
ohne diese Zuweisungen vor; Material und ursprüngliche Importfarben bleiben erhalten.

Farbfähige CAD-Exporte unterstützen STEP, OBJ/MTL, 3MF und glTF/GLB.
Netz-Flächenfarben unterstützen OBJ/MTL, 3MF und glTF/GLB; Netze werden
dadurch nicht zu STEP-Körpern. STL trägt keine Flächenfarben.
Die Materialbezeichnung und Dichte bleiben im Projekt und in der CSV-Stückliste;
eine werkstoffbezogene STEP-Simulation wird nicht erzeugt.

## Masse, Schwerpunkt und Stückliste

**Teile prüfen / Stückliste aktualisieren** untersucht alle sichtbaren fertigen
Materialteile, auch bei einer vereinfachten Baugruppenanzeige. Dazu wird die
benötigte Geometrie nachgeladen. Verborgene Teile, Lochwerkzeuge, unterdrückte
Quellen und Ansichtsvorlagen sind nicht Teil dieser ausdrücklich benannten Summe.
Jede Wurzel zählt als ein fertiges Teil; erhaltene Bearbeitungsquellen zählen
nicht zusätzlich. Die CSV führt jede Teilkennung mit Anzahl 1 auf.

CAD-Volumen und erste Momente werden nativ im OCCT-Kern integriert. Die
Bounding-Box-Mitte ist kein Massenschwerpunkt. Netzvolumen und erste Momente
werden aus gespeicherten Dreiecken integriert, nach vollständiger begrenzter
Schnittprüfung und unabhängigem Manifold-Körpervergleich. Dieser Netzpfad
unterstützt bis zu **30.000 Dreiecke**; größere, offene oder ungeprüfte Netze
liefern keinen bestätigten Massenwert.

`Masse g = Volumen mm³ × Dichte g/cm³ ÷ 1000`.
Der Gesamtmassenschwerpunkt ist das mit den Teilmassen gewichtete Mittel.
Fehlt eine Dichte oder ein Körpernachweis, bleiben Gesamtmasse und
Gesamtschwerpunkt offen; die bekannte Teilsumme ist getrennt beschriftet.
Überlappende fertige Teile werden addiert und nicht als Material vereint.

**Stückliste als CSV exportieren** enthält Teilkennung, Name, Materialgruppe,
Anzahl, Dichte, Volumen, Masse, Schwerpunktkoordinaten und Prüfstatus.
Unbekannte Werte bleiben leer. CSV-Texte werden vollständig maskiert;
führende Tabellenformeln werden als Text ausgegeben.

Der begrenzte Ergebniscache gehört zur laufenden Controller-/Engine-Sitzung.
Algorithmusversion, genaue Geometrie, vollständige Platzierung und gespeicherte
Teileinstellungen bestimmen seine Identität. Keine Darstellungsstatistik oder
ein fremder gespeicherter Cache wird zum Geometrienachweis.

## Gespeicherte Explosionsansicht

**Richtungen aus aktueller Baugruppe erzeugen** verteilt sichtbare fertige Teile
vom Mittelpunkt ihrer Anzeigebegrenzungen nach außen. Diese Richtungen dienen
der Darstellung und sind keine Bewegungs- oder Kollisionssimulation.
Der Abstandsregler verschiebt die Darstellung entlang dieser gespeicherten
Einheitsrichtungen. **Montage anzeigen** stellt die Originalmatrizen wieder her;
**Gespeicherte Explosion anzeigen** aktiviert die gespeicherte Einstellung erneut.

Während der Explosion ist Modellbearbeitung gesperrt. Normale Kameranavigation,
Speichern, Massenermittlung und Modell-Exporte verwenden weiterhin die originale
Montage. Arbeitsplätze speichern Richtungen und Abstand; Wiederöffnen stellt
die Explosionsanzeige wieder her. Eine neue Modellieraktion beendet vorher die
Anzeige, wenn sie über den bestehenden Werkzeugvorbereitungsweg geöffnet wird.
Rohe Änderungen an der noch explodierten Montage werden zurückgewiesen.

Teileigenschaften benötigen Projekt-/Bibliotheksversion **25**;
Explosionsangaben Arbeitsplatzversion **6** und Projektversion 25.
Ohne Verwendung dieser Inhalte bleiben bisherige Dateiversionen erhalten.
OCAD, FNPACK, Autosicherung und Undo verwenden die bestehenden Speicherwege.

Die gemeinsame Programmschnittstelle bietet `cad/partProperties` mit `{id}`
und `mesh/partProperties` mit `{id}` bzw. `mesh/toolsQuery` mit
`{kind: 'partProperties', id}`. Das Ergebnis enthält `volumeMm3` und
`centerMm`, noch keine aus einem Materialnamen vermutete Masse.
