# Formerkennung und passende Gegenstücke

Ab Formnaro 0.52.0: Ein sichtbares, entsperrtes Material-Netzteil auswählen und unter **Netz-Werkzeuge → Formerkennung und Gegenstück** öffnen.

Die lokale Analyse misst ebene Dreiecksbereiche, geschlossene Außen- und Innenkonturen sowie kreisförmige Öffnungskonturen. Die Liste zeigt Größen, Positionen und Richtungen. Kreisfits enthalten ihre gemessene Abweichung; sie behaupten keine Gewinde oder durchgehenden Zylinderbohrungen. Koplanare, räumlich getrennte Dreiecke können als ein ebener Bereich zusammengefasst sein. Die Richtung einer ebenen Region ist geometrisch, nicht als äußere Materialnormale verifiziert.

In einem begrenzten Bereich bis höchstens 1 mm unterhalb der gewählten Ebene (und weniger als 10 % der verfügbaren Tiefe) wird die breiteste eindeutige Schnittkontur gesucht. Die tatsächliche Messtiefe wird angezeigt; die Einstecktiefe muss mindestens dorthin reichen. Kleine Vorsprünge verdecken dadurch nicht automatisch den größeren Gehäuserand.

Automatisch werden die sechs transformierten Quellachsen und Richtungen großer ebener Bereiche untersucht. Über **Schnittebene** kann eine gemessene Ebene samt Richtung gewählt und die Analyse neu ausgeführt werden. Die KI kann außerdem einen beliebigen endlichen Ebenenpunkt und eine Normale lokal abfragen. Mehrdeutige, verzweigte oder sich berührende Schnittkonturen werden nicht geraten.

## Gegenstücke

- **Einsatz:** gerade, massive Einsteckform aus einer Innenkontur.
- **Hülse:** gerader umlaufender Rand um eine Außenkontur.
- **Abdeckung mit Führungsrand:** Platte entlang der umgebenden Außenkontur und ein innen liegender Führungsrand. Der Plattenanfang liegt um das eingestellte Spiel oberhalb der gemessenen Ebene. Schraublöcher werden hierbei nicht ergänzt; dafür bleibt die vorhandene spezielle Deckelfunktion verfügbar.

Spiel wird je Seite in Millimetern angegeben. Es ist ein geometrischer Konturversatz, keine Skalierung über den Begrenzungskasten. Die Form wird über die gesamte Tiefe konservativ an Quellflächen angepasst: Einsätze weichen Hindernissen aus, Hülsen umfassen den projizierten Außenumriss über die Tiefe. Diese Gegenstücke sind prismatisch entlang der gewählten Richtung. Es handelt sich nicht um einen allgemeinen räumlichen Versatz beliebiger Freiformflächen.

Standards: Tiefe 3 mm, Spiel 0,25 mm, Wand 1,2 mm, Platte 2,5 mm. Die Eignung für Material, Druckverfahren und realen Sitz muss am tatsächlichen Teil geprüft werden. Bei ungeeigneter Tiefe, zu wenig Platz oder getrennten Ergebnissen wird die Konstruktion verworfen.

Das Ergebnis ist ein neues, einzeln vom Netzkern geprüftes geschlossenes Teil. Auch die gespeicherten Float32-Koordinaten und der Abstand der Einsteckflächen zu sämtlichen Quellflächen über die ganze Tiefe werden geprüft. Die Berechnung beweist bei offenen oder beschädigten Quellen kein gültiges Materialvolumen. Original, unbeteiligte Teile und Organisation bleiben exakt erhalten. Vorschau/Abbrechen ändern den bestätigten Stand nicht; Übernehmen erzeugt einen Rückgängig-Schritt. Original und Verfahren bleiben im neuen Teil gespeichert.

Die aktuelle Ausbaustufe arbeitet mit Netzen bis 100.000 Dreiecken innerhalb der bestehenden Geometriegrenzen. Native CAD-Analyse bleibt verfügbar; für dieses Werkzeug kann bei ausdrücklichem Bedarf die vorhandene unabhängige CAD-Netzkopie erstellt werden. Es erfolgt keine automatische Konvertierung des Originals.

## Direkter KI-Zugriff

Bei genau einem ausgewählten geeigneten Netzteil enthält `scene.meshFeatures` den kompakten Katalog mit aktuellem `geometryDigest`, gemessenen `profileId`, `normal`, `planePoint` und erlaubten `counterparts`. Die KI erhält über diese Zusammenfassung keine rohen Dreiecks- oder Konturarrays.

```js
// Innerhalb eines lokalen KI-Skripts:
const catalog = await api.query({
  engine: 'mesh', kind: 'featureCatalog',
  options: { id: sourceId, options: { normal: [0, 0, 1] } }
});
// Profil anhand des Nutzerauftrags und seiner gemessenen Lage auswählen.
const profile = catalog.profiles.find(p => p.profileId === chosenProfileId);
await api.run({
  op: 'mesh', tool: 'counterpart', target: sourceId, as: 'insert',
  options: {
    geometryDigest: catalog.geometryDigest,
    profileId: profile.profileId,
    normal: profile.normal,
    planePoint: profile.planePoint,
    mode: 'plug', depth: 3, clearance: 0.25
  }
});
```

Gleichwertig: `op:'tool', engine:'mesh', operation:{type:'mesh-counterpart', id:sourceId, options:...}`. Derselbe Rechenkern, dieselben Prüfungen und dieselbe Vorschau gelten für Oberfläche, typisierte KI-Befehle und eigene Skripte. Kennungen sind an Quellgeometrie und Lage gebunden und müssen nach Änderungen neu gelesen werden. Bei mehreren passenden Konturen muss die KI die beabsichtigte Stelle klären.

Die bestehende abgeschottete Skriptumgebung bleibt unverändert: keine zusätzlichen Datei-, Netzwerk-, System- oder Zugangsdatenrechte. Nur das aktuelle Modell und die vorhandenen Modellierwerkzeuge sind erreichbar. Der eingestellte KI-Anbieter erhält weiterhin die normalen ausdrücklich gesendeten Nachrichten, Modellzusammenfassungen und Anhänge.
