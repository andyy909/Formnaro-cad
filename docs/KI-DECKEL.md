# Formangepasste Deckel mit der Formnaro-KI

Ab Formnaro 0.50.0 kann die KI aus einem ausgewählten Gehäusenetz einen
separaten Deckel ableiten. Die Geometrieanalyse und Konstruktion laufen lokal
im vorhandenen Netz-Rechenkern. Die eingerichtete KI-Anbindung bleibt bestehen.

## Benutzung

1. Die Gehäuse-STL als bearbeitbares Netz importieren und das Teil auswählen.
2. Im KI-Chat beispielsweise schreiben: „Erstelle einen Deckel für die offene
   Seite. Nutze die vorhandenen Schraubaufnahmen für M4-Zylinderschrauben.
   Platte 2,5 mm, Führungsrand 1,6 mm tief, Spiel 0,25 mm.“
3. Den Vorschlag mit **Ansehen** prüfen. Erst **Übernehmen** fügt den Deckel
   hinzu. **Verwerfen** verändert das Modell nicht.
4. Zum Exportieren nur den neuen Deckel auswählen. Gehäuse und Deckel bleiben
   eigenständige Teile. Rückgängig entfernt den gesamten Vorschlag in einem Schritt.

M4 verwendet im Standardentwurf 4,5-mm-Durchgangslöcher mit außen aufliegenden
Schraubenköpfen. Es wird kein Gewinde und keine Kopfsenkung erzeugt. Die
vorhandenen Bohrungsachsen werden aus der Geometrie gemessen; sie sind keine
Bestätigung eines vorhandenen Gewindes oder einer passenden Schraubenlänge.

## Umfang und Grenzen

- Genau ein sichtbares, entsperrtes Material-Netz auswählen; bis 100.000 Dreiecke.
- Gesucht werden ebene Öffnungen nahe den sechs durch die Objektlage
  transformierten ursprünglichen Achsrichtungen. Drehung, Spiegelung und affine
  Lage werden berücksichtigt. Eine schräg in die STL selbst eingebaute Öffnung
  außerhalb dieser Richtungen muss zunächst passend ausgerichtet werden.
- Die Kontur stammt aus einem eindeutigen geschlossenen Randquerschnitt bis
  höchstens 1 mm hinter der äußersten Oberfläche. Dadurch kann der Deckel bei
  einem schrägen Rand geringfügig überstehen. Die Analyse nennt den Bezugseinzug.
- Es wird eine große Öffnung je Richtung erkannt. Mehrdeutige, verzweigte oder
  mehrere ähnlich große Öffnungen werden nicht zu einer Kontur geraten.
- Bis acht kreisförmige Bohrungen außerhalb der großen Öffnung werden als
  Schraubaufnahmen gemessen und sämtlich übernommen. Unrunde, elliptische oder
  unbekannte Aufnahmen werden nicht als Schraubbohrungen behauptet.
- Offene oder beschädigte Netze können geeignete Querschnitte liefern. Die
  Quelle wird dabei weder repariert noch als gültiger Materialkörper bezeichnet.
- Der Führungsrand wird um Innenaufbauten und Schraubaufnahmen geführt.
  Ungeeignete Einstecktiefe, zu breite Ränder und zu große Löcher werden abgewiesen.
- Das gespeicherte Ergebnis muss ein einzelner geschlossener Körper sein.
  Der gespeicherte Führungsrand wird gegen die Projektionen aller ursprünglichen
  Dreiecke über seinen vollständigen Einsteckbereich mit Abstand geprüft.
  Numerische Vereinfachungs- und Speichergrenzen werden gesondert berücksichtigt.
  Die Prüfung betrifft die bereitgestellte Oberflächengeometrie; sie ersetzt
  keine Prüfung eines beschädigten Ausgangskörpers, keine Dichtungsauslegung
  und keine reale Druck- und Passprobe.

## Lokale KI-Schnittstelle

Die bestehende Abfolge `context → scene → preview → apply` bleibt erhalten.
`scene.meshLids` enthält nur begrenzte Messdaten und die an Quellgeometrie und
Lage gebundene Kennung. Dreiecke und Konturen bleiben lokal. Ein Vorschlag nutzt:

```json
{
  "op": "mesh",
  "tool": "lid",
  "target": "VORHANDENE_GEHAEUSE_ID",
  "as": "deckel",
  "name": "Deckel M4",
  "options": {
    "geometryDigest": "AUS_DER_AKTUELLEN_ANALYSE_KOPIEREN",
    "candidateId": "AUS_DER_AKTUELLEN_ANALYSE_KOPIEREN",
    "normal": [0, 1, 0],
    "thickness": 2.5,
    "lipHeight": 1.6,
    "lipWall": 1.2,
    "clearance": 0.25,
    "holeDiameter": 4.5
  }
}
```

Auch die Normale muss aus dem gewählten Kandidaten übernommen werden.
Quelländerungen oder Verschiebungen machen alte Analysekennungen ungültig.
Der Deckel erhält die archivierte Quelle und ein lokal prüfbares Rezept in
Netzquellformat 3; Projektformat 8 bleibt erhalten. Historische Quellgeometrie
wird nicht nachträglich geändert. Ein veränderter Entwurf entsteht als neuer
Vorschlag gegen den aktuellen Gehäusestand.
