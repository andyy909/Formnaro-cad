# KI-Werkzeuge und eigene Berechnungen

Ab 0.53.0: vorbereitende Messrunden mit Rückmeldung an die KI und zusätzliche Körper-/Volumen-/Bohrkorridor-Prüfungen für geschlossene Netze. Details: [KI-MESSUNGEN.md](KI-MESSUNGEN.md).

Ab 0.52.0 ergänzen `scene.meshFeatures`, `featureCatalog` und `mesh-counterpart` die allgemeine Formerkennung und konturfolgende Einsätze, Hülsen und Abdeckungen. Bedienung, KI-Vertrag und Prüfgrenzen: [FORMERKENNUNG.md](FORMERKENNUNG.md). Die bestehende Abschottung bleibt erhalten.

Ab Formnaro 0.51.1 steht der internen KI die allgemeine Anbindung der vorhandenen CAD- und Netz-Rechenwerkzeuge zur Verfügung. Die bisherige kurze Befehlsliste bleibt kompatibel. Zusätzlich kann die KI Werkzeugaufrufe kombinieren, eigene JavaScript-Berechnungen ausführen und zusätzliche Werkzeugmodule als Quelltext innerhalb des Programms importieren.

## Wo wird gerechnet?

Bei einem angebundenen Cloud-Modell entstehen Überlegungen und vorgeschlagener Code beim KI-Anbieter. Formnaro führt den Code und die Geometrieberechnungen anschließend lokal aus. Die normalen gesendeten Nachrichten, Modellzusammenfassungen und ausdrücklich angehängten Bilder gehen weiterhin an den eingestellten Anbieter. Die neue lokale Umgebung öffnet keine zusätzliche Cloud-Verbindung.

## Zugriff innerhalb des Programms

- Vorhandene CAD-Erzeugung, Formparameter, Quellen, Kantenoperationen, Vorlagen, SVG-Konturen, Formpakete und native Hilfswerkzeuge.
- Vorhandene Netzwerkzeuge einschließlich gezielter Reparatur, Öffnungen schließen, Verbinder, Vereinfachen, Neuvernetzen, Glätten, Bereiche ersetzen, Make Solid, Aushöhlen und Deckel.
- Geometrieabfragen, echte Dreiecks-/Flächenauswahl, Öffnungs- und Reparaturkataloge, Messungen sowie vorhandene Schnitt- und Prüfberechnungen.
- Explizite CAD-Netzkopien und der vorhandene lokale STL-CAD-Konverter am aktuellen Modellteil, einschließlich seiner Regionsanalyse.
- Geladene Schrift- und Formpaketinformationen, originale Text-/SVG-Konturen und die vorhandenen Passungs-, Referenz-, Auflage-, Magnet- und Linealhilfen.
- Neue, selbst berechnete Netzgeometrie als unabhängiger, durch den Netzkern geprüfter Körper.

Die KI darf neue Algorithmen und Hilfsfunktionen schreiben. Das bedeutet keine uneingeschränkte Genauigkeit oder neue Fähigkeiten des Geometriekerns: Beispielsweise bleiben konservative Netzoperationen, Stichprobenprüfungen und Konvertierungsgrenzen dieselben wie bei manueller Bedienung. Flächenschutz und gesperrte Teile bleiben wirksam. Einstellungen, Dateiöffnungsdialoge und der gesamte Computer werden dadurch nicht zu Modellierwerkzeugen.

## Zusätzliche Skripte und Module

Ein Vorschlag kann zusätzliche ES-Werkzeugmodule als Text bereitstellen und innerhalb der lokalen Rechenumgebung importieren. Auch dynamisch erzeugte Werkzeugmodule sind möglich. Der importierte Code erhält dieselben Modellfunktionen wie das Hauptskript. Er erhält keine erweiterten Rechte.

Freies Nachladen über Internetadressen oder beliebige Dateipfade ist kein Bestandteil dieses Imports. Es wird der im Vorschlag bereitgestellte Code ausgeführt. Fremde Dateien, Profilinhalte, Zugangsdaten, Betriebssystembefehle, Paketinstallation und beliebige Desktop-Schnittstellen sind nicht erreichbar.

Die Abschottung nutzt einen Worker in einem iframe ohne gemeinsame Ursprungsrechte. Seine eigene Sicherheitsrichtlinie sperrt Netzwerk-, Datei- und externe Codezugriffe. Das Modell wird ausschließlich über eine kleine Nachrichtenverbindung bereitgestellt. Der Code läuft weder im Hauptfenster noch im Electron-Hauptprozess. Rechenzeit- und Größenwächter verhindern, dass ein Skript die Oberfläche dauerhaft blockiert; Abbrechen beendet die Umgebung.

## Vorschau und Rückgängig

Alle Werkzeugaufrufe eines Vorschlags arbeiten auf einem vorläufigen Modell. Der bestätigte Stand bleibt bis **Übernehmen** erhalten. Ein Fehler oder Abbruch verwirft den Vorschlag. **Übernehmen** erzeugt einen gemeinsamen Rückgängig-Schritt. Modelländerungen während der Berechnung machen den alten Vorschlag ungültig.

Berechnungszusammenfassungen erscheinen im KI-Ergebnis unter „Lokale Modellberechnung“. Sie sind Rechenausgaben des Skripts. Unabhängige Maßprüfungen und Geometriekernprüfungen bleiben davon getrennt.

## Schnittstelle für lokale Werkzeuge

Der aktuelle maschinenlesbare Vertrag steht in `ai/OfflineCAD-KI-Kontext.json` unter `programTools` und im vollständigen Befehlsschema.

```js
// Innerhalb eines script-Befehls:
const model = await api.model();
const source = model.nodes.find(n => n.kind === 'mesh');
const catalog = await api.query({
  engine: 'mesh', kind: 'toolsQuery',
  options: { id: source.id, kind: 'hollowCatalog' }
});
await api.run({
  op: 'tool', engine: 'mesh', as: 'shell',
  operation: {
    type: 'mesh-hollow', id: source.id,
    options: {
      method: 'signed-distance-shell-v1',
      geometryDigest: catalog.geometryDigest,
      wallThickness: 2, resolution: 0.5, drains: []
    }
  }
});
return { requestedWallThickness: 2 };
```

Zusatzmodule stehen im script-Befehl in `modules: { name: "ES-Modulquelltext" }`. `await api.importTool(name)` importiert sie; `await api.importTool(name, sourceText)` ergänzt ein Modul dynamisch. Module können mit `globalThis.formnaro` dieselbe Modell-API aufrufen. Keine dieser Funktionen nimmt einen Dateipfad entgegen.

Die Anbindung ändert keine Anbieterzugangsdaten und benötigt keinen zusätzlichen API-Schlüssel. Prüfungen mit simulierten Anbieterantworten belegen die lokale Integration; sie ersetzen keinen Qualitätsvergleich verschiedener KI-Modelle.
