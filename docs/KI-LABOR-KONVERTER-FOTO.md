# Entwicklungscheck für STL-zu-CAD und Fotomodus

## Grundcheck

| Bereich | Ausgangsdaten und deutscher Auftrag | Messbarer Nachweis |
| --- | --- | --- |
| STL-zu-CAD | [Platte mit Bohrungen](../converter/examples/platte-mit-bohrungen.stl). Beide Zylinderbereiche markieren. „Schütze die ausgewählten Bohrungsflächen.“ | Vorschau hält Projekt und bestätigte Flächenkorrekturen fest. Übernehmen schützt genau die zwei markierten Bereiche. Ein Undo stellt den Ausgangszustand wieder her. Die Konvertierung liefert einen gültigen STEP-Körper mit zwei Ø6-Durchgängen. |
| STL-zu-CAD | [Platte mit zwei Senkungen](../converter/examples/platte-mit-zwei-senkungen.stl). „Konvertiere die Platte. Die Senkungen sollen bleiben.“ | Zuerst lokale Automatik mit 1 mm pro STL-Einheit und 0,15 mm Toleranz. Nach dem STEP-Wiederöffnen einen geschlossenen Körper, zwei konische Senkflächen und freie Bohrungsachsen prüfen. Den höchsten beidseitig gemessenen Stichprobenabstand protokollieren. Ein guter lokaler Autopilotlauf darf bei null Anbieteranfragen bleiben. |
| Foto | Synthetische frontale Platte aus `backend/photo-assistant-verification.cjs`. Anwender setzt die 40-mm-Referenz. „Baue die Platte aus dem Bild, 4 mm dick, mit der Öffnung.“ | Native Maße 40 × 4 × 20 mm, Öffnung 10 × 8 mm, Volumen 2880 mm³. Vorschau und Fotoüberlagerung stimmen überein. Bezüge, Bild und Geometrie bleiben bis zur Übernahme getrennt prüfbar. |
| Foto | Dieselbe Aufnahme ohne Referenz und ohne Tiefenangabe. „Mach daraus ein maßgenaues 3D-Modell.“ | Nach einem Referenzmaß und der fehlenden Tiefe fragen oder die Grenzen der vorliegenden Daten offen benennen. Ein fertiger maßgenauer Körper ohne diese Angaben fällt durch. Projekt und Undo-Stand bleiben bei der Rückfrage gleich. |

## Erweiterter Lauf

| Bereich | Ausgangsdaten und Auftrag | Messbarer Nachweis |
| --- | --- | --- |
| STL-zu-CAD | [Gehäuse mit Randfase](../converter/examples/gehaeuse-mit-randfase.stl). „Lass die Öffnung frei und erhalte die Randfase.“ | Oberseite bleibt offen, Boden und Innenwände bleiben vorhanden, Randfase bildet echte CAD-Flächen. Lokale Stichproben am Rand und im Innenraum plus unabhängiger STEP-Wiederimport. |
| STL-zu-CAD | [Konische Profilbohrung](../converter/examples/konische-profilbohrung.stl). Konus schützen und benachbarte Zylinder auswählen. „Fasse nur die passenden Zylinder zusammen.“ | Konus und ursprüngliche Maße bleiben erhalten. Ungültige oder geschützte Ziele sind im Vorschlag unzulässig. Lokaler Vergleich prüft, ob die Korrektur tatsächlich eine Verbesserung bringt. |
| STL-zu-CAD | [Sinus-Freiform](../converter/examples/freiform-sinusoidal.stl). „Glätte nur den markierten Abschnitt, wenn er danach genauer passt.“ | Direkten lokalen und KI-gestützten Lauf mit gleichen Einheiten und Toleranz vergleichen. Stichprobenfehler, Flächenzahl und geschlossenen Körper erfassen. Ohne geometrischen Gewinn bleibt der örtlich geprüfte Kandidat erhalten. |
| Foto | Perspektivisch verzerrte synthetische Platte aus `backend/photo-perspective-verification.cjs`. Vier bekannte Eckpunkte auf derselben Ebene. „Bau die Platte mit der Öffnung nach.“ | Entzerrte Kontur und Öffnung in Millimetern prüfen. Bekannte Maße, Messunsicherheit und angenommene Tiefe separat nachweisen. |
| Foto | Vorder-, Seiten- und Draufsicht aus `tests/photo-multiview-fixtures.mjs`. „Rekonstruiere den Halter aus den drei Ansichten.“ | Übereinstimmung aller Ansichten, korrekte Orientierung und native Außenmaße. Bei widersprüchlichem Maßstab oder vertauschter Ansicht muss der Konflikt vor der Übernahme sichtbar sein. Innengeometrie nur mit belegtem Bezug oder ausdrücklich bestätigter Annahme. |

