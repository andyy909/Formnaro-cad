# Formnaro CAD 0.19.0 – Paket 7

„KI-Markierungen“ in der Werkzeugleiste oder unter Funktionen öffnen. Mit einem
ausgewählten fertigen CAD-Teil werden dessen Markierungen angezeigt; ohne Auswahl
erscheinen alle Markierungen. Eine sichtbare Modellstelle anklicken, Hinweis,
Farbe und Radius eingeben und die Vorschau berechnen. „Übernehmen“ speichert
die geprüfte Markierung mit genau einem Undo-Schritt. Abbrechen, Schließen,
Escape, Auswahlwechsel oder eine veraltete Vorschau erhalten das Modell.
Laufende native Prüfungen können durch Beenden des CAD-Workers abgebrochen werden.

Die Liste bietet „Bearbeiten“ und „Entfernen“. Änderungen an Hinweis, Farbe oder
Radius, das Anklicken einer neuen Modellstelle beim Bearbeiten sowie das Entfernen durchlaufen jeweils Vorschau und Übernahme. Hinweise
und Markierungskennungen bleiben beim Bearbeiten erhalten. Kopieren, Duplizieren
und Bibliotheksvorlagen erhalten unabhängige Kennungen. Der Quellenbaum zeigt
Markierungen und ihre Hinweise auch innerhalb von Gruppen.

Markierungen enthalten einen lokalen Punkt und eine nativ ermittelte Normale.
Punkt, Kreis und Hinweis folgen der vollständigen Objekttransformation und allen
übergeordneten Quellenmatrizen. Spiegelung und Scherung bleiben berücksichtigt;
der Radius wird in lokalen Millimetern gespeichert und mit der Quelle transformiert.
Die Weltnormale wird mit der inversen transponierten Matrix berechnet.

Native getrimmte Flächen entscheiden die Zuordnung. Der Punkt muss genau einer
Fläche gehören; Kantenpunkte mit mehreren möglichen Flächen werden abgewiesen.
Nach Geometrieänderungen werden auch erhaltene Quellenmarkierungen gegen den
fertigen äußeren Körper geprüft. Entfernt beispielsweise eine Bohrung die
markierte Fläche, bleibt der Hinweis sichtbar als „Veraltet“. Verlorene und
mehrdeutige Punkte erhalten keine gültige Weltnormale im KI-Kontext. Gespeicherte
Flächenindizes dienen nicht als dauerhafte Zuordnung. Ein Flächenfingerabdruck
dokumentiert den nativen Bezug. Beschädigte oder falsche Zustandsbehauptungen in
einer Datei werden bei der nativen Prüfung erneut bewertet.

Markierungen speichern als CAD-Dateiformat 7. Projekte ohne erweiterte Inhalte
bleiben Format 5; vorhandene CAD-5-Dateien bleiben lesbar, Netzformat 6 bleibt
getrennt. Die CAD-7-Sicherungen und Bibliotheksbestände aus Paket 4 werden genutzt.

„Modellbild anhängen“ im vorhandenen KI-Chat nimmt direkt den aktuellen CAD-Canvas
auf, einschließlich Markierungen und Beschriftungen. Das PNG erscheint als Anhang.
Der Nachrichtentext und der bisherige Chat bleiben erhalten. Anhängen sendet
keine Nachricht; erst „Senden“ überträgt Text, Anhänge und Kontext an den
eingerichteten Anbieter. Die bestehenden Grenzen von vier Bildern und insgesamt
12 MB pro Nachricht gelten weiterhin. Anhänge lassen sich vor dem Senden entfernen.

Die lokale API bleibt Version 1 mit unveränderten MCP-Werkzeugnamen. `mark`
adressiert ein sichtbares, entsperrtes fertiges CAD-Teil und verwendet `point`
mit `space: "local"` oder `"world"`, alternativ einen Weltstrahl `ray`.
`note`, `color` und `radius` beschreiben den Hinweis. `editMark` und `removeMark`
verwenden die Markierungs-ID und den aktuellen Quellenpfad. `editMark` kann auch einen neuen nativ geprüften `point` mit `space` oder einen Weltstrahl `ray` verwenden; die Kennung bleibt erhalten. Der Szenenkontext
enthält lokale und Weltpunkte, lokale und gültige Weltnormalen, Status und Grund.
Alle Modelländerungen benötigen die aktuelle Revision und Vorschau vor Übernahme.

Die Abnahme prüft native Grundformen und STEP-Eingänge, gekrümmte Flächen,
Hohlräume, Gruppenquellen, Ebenenteilung und volle affine Matrizen. Maus- und
Tastaturprüfungen kontrollieren Vorschau, Bearbeiten, Entfernen, exaktes Undo/Redo,
Speichern/Öffnen, Bibliothek, Abbruch, Sperren sowie Canvas-Anhänge ohne Senden.
Die portable Ausgabe enthält passende Quellen, Lizenzen und Prüfnachweise und
ersetzt keine bestehende Installation automatisch.
