# Beschädigte Netzbereiche löschen und ersetzen – Paket 24

Formnaro 0.47.0 entfernt ausdrücklich ausgewählte Dreiecke und ersetzt den
Bereich durch eine neue ebene Füllfläche. Eine eingedrückte, unruhige oder falsch
orientierte Oberseite mit geeignetem Rand kann so neu geschlossen werden.
Die Vorschau zeigt die wirkliche Formänderung; sie wird erst mit **Übernehmen**
Teil des Projekts.

## Bedienung

1. Im Modus **Normal** ein sichtbares, entsperrtes Netzteil wählen.
2. Mit **Netzflächen auswählen …** genau den beschädigten Bereich auswählen und
   die Auswahl übernehmen. Benötigte Bohrungs- und Anlageflächen vorher als
   Schutzbereich festhalten. Geschützte Dreiecke dürfen nicht zur Löschfläche gehören.
3. **Netz-Werkzeuge → Netzbereiche ersetzen …** öffnen. Ohne passende übernommene
   Auswahl bleibt die Vorschau gesperrt. Der Knopf **Netzflächen auswählen …**
   führt zurück zur Auswahl.
4. **Vorschau** berechnet den Rand, entfernt die gewählten Dreiecke und erzeugt
   die Füllung. Es gibt keine automatische Vergrößerung der Auswahl.
5. **Original**, **Ergebnis** und **Überlagerung** aus derselben Kamera vergleichen.
   In der Überlagerung sind die tatsächlich entfernten Flächen rot und die neuen
   Ersatzflächen grün. Die Markierungen und Dreieckskanten lassen sich ausblenden.
6. Dreieckszahlen, Oberfläche, Außenmaße und die ausdrücklich als Stichprobe
   bezeichnete Abweichung prüfen. Eine gewollte Erhebung oder Vertiefung innerhalb
   der Auswahl kann ebenfalls verschwinden. **Übernehmen** erzeugt einen einzigen
   Rückgängig-Schritt. **Abbrechen** oder Escape erhält das Original unverändert.

## Geeignete Bereiche und Grenzen

Die Auswahl muss einen zusammenhängenden scheibenförmigen Bereich mit genau
einem einfachen ebenen Rand bilden. Dieser Rand muss vollständig von erhaltenen
Nachbarflächen umgeben sein. Bis zu 512 Randkanten, 10.000 ausgewählte Dreiecke
und 30.000 Dreiecke im gesamten Teil sind vorgesehen.

Geeignete innere Schäden wie umgekehrte Dreiecke oder doppelte und exakt
entartete Zusatzflächen können in der ausgewählten Fläche liegen. Ihr verbleibender
geometrischer Träger muss trotzdem einen eindeutigen Bereich ergeben.
Beschädigte Nachbarflächen außerhalb der Auswahl werden nicht still repariert.

Mehrere Ränder, enthaltene Öffnungen, Verzweigungen, Punktkontakte, nicht ebene
oder sich selbst berührende Ränder werden abgewiesen. Die Auswahl darf keinen
vorhandenen offenen Außenrand und nicht das ganze Teil umfassen. Weitere offene
Ränder außerhalb der Auswahl können erhalten bleiben; das Ergebnis wird dann
ausdrücklich als offen gemeldet. Zwei getrennte offene Ränder werden hier nicht
überbrückt. Make Solid und Aushöhlen bleiben eigene spätere Pakete.

Die Füllung verwendet bestehende Randpunkte. Kein gespeicherter Punkt wird
verschoben, zusammengelegt oder projiziert. Die ausgewählten ursprünglichen
Dreiecke entfallen; neue Dreiecke werden angehängt. Alle nicht ausgewählten
Dreieckskoordinaten und ihre Reihenfolge bleiben exakt erhalten. Unbenutzte
ursprüngliche Punkte bleiben als Daten erhalten und zählen bei den gemeldeten
Oberflächen-Außenmaßen nicht mit.

## Schutz und Prüfung

Alle Schutzflächen außerhalb der Auswahl bleiben geometrisch exakt erhalten.
Ihre Dreiecksnummern werden an die neue Reihenfolge gebunden; Namen, Kennungen
und Zwecke bleiben bestehen. Die gemeinsame Transaktion überprüft die geschützten
Dreieckskoordinaten unabhängig von der Berechnung. Veraltete Schutzbereiche oder
Auswahlen müssen zuerst erneut geprüft beziehungsweise übernommen werden.

Der Rand wird auf Eindeutigkeit und Ebenheit untersucht; die neue Füllung darf
keine erhaltenen Flächen oder Innenränder überdecken beziehungsweise kreuzen.
Topologie und Randverbindungen werden vor und nach dem Ersetzen verglichen.
Zusätzlich werden die tatsächlich erzeugten Ersatzdreiecke gegen erhaltene
Flächen und untereinander auf Überschneidungen geprüft, auch im kleinen
Toleranzbereich eines fast ebenen Randes. Höchstens 500.000 nahe Dreieckspaare
und zwei Millionen Suchschritte; unklare sehr dünne Flächen werden abgewiesen.
Unveränderte Außenflächen werden untereinander nicht vollständig auf
geometrische Selbstüberschneidungen untersucht.
Ein topologisch geschlossenes Ergebnis muss zusätzlich die unabhängige
Körperprüfung bestehen. Ein beschädigtes Original besitzt möglicherweise kein
verlässliches Volumen; dann wird keine Volumenänderung erfunden.

Die angezeigte beidseitige Oberflächenabweichung stammt aus begrenzten
deterministischen Punkt-, Kantenmittelpunkt- und Flächenstichproben des entfernten
und des neuen Bereichs. Sie ist kein garantierter globaler Maximalfehler.
Maße, Volumen und echte Formmerkmale dürfen sich ändern. Die Prüfung ist kein
allgemeiner Reparatur-, Kollisions-, Festigkeits- oder Druckbarkeitsnachweis des
gesamten Modells. Nicht sicher geeignete Fälle lassen das Original unverändert.

## Original, Speicherung und separate Ausgabe

Die vollständige Originalquelle bleibt im Verlauf gespeichert. Herkunft, Lage,
Name, Organisation, Farbe und Deckkraft bleiben erhalten. Das Rezept verwendet
Netzquellformat 3 und benötigt mindestens Formnaro 0.47.0; Projektformat 8 und
Arbeitsplatzformat bis 4 bleiben bestehen. Historische Geometrieänderungen am
Original sind gesperrt; dafür Rückgängig verwenden und den Bereich neu wählen.

Easy Tinker verwendet dasselbe Projekt und dieselbe Historie. Das neue Werkzeug
befindet sich im Modus Normal. Die aktuelle Ausgabe liegt separat unter
`F:/Formnaro-Ausgaben/Bereiche-Ersetzen-v0.47.0/Formnaro-win32-x64/Formnaro.exe`.
Die vollständige ZIP separat entpacken und `App/Formnaro.exe` starten. Quellen,
Lizenzen, Anleitungen und synthetische Prüfnachweise liegen bei. Frühere Ausgaben
bleiben erhalten. Maßgeblich sind `work/mesh-erase-fill/checks/final-audit.json`
und `delivery.json`.
