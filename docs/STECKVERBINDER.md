# Passstifte und passende Aufnahmen – Paket 20

Formnaro 0.43.0 ergänzt feste runde Passstifte und zugehörige Sacklochaufnahmen
für **zwei aneinanderliegende geschlossene Netzteile**. Das eignet sich etwa
für die beiden Hälften eines mit Paket 19 geteilten Gehäuses.

## Verbindung erstellen

1. Im Modus **Normal** beide Netzteile auswählen. CAD-Körper bei Bedarf zuvor
   ausdrücklich über **CAD → Netzkopie** kopieren.
2. **Netz-Werkzeuge → Passstifte und Aufnahmen …** öffnen.
3. Unter **Passstifte an** das Stiftteil wählen. Das andere ausgewählte Teil
   erhält die Aufnahmen. Ein Wechsel setzt den anfänglichen Flächenpunkt und
   die Richtung passend zur Reihenfolge der Teile neu.
4. Die **Verbindungsstelle** liegt in der gemeinsamen Kontaktfläche. Die
   Richtung zeigt vom Stiftteil in die Aufnahme. Der Startwert wird aus den
   Weltbegrenzungen der Teile vorgeschlagen; bei schrägen oder komplexen Teilen
   Punkt und Richtung prüfen. **Fläche am Stiftteil wählen** übernimmt einen
   sichtbaren Flächenpunkt und seine äußere Normale. Die Zahlen bleiben editierbar.
5. Maße einstellen und **Vorschau berechnen** wählen. Kommazahlen sind möglich.
6. Orange zeigt das Stiftteil, Türkis das Aufnahmeteil. Anzeigeabstand und
   Originalvergleich helfen bei der Kontrolle. Mit **Stifte und Aufnahmen
   übernehmen** beide Teile gemeinsam bestätigen oder mit **Abbrechen** verwerfen.

**Stift Ø** bestimmt den Nenndurchmesser. **Überstehende Stiftlänge** ist die
Länge ab der Kontaktfläche; **Verankerung** reicht in das Stiftteil hinein.
**Spiel je Seite** vergrößert den Aufnahmedurchmesser um den doppelten Wert:
Ein Stift mit Ø 4 mm und 0,2 mm Spiel je Seite erhält eine Aufnahme mit Ø 4,4 mm.
**Zusätzliche Tiefe** ist unabhängig davon: Bei 4 mm Stiftlänge und 0,3 mm
zusätzlicher Tiefe ist die Aufnahme 4,3 mm tief.

Mit **Anzahl Stifte** lassen sich 1–8 Verbinder in einer Reihe anlegen.
**Mittenabstand** bestimmt den Abstand entlang U; U ist die Projektion der
Welt-X-Richtung in die Kontaktfläche, bei paralleler X-Normale wird Welt Y
verwendet. V steht senkrecht dazu in der Fläche. **Versatz U/V** verschiebt die
gesamte Reihe. Zwischen Aufnahmen wird ausreichend Abstand für Spiel und
Mindestmaterial verlangt. Weitere Reihen können anschließend mit einem neuen
Werkzeugaufruf ergänzt werden, sofern die Materialprüfung erfolgreich ist.

## Was die Vorschau prüft

**Mindestmaterial** schützt die Umgebung der Verankerung und der Aufnahme sowie
das Material unter dem Sackloch. Vollständige konservative zylindrische Hüllen
um die Verbindungsstellen müssen in den jeweiligen Teilen liegen. Dazu wird
auch der Kreisquerschnitt konservativ umschlossen. Dünne Wände, vorhandene
Öffnungen, innere Hohlräume und fehlender Kontakt innerhalb dieser Hüllen führen
zur Ablehnung. Es werden keine Bohrungen automatisch gefüllt oder Wände verdickt.

Die ursprünglichen beiden Teile dürfen sich nicht bereits überschneiden.
Nach der Berechnung werden Stift und Aufnahme auf eine Materialüberschneidung
geprüft. Andere Material-Netzteile werden unabhängig von Sichtbarkeit und Sperre
als mögliche Nachbarn mitgeprüft. CAD-Nachbarn werden konservativ anhand ihrer
transformierten Begrenzungsquader berücksichtigt: Eine mögliche Berührung kann
deshalb auch dann gesperrt werden, wenn ein genauer CAD-Vergleich sie erlauben
würde. Ein beschädigtes Nachbarnetz im Prüfbereich wird ebenfalls abgewiesen.
Ansichtsvorlagen und Lochformen sind keine Materialnachbarn.

Das ist eine Prüfung der **Verbindungsstellen**, keine allgemeine
Wandstärken-, Festigkeits- oder Druckprüfung des gesamten Modells. Die angezeigte
Volumentoleranz und Netzpräzision gelten weiter. Die Kreisquerschnitte bestehen
aus 24–256 Abschnitten; die Vorschau nennt die Bogenabweichung. Die erforderliche
Druckerpassung hängt zusätzlich von Material, Ausrichtung und Drucker ab.

## Vorschau, Verlauf und Dateien

Anzeigeabstand und Originalvergleich ändern ausschließlich die Darstellung.
Übernommen und exportiert werden beide Teile in ihrer ursprünglichen Montagelage.
Während des Entwurfs sind Modellverschiebungen, unpassende Tastaturaktionen,
Dateiaufträge und Bedienmoduswechsel gesperrt. F passt die Ansicht ein.
**Abbrechen**, × oder Escape verwerfen auch verspätete Berechnungsergebnisse.
Geänderte Maße verwerfen die vorige Vorschau; geändertes Projekt oder geänderte
Auswahl schließen den Entwurf. Eine veraltete Vorschau kann nicht übernommen werden.

Die gemeinsame Übernahme erzeugt **einen Rückgängig-Schritt**. Kennungen,
jeweilige Farben, Deckkraft, Organisation, Notizen und vorhandene Herkunftsverweise
bleiben erhalten. Beide vollständigen ursprünglichen Teile mit bisheriger
Historie werden in beiden Ergebnisrezepten gespeichert. Damit bleibt auch die
vorherige Ebenenteilung nachvollziehbar. Gespeicherte Originale einer Verbindung
werden nicht einzeln geometrisch umgebaut, weil sonst das Gegenstück nicht mehr
passen könnte; für Änderungen Rückgängig verwenden oder beide Teile erneut
gemeinsam bearbeiten. Die allgemeinen Eigenschaften der fertigen Teile bleiben
verfügbar.

Geschützte, gesperrte, ausgeblendete oder offene Zielnetze sowie CAD-Körper und
Ansichtsvorlagen sind keine geeigneten direkten Ziele. Schutzbereiche müssen
vorher ausdrücklich im Flächenauswahlwerkzeug freigegeben werden.

Speichern und Wiederöffnen erhalten beide Teile und die Originalquellen. STL und
OBJ geben die bestätigten Teile aus; Anzeigeabstand und Vergleich werden nicht
exportiert. Projektformat 8, Arbeitsplatzformat 4 und das 50-MB-Projektlimit
einschließlich Historie bleiben bestehen. Neue Steckverbinderrezepte benötigen
Formnaro 0.43.0 oder neuer. Alte Programmversionen und Dateien bleiben erhalten.

Easy Tinker einschließlich CAD-/Netzbereichen und automatischem Reparaturversuch
bleibt Bestandteil der Anwendung. Das Spezialwerkzeug wird im Modus Normal
angeboten; bestätigte Ergebnisse können auch in Easy Tinker weiterverwendet werden.
Paket 21 und weitere neue Netzverfahren sind eigene Arbeitspakete.
