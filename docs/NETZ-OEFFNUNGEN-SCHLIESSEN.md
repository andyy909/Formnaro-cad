# Öffnungen im Netz schließen – Paket 18

Formnaro 0.37.0: Ein sichtbares, entsperrtes vollständiges Netzteil auswählen und
**Öffnung schließen …** öffnen. **Ansehen** richtet die Kamera auf einen Rand.
Einen Rand ausdrücklich auswählen; seine ursprünglichen Kanten werden orange
markiert. **Vorschau** berechnet die neue Füllung. Über **Vergleich** zwischen
Original und geschlossener Vorschau wechseln. Erst **Übernehmen** ändert das
Projekt mit einem gemeinsamen Rückgängig-Schritt. **Abbrechen**, × oder Escape
verwirft den Entwurf, auch während der Berechnung. F passt die Ansicht ein.

Kein Rand ist vorausgewählt. Pro Vorgang wird genau ein Rand geschlossen;
weitere Öffnungen bleiben offen. **Auch eine absichtliche Bohrung kann durch die
ausdrückliche Auswahl verschlossen werden.** Vor dem Übernehmen kontrollieren.
Die automatische Unterscheidung zwischen Fehler und beabsichtigtem Durchbruch
ist nicht Teil dieses Werkzeugs.

Geeignet sind einfache ebene Randringe mit 3 bis 512 Kanten, auch konkave Ränder
und gerade unterteilte Kanten. Exakt gleiche STL-Koordinaten werden für die
Randprüfung logisch zugeordnet. Gespeicherte Punkte, vorhandene Dreiecke und
deren Reihenfolge bleiben exakt erhalten. Nur neue Dreiecke kommen hinzu; keine
Punkte werden projiziert, verschmolzen oder verschoben. Die neue Randrichtung
passt zu den vorhandenen Nachbarflächen.

Verzweigte, sich berührende oder überschneidende Ränder, beschädigte Nachbarn,
getrennte Punktfächer sowie numerisch uneindeutige Fälle werden abgewiesen.
Gekrümmte oder zu große Ränder sind für dieses einfache Werkzeug ungeeignet.
Die zulässige Ebenenabweichung beträgt 0,000001 % der größten lokalen
Rand-Ausdehnung. Der Bericht zeigt die gemessene lokale Ebenenabweichung;
dies ist keine garantierte Formabweichung des gesamten Modells, insbesondere
bei Skalierung des Objekts. Bestehende Punkte bleiben auch innerhalb dieser
kleinen Toleranz unverändert.

Die Vorschau prüft vorhandene Flächen am Füllbereich. Eine Scheibe über einem
weiteren Innenrand oder einer kreuzenden Fläche wird verweigert. Mehrere Ränder
zu einer Ringfläche zu verbinden, größere gekrümmte Füllungen und neue
Flächenmodelle bleiben späteren Paketen vorbehalten. Eine Öffnung zu schließen
ist kein Nachweis eines gültigen oder druckbaren Körpers. Körperwerkzeuge
benötigen weiter ihre eigene Prüfung; Selbstüberschneidungen und Wandstärken
werden durch dieses Werkzeug nicht allgemein geprüft.

Schutzbereiche müssen vor einer Geometrieänderung im Auswahlwerkzeug separat
und ausdrücklich freigegeben werden. Sperren bleiben wirksam. Projekt- oder
Auswahländerungen verwerfen die Vorschau; ein veraltetes Ergebnis kann nicht
übernommen werden. Während des Entwurfs sind unpassende Bearbeitungsaktionen,
Dateiaufträge und KI-Änderungen gesperrt.

Originalteil und komplette bisherige Quellen bleiben im Projekt gespeichert.
Bisherige Flächenmarkierungen werden nach der Geometrieänderung ungültig und
müssen neu gewählt werden. Speichern/Wiederöffnen erhält Ergebnis und Quellen;
STL und OBJ exportieren das bestätigte vollständige Objekt. Andere Teile,
CAD-Quellen, Lage, Farben, Deckkraft und Organisation bleiben erhalten.
Projektformat 8 und Arbeitsplatzformat 4 bleiben kompatibel. Das gemeinsame
50-MB-Projektlimit umfasst auch die vollständige Quellenhistorie; bei sehr
dichten Netzen kann diese Grenze vor der Dreiecksgrenze erreicht werden.

Die neue Ausgabe separat vollständig entpacken und App/Formnaro.exe starten.
Bisherige Programme und der eigenständige STL-STEP-Konverter bleiben erhalten.
