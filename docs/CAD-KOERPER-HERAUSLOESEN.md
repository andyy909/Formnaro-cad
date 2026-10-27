# Formnaro CAD 0.18.0 – Paket 6

Ein fertiges, sichtbares und entsperrtes CAD-Teil auswählen und „Körper
herauslösen“ in der Werkzeugleiste oder „Unabhängige Körper herauslösen“ unter
Funktionen öffnen. Die native Vorschau prüft die einzelnen Volumenkörper und
ihre Abstände. Sie zeigt jeden Körper in einer eigenen Farbe und nennt sein
physisches Volumen. „Alle Körper übernehmen“ ersetzt das Original durch alle
Ergebnisse in unveränderter Lage. Das erzeugt einen Undo-Schritt.

Abbrechen, Escape, Auswahlwechsel und veraltete Vorschauen erhalten Modell und
Historie. Laufende Berechnungen werden durch Beenden des CAD-Workers abgebrochen.
Die Vorschau ist auch für STEP-Importe und fertige Gruppen mit getrennten
Körpern geeignet. Ein einzelner Körper, überlappende oder berührende Körper
werden mit Erklärung abgewiesen. Innere Hohlräume gehören weiterhin zu ihrem
nativen Volumenkörper. Auch ein getrenntes Teil innerhalb eines leeren Hohlraums
kann herausgelöst werden, wenn sein nativer Abstand positiv ist.

Jedes Ergebnis enthält eine unabhängige Kopie der vollständigen Originalquellen
mit neuen Kennungen. Ein geprüfter SHA-256-Geometriebezug verbindet das Ergebnis
mit seinem nativen Körper; die Reihenfolge der Körper dient nicht als Zuordnung.
Die volle affine Ausgangsmatrix und die untergeordneten Quellen bleiben erhalten,
einschließlich Drehung, Spiegelung, Skalierung und Scherung.

Lage, Farbe und native Kantenbearbeitung des Ergebnisses bleiben bearbeitbar.
Die erhaltene Originalgeometrie ist im Quellenbaum einsehbar und gegen
Geometrieänderungen geschützt. Für eine Änderung die Originalquelle kopieren,
als eigenes Teil einfügen, bearbeiten und erneut herauslösen. Eine geänderte
Originalgeometrie darf niemals stillschweigend einen anderen Körper auswählen.
Gewöhnliches Auflösen ist gesperrt, weil dadurch das vollständige Original
wieder erscheinen würde. Duplikate und Bibliotheksvorlagen erhalten den
Geometriebezug und unabhängige Quellenkennungen.

Extraktionsrezepte speichern als CAD-Dateiformat 7. Gewöhnliche Projekte bleiben
Format 5; bestehende CAD-5-Dateien und die validierte Wiederherstellung aus
Paket 4 bleiben unterstützt. Netzformat 6 bleibt getrennt.

Die lokale API bleibt Version 1. `extractSolids` adressiert einen fertigen
CAD-Körper. Der optionale Alias `as` liefert ein Array aller neuen Körper-IDs.
Der Szenenkontext zeigt den Geometriebezug und kennzeichnet geschützte
Originalquellen mit `sourceGeometryReadonly`. Vorschau und Übernahme verwenden
die aktuelle Revision und berücksichtigen geerbte Sperren.

Die Abnahme umfasst echte native STEP-Körper und Gruppen, Hohlräume,
Berührungen, vollständige affine Matrizen, Materialerhalt, STEP-Rundläufe,
exaktes Undo/Redo und erneutes Öffnen. Desktop-Prüfungen bedienen Toolbar und
Funktionen mit echten Mausklicks und prüfen Quellen, Bibliothek, Abbruch und API.
Die portable Ausgabe enthält die passende Anwendung, Quellen, Kernel- und
Konverterquellen, Lizenzen und Prüfnachweise. Separat entpacken und starten;
vorhandene Installationen werden nicht automatisch ersetzt.
