# Gesamtplan: Anforderungen Punkte 21 bis 25

**21. Nach jeder Änderung eine verständliche Zusammenfassung liefern.**

- Betroffene Bauteile, neue Revision und wesentliche Änderungen an Maßen oder Positionen zurückgeben.

- Tatsächlich ausgeführte Prüfungen und neue Warnungen vollständig aufführen.

- Ganze Szenen und ausführliche Quellen nur auf Wunsch mitsenden.

- Bei einer noch offenen Vorschau deren Kennung und die zulässigen nächsten Aktionen nennen.

**Fertig, wenn:** Die KI eine kleine Korrektur beurteilen kann, ohne das gesamte Modell erneut einzulesen. Fehler und Warnungen dürfen durch die Kurzfassung nicht verschwinden.

## Etappe 5 Bewegungen vorführen und automatisch koppeln

**22. Bewegungen und GIF-Aufnahmen ohne dauerhafte Übernahme pro Bild ermöglichen.**

- Für die Wiedergabe vorhandene Anzeigegeometrie über die tatsächlichen Gelenkmatrizen bewegen und den Anzeigecache wiederverwenden.

- Während der bloßen Wiedergabe keine impliziten nativen Geometrieneukonstruktionen, Szenenmessungen oder dauerhaften Übernahmen pro Bild ausführen.

- Vorhandene Kopplungen mitführen. Die Schraubtrieb- und Spindelantriebkopplungen aus den folgenden Schritten anschließend in dieselbe Wiedergabe integrieren.

- Ausdrücklich angeforderte Kollisions- und Abstandsmessungen als eigene abbrechbare Prüfaufträge behandeln.

- X, Y, Z und Tischneigung einzeln sowie gemeinsam vorführen können. Beschriftung und angezeigte Werte müssen aus denselben Bewegungsdaten wie die Darstellung stammen.

- Einzelbilder und GIF zuverlässig erfassen; einen unvollständigen Aufnahmestand als solchen kennzeichnen.

- Nach Abschluss, Abbruch oder Aufnahmefehler die ursprüngliche Anzeigestellung wiederherstellen. Modellrevision, Quellen und Undo dürfen durch die Aufnahme nicht verändert werden.

**Fertig, wenn:** Eine beschriftete Bewegungsaufnahme ohne native Konstruktions- oder Messaufrufe pro Bild entsteht. Modellrevision und Undo sind danach unverändert; Abbruch und Aufnahmefehler hinterlassen keine offene Bewegungsvorschau. Nach Ergänzung der Kopplungen bleiben die Anschlusspunkte auch in der Aufnahme verbunden.

**23. Schraubtriebkopplung ergänzen.**

- Die vorhandene Zahnradkopplung zu einer gemeinsamen Grundlage für lineare Bewegungsbeziehungen erweitern.

- Ein Drehgelenk mit einem Schiebegelenk verbinden.

- Vorschub je Umdrehung, Drehsinn und Nullstellung speichern. Bei mehrgängigen Gewinden gilt Steigung mal Gangzahl als Vorschub je Umdrehung.

- Bewegung von beiden Seiten aus ermöglichen.

- Widersprüchliche Vorgaben und überschrittene Grenzen vor der Übernahme zurückweisen.

**Fertig, wenn:** Bei 4 mm Vorschub je Umdrehung 360° genau 4 mm Verschiebung erzeugen; vorhandene Zahnradkopplungen weiterhin funktionieren.

**24. Einen schwenkbaren Spindelantrieb als eigene Kopplung ergänzen.**

- Die vorhandene Baumstruktur der Körper erhalten.

- Eine zusätzliche Beziehung für eine ebene Mechanik mit Tischdrehachse, zwei Anschlusspunkten, schwenkbarem Antrieb und veränderlicher Länge speichern.

- Aus Tischwinkel automatisch Antriebswinkel und Auszug berechnen.

- Umgekehrt aus Auszug beziehungsweise gekoppelter Spindeldrehung den Tischwinkel bestimmen.

- Bei mehreren mathematischen Lösungen die zur bisherigen Stellung fortlaufende Lösung innerhalb der Grenzen verwenden; Mehrdeutigkeit und unerreichbare Stellungen ausdrücklich melden.

- Zunächst eine solche nichtlineare Beziehung je zusammenhängendem Antrieb unterstützen.

**Fertig, wenn:** Der Kipptisch über den Bereich −15° bis +15° bewegt werden kann und beide Anschlüsse ohne manuell mitgesetzte Hilfswerte verbunden bleiben. Ein universeller räumlicher Gelenklöser gehört nicht zu dieser ersten Erweiterung.

## Etappe 6 Bewegungsprüfungen und Prüfstände vervollständigen

**25. Bewegungsbereiche prüfen können.**

- Die bestehende Prüfung einer Einzelstellung um einen Bereich einer antreibenden Größe erweitern.

- Abhängige Bewegungen über die neuen Kopplungen berechnen.

- Zunächst ausdrücklich gewählte Bauteilpaare prüfen.

- Standardschritte von 1° beziehungsweise 1 mm verwenden; maximal 501 Stellungen je Auftrag.

- Den Vorgang abbrechbar machen und bei Zeit- oder Mengenbegrenzung den ungeprüften Rest nennen.

- Gefundene Kollisionen mit Bauteilpaar und genauer Stellung zurückgeben.

**Fertig, wenn:** Eine Kollision in einer Zwischenstellung gefunden wird, obwohl Anfang und Ende frei sind. Das Ergebnis wird ausdrücklich als Prüfung der berechneten Stichproben bezeichnet.

