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

„Live mitfolgen“ springt zum laufenden Versuch und scrollt die Protokolle. Der Schalter „Übungsfenster anzeigen“ unter „Einfach → Entwicklungscheck“ legt vor dem Start fest, ob das separate Übungsfenster sichtbar ist. Beide Einstellungen führen die nativen Maus-, Tastatur- und Skizzenschritte im isolierten Fenster aus. Der Hintergrundlauf überspringt Vorführpausen. Für interaktive Übungen gilt die Pause bei Fokusverlust.

Der Vergleich in derselben Windows-Testkopie verwendet 15 gespeicherte Flash-Low-Pläne, dieselben Ausgangsfälle und 300 % Übungstempo. Beide Serien erreichten 15 von 15 nativen Erfolgen. Die Messbefunde und die gespeicherten CAD-Körper stimmten paarweise überein. Sichtbar dauerte die Serie 7:41 Minuten und ausgeblendet 11:54 Minuten. In den Aufzeichnungen sind die Abstände zwischen den einzelnen Eingaben im Hintergrund länger.

## Geprüfter Ausgangsstand

Die zwei Platten wurden im Windows-Konverter mit Millimetern und 0,15 mm Toleranz konvertiert und anschließend im nativen CAD-Kernel als STEP wieder geöffnet. Jede Datei enthielt einen Volumenkörper. Die Platte mit Bohrungen ergab acht Flächen und 0,00134 mm maximalen Stichprobenabstand. Die Platte mit Senkungen ergab 14 Flächen und 0,00600 mm. Der KI-Flächentest lief mit DeepSeek Flash auf Low und einem Modellaufruf. Die zwei markierten Zylinder wurden erst nach Übernehmen geschützt. Konvertierung und Flächen-Undo waren erfolgreich.

Der Fototest unter Windows verwendet simulierte Modellantworten. Er prüft die Kalibrierungsdaten auf den beiden Transportwegen, den lokalen Fotovergleich nach einem absichtlich falschen Entwurf, die korrigierte native Platte und Undo. Die tatsächliche Reaktion eines Live-Modells auf Fotos ist separat zu prüfen.

Eine Windows-Probe mit einem versteckten Electron-Fenster hat einen Klick und ein eingegebenes Zeichen als echte Eingabeereignisse erhalten. Der gepackte Entwicklungscheck hat anschließend auch die nativen Werkzeuge und Skizzengesten im ausgeblendeten Fenster ausgeführt.
