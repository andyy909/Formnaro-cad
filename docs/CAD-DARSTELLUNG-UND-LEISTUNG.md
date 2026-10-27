# Formnaro CAD 0.20.0 – Paket 8

Die Darstellung zeichnet bei Änderungen von Modell, Kamera, Auswahl, Griffen,
Vorschau, Schnittansicht, Thema oder Fenstergröße. Mehrere Änderungen vor dem
nächsten Bild werden zusammengefasst. Nach dem Auslaufen der Kamera gibt es
keine laufende Zeichenschleife und keine wiederholten Aktualisierungen der
Maßanzeigen, Fangziele oder Markierungsbeschriftungen.

Kameradämpfung bleibt erhalten. Kleine Restbewegungen werden weiter berechnet,
auch wenn OrbitControls bereits keine sichtbare Änderung meldet. Dabei entfallen
unnötige GPU-Bilder. An der numerischen Genauigkeitsgrenze wird der verbleibende
Rest vollständig verarbeitet und die endgültige Kamera einmal gezeichnet. Der
nächste Bedienvorgang übernimmt keinen alten Dämpfungsrest.

Vorschauen, Ausrichtungsbilder, native Kanten, Messlinien, Schnittkörper und
KI-Markierungen lösen ebenfalls eine Aktualisierung aus. Canvas-Bilder warten
auf einen aktuellen Renderdurchlauf. Die Aufnahme erzwingt diesen auch bei pausiertem Browser-RAF, etwa in einem minimierten Fenster. Dadurch bleiben „Modellbild anhängen“ und
die lokale Screenshot-API auch bei ruhender Darstellung aktuell. Die lokale
API bleibt Version 1 mit derselben PNG-Antwort.

Native Geometrie-, Anzeige-, Prüf- und Export-Caches sowie die gecachte
Serialisierung des bestätigten Modells bleiben erhalten. Die Änderung betrifft
die Darstellung; Formparameter, präzise CAD-Geometrie, Quellen, Historie und
Dateiformate bleiben durch die bisherigen Verträge geschützt.

## CAD-Messungen

Die Prüfung verwendet 32 geschlossene native Quader mit jeweils
12 × 16 × 10 mm, insgesamt 61.440 mm³, in einem isolierten Desktop-Profil.
Verglichen wird die vorherige native CAD-Ausgabe 0.19.0, keine Netz-Version.
Die Entwicklungsaufnahme ergab:

| Beobachtung | CAD 0.19.0 | CAD 0.20.0 |
|---|---:|---:|
| Zeichnungen in einer ruhenden Sekunde | etwa 61 Renderer-Durchläufe | 0 |
| Anzeigeaktualisierungen in der ruhenden Sekunde | kontinuierlich | 0 |
| Frame-Abfragen in der ruhenden Sekunde | kontinuierlich | 0 |
| Native WASM-Heapgröße der Szene | 100 MiB | 100 MiB |

Die gemessene JavaScript-Heapbelegung lag bei etwa 13,4 MB beziehungsweise
14,3 MB. Daraus folgt keine Zusage eines kleineren Modell- oder Heap-Speichers.
500 Abrufe der gecachten Modellserialisierung benötigten in dieser Aufnahme
etwa 0,2 ms. Drei vollständige Worker-Abfragen ergaben zusammen 318.876 Byte
ausgehende und 66.591 Byte eingehende UTF-8-JSON-Nutzlast, mit etwa 5,6–6,3 ms
beobachteter Anfragezeit. Diese Zahlen sind konkrete Aufnahmen auf dem
Prüfrechner und keine Zusage für andere Modelle oder Geräte.

Die optional aktivierte Nutzlastmessung serialisiert ausschließlich zur
Beobachtung; sie ist im normalen Betrieb ausgeschaltet. Die angegebenen
JSON-Bytes sind keine Messung des internen Chromium-Transportformats. Die
Anfragezeiten enthalten den Aufwand der Beobachtung. Die gepackte EXE erzeugt
eigene Prüfmessungen; diese liegen bei den Freigabenachweisen.

Selektive native Worker-Übertragung bleibt ein späterer Ausbau mit eigenem
Revisions- und Abhängigkeitsvertrag. Dieses Paket verändert weder die
übertragenen Projekte noch den bestehenden Worker-Abbruch.

## Abnahme und Verwendung

Echte Mausbewegungen prüfen Drehen und vollständige Dämpfung gegen eine weiter
berechnete Referenz. Die Abnahme prüft außerdem ruhende Darstellung, Auswahl,
zusammengefasste Änderungen, Thema, Projektion, Größe, Vorschauen, Markierungen,
Ausrichtung, native Schnittansicht, aktuelle Canvas-Bilder und erhaltene Caches.
Die bisherigen sieben Pakete werden gemeinsam erneut geprüft.

Die portable Ausgabe enthält die passende Anwendung, Quellen, Kernel- und
Konverterquellen, Lizenzen und Prüfnachweise. Separat entpacken und starten.
Vorhandene Installationen, Modelle und Profile werden nicht automatisch ersetzt.
