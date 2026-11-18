# KI-Labor im Konstruktionsalltag

Der Ausgangspunkt ist ein bereits modelliertes Teil mit stabilen IDs. Der Auftrag enthält nur den kurzen deutschen Text und die Auswahl, die ein Anwender sehen würde. Maße, Merkmale und Bezüge liest das Modell aus dem Programm. Der Prüfer erhält die Sollwerte separat. Diese Fälle können als eigener Entwicklungsplan laufen. Die Referenzsuiten bleiben an ihren bestehenden Fallbestand gebunden.

| Auftrag | Ausgangslage | Erwarteter Nachweis |
| --- | --- | --- |
| „Mach die Platte rechts 20 mm länger. Lass die Bohrungen, wo sie sind.“ | Platte 40 × 30 × 10 mm, zwei Durchgangsbohrungen | Länge 60 mm, linke Kante fest, beide Bohrungsachsen, Durchmesser und Durchgängigkeit erhalten |
| „Mach beide Bohrungen auf 8 mm. Die Lage bleibt.“ | Platte mit zwei Ø4-Bohrungen, gemeinsames Durchmessermaß | Beide Ø8, dieselben Achsen und Merkmal-IDs, gleiche Außenmaße, gemeinsame Formel bleibt erhalten |
| „Setz die Bohrungen 30 mm auseinander. Die Mitte zwischen ihnen bleibt gleich.“ | Zwei Ø8-Bohrungen im Abstand von 20 mm | Achsabstand 30 mm, gemeinsamer Mittelpunkt erhalten, beide Ø8, gleiche Bohrungsrichtung und Außenmaße |
| „Mach nur die beiden vorderen auf 8 mm.“ | Vier Bohrungen auf einem gedrehten Teil in einer Baugruppe, Vorderkante eindeutig ausgewählt | Nur die beiden Bohrungen an dieser Kante werden Ø8. Die beiden anderen Bohrungen und das Nachbarteil behalten ihre Geometrie |
| „Links sollen 12 mm Platz bleiben.“ | Eine gewählte Bohrung neben einer gewählten linken Bezugskante | Bei fehlendem Bezugspunkt zwischen Lochrand und Achse gezielt nachfragen. Nach der Antwort das gemeinte Maß prüfen und die zweite Bohrung erhalten |
| „Mach die Bohrung größer.“ | Zwei ähnlich sichtbare Bohrungen, keine ausgewählt, kein Zielmaß | Eine kurze Rückfrage nach Bohrung und Maß. Bei Abbruch bleiben Revision, Geometrie und Undo-Historie erhalten |
| „Noch 5 länger, Abstand so lassen.“ | Unmittelbarer Folgeauftrag nach der Verlängerung auf 60 mm | Länge 65 mm, vorher gewählte Seite und gemessener Bohrungsabstand erhalten. Ein Undo führt zurück zum 60-mm-Stand |
| „Mach aus dem Sackloch ein Durchgangsloch.“ | Ein Sackloch mit erkennbarem Grund, eine benachbarte Bohrung | Zylinderachse und Durchmesser erhalten, Restboden fällt weg, Werkzeugweg und Nachbarbohrung bleiben separat prüfbar |
| „Übernimm das auch für die rechte Platte.“ | Zwei ähnliche Teile mit eigenen Referenzen, eine dritte Platte außerhalb des Auftrags | Nur freigegebene rechte Platte erhält dasselbe bestätigte Maß. Nach einer Änderung der Referenz seit der Vorschau wartet die Anwendung auf eine neue Auswahl oder Vorschau |

## Nachweise pro Fall

- Ausgangs- und Endrevision mit Bauteil- und Merkmal-IDs protokollieren. Auswahl, Koordinatensystem und bei Bedarf Kantenbezug festhalten.
- Vorgeschlagene Werkzeugaufrufe und ausgewählte Ziele aufzeichnen. Vorschau und tatsächlich übernommenes Modell getrennt prüfen.
- Außenmaße, Zylinderachsen, Durchmesser, Achsabstände und Durchgängigkeit am nativen Körper messen. Den Messwert vor und nach der Änderung aufzeichnen. Bei zusammengesetzten Aufträgen jede Vorgabe einzeln bewerten.
- Unbeteiligte Geometrie sowie gegebene Formeln, Bindungen und Sperren vergleichen. Für Rückfrage und Abbruch die unveränderte Revision nachweisen. Nach Übernahme das Ergebnis von Undo und bei einem Wiederholungsfall auch das Ergebnis von Speichern und Öffnen protokollieren.
- Bei der Auswertung festhalten, ob die KI Ziel oder Bezug verwechselte, ein Maß falsch umsetzte oder eine erforderliche Rückfrage ausließ. Prüfer- und Providerfehler anhand der jeweiligen Ursache erfassen.

Die ersten drei Zeilen haben einen gemeinsamen lokalen Regressionstest. Der Test führt die drei kurzen Aufträge nacheinander über die KI-Anfrage und den nativen Vorschau-/Übernahmepfad. Für die Modellantwort verwendet er festgelegte Befehle und prüft das entstandene Modell einschließlich Undo. Das Sprachverständnis der Aufträge ist erst Gegenstand eines eigenen Providerlaufs.

```powershell
node --test --test-name-pattern="Everyday plate edits" tests/cad-ai-feature-dependencies.test.mjs
```