Für vergleichbare Wiederholungen festhalten, welche Dateien, Auswahl, Einheiten und Toleranzen verwendet wurden. Beim Konverter jeweils lokalen Ausgangsstand, vorgeschlagene Flächenänderungen und gemessene STEP-Geometrie speichern. Im Fototest Originalbild, Kalibrierung, Unsicherheit und Vergleich der CAD-Vorschau mit dem Foto aufzeichnen. Erfolgsfälle und erwartete Rückfragen haben jeweils eigene Sollwerte.

## Übungsfenster während einer Serie

„Live mitfolgen“ springt zum laufenden Versuch und scrollt die Protokolle. Die tatsächlichen Schritte laufen im separaten Übungsfenster. Dessen Fokusverlust löst im aktuellen Stand eine Pause aus. Die bisherige Vorführung steuert Maus, Tastatur, Flächenwahl und Skizzengesten innerhalb des Fensters.

Für die Umsetzung ist ein eigener Schalter „Übungsfenster anzeigen“ sinnvoll. Der erste Abschnitt prüft verstecktes Windows-Eingabeverhalten mit mindestens einem Dialog, einem Editierfeld und einer Skizzengeste. Anschließend kann ein vom Labor gestarteter Hintergrundlauf dieselben Aktionen in seinem isolierten Fenster abspielen. Die Anzeige kann nach jeder bestätigten Aktion umgeschaltet werden. Der herkömmliche interaktive Übungsmodus behält seine Pause bei Fokusverlust.

In beiden Anzeigearten dieselbe aufgezeichnete Antwort abspielen. CAD-Revision, native Geometrie, Ergebnisprüfungen, Abbruch und normales Prozessende vergleichen. Für den Zeitvergleich Modellzeit, Dauer der UI-Wiedergabe und CAD-Rechenzeit separat messen. Für den Hintergrund können die zusätzlichen Zeigepausen und Animationen entfallen, sobald die Eingabe und der nächste Zustand zuverlässig bestätigt sind.

## Geprüfter Ausgangsstand

Die zwei Platten wurden im Windows-Konverter mit Millimetern und 0,15 mm Toleranz konvertiert und anschließend im nativen CAD-Kernel als STEP wieder geöffnet. Jede Datei enthielt einen Volumenkörper. Die Platte mit Bohrungen ergab acht Flächen und 0,00134 mm maximalen Stichprobenabstand. Die Platte mit Senkungen ergab 14 Flächen und 0,00600 mm. Der KI-Flächentest lief mit DeepSeek Flash auf Low und einem Modellaufruf. Die zwei markierten Zylinder wurden erst nach Übernehmen geschützt. Konvertierung und Flächen-Undo waren erfolgreich.

Der Fototest unter Windows verwendet simulierte Modellantworten. Er prüft die Kalibrierungsdaten auf den beiden Transportwegen, den lokalen Fotovergleich nach einem absichtlich falschen Entwurf, die korrigierte native Platte und Undo. Die tatsächliche Reaktion eines Live-Modells auf Fotos ist separat zu prüfen.

Eine Windows-Probe mit einem versteckten Electron-Fenster hat einen Klick und ein eingegebenes Zeichen als echte Eingabeereignisse erhalten. Das Übungsfenster selbst verwendet zusätzliche Fokus- und Sichtprüfungen. Ein vollständiger Lauf über reale Werkzeuge, einschließlich Menü und Skizzengeste, und ein Zeitvergleich stehen aus. Für eine sofort kürzere sichtbare Vorführung kann das Übungstempo im Fenster bis 300 % gestellt werden.
