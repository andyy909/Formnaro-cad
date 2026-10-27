# Netzflächen und Öffnungsränder auswählen

Formnaro 0.33.0 ergänzt Paket 14 des gemeinsamen Programms. Ein bearbeitbares
Netzteil auswählen und **Netzflächen auswählen** öffnen. Die Auswahl erscheint
farbig auf dem vorhandenen Netz. CAD-Körper werden vorher nur über den
aufgerufenen Befehl **CAD → Netzkopie** in ein zusätzliches Netz umgewandelt.

## Ein Dreieck, eine Oberfläche oder einen Bereich wählen

Im Auswahlfenster stehen vier Arten zur Verfügung:

| Art | Wirkung |
|---|---|
| **Dreieck** | Ein sichtbares ursprüngliches Netzdreieck anklicken. |
| **Oberfläche** | Vom angeklickten Dreieck über geeignete gemeinsame Kanten wachsen; der Winkel begrenzt jeden Schritt zu einem Nachbardreieck. |
| **Zusammenhängend** | Die über geeignete gemeinsame Kanten verbundene Komponente auswählen. Ein getrennter Materialteil oder ein bloßer Berührungspunkt verbindet keine Komponenten. |
| **Öffnungsrand** | Den nächstgelegenen geeigneten offenen Randring der angeklickten Komponente markieren. Die Auswahl enthält Kanten, keine zusätzlichen Dreiecke. |

**Klick** ersetzt die aktuelle Auswahl. **Umschalt + Klick** fügt hinzu;
**Strg + Klick** entfernt den angeklickten Bereich. Umschalt und Strg gleichzeitig
sind uneindeutig und werden mit einem Hinweis zurückgewiesen. **Leeren** leert
zunächst den Entwurf im geöffneten Fenster. **Auswahl rückgängig** und
**Wiederholen** sowie Strg+Z/Strg+Y wechseln während der Auswahl zwischen
Auswahlschritten. Die Modellhistorie bleibt dabei unverändert.

Für technische Teile zunächst einen kleinen Oberflächenwinkel verwenden und die
Vorschau kontrollieren. Der Winkel wird zwischen benachbarten Dreiecken in der
aktuellen räumlichen Lage gemessen. Auf einer allmählich gekrümmten Fläche kann
die Auswahl über viele kleine Winkelschritte wachsen; sie erkennt keine Bohrung
oder Konstruktionsfläche nach ihrer technischen Bedeutung.

## Vorschau, Übernehmen und Abbrechen

Die Auswahl im geöffneten Fenster ist zunächst ein Entwurf. **Übernehmen**
speichert sie als Teil der Arbeitsfläche. **Abbrechen**, Schließen und Escape
stellen die vorher bestätigte Auswahl wieder her. Eine Flächenauswahl verändert
keine Geometrie und erzeugt keinen Modellschritt in Rückgängig/Wiederholen.
Dreiecke werden dabei weder gelöscht noch verschoben oder neu vernetzt.

Die bestätigte Auswahl wird beim normalen Speichern des gemeinsamen Projekts
mitgespeichert und beim Öffnen geprüft. Lage-, Farb- und Deckkraftänderungen
erhalten die ursprünglichen Dreiecksbezüge. Geänderte Netzkoordinaten oder eine
andere Dreiecksstruktur machen sie ungültig; ein Hinweis verhindert die
Weiterverwendung alter Dreiecksnummern. Ein Projektwechsel behält keine Auswahl
des alten Projekts.

Die normalen Exporte behalten ihren bisherigen **Objektumfang**. Auch bei einem
markierten Dreieck exportiert „Ausgewählte Teile“ das vollständige ausgewählte
Netzteil. Es gibt in diesem Paket noch keinen Export einzelner Netzflächen.

## Geeignete und ungeeignete Netze

Offene Netze können ausgewählt werden. Das ist keine erfolgreiche Körperprüfung
und schaltet keine Körperoperation frei. Gesperrte oder unsichtbare Netzteile
sind keine neuen Auswahlziele; CAD-Körper und Ansichtsvorlagen sind keine
bearbeitbaren Netzdreiecke. Ein sichtbares Objekt vor dem Netz wird beim Klicken
berücksichtigt; die Auswahl greift nicht einfach hindurch.

Die Nachbarschaft verwendet exakt gleiche Koordinaten als logische Verbindung,
ohne die gespeicherten Punkte zu verschmelzen. Doppelte, entartete, widersprüchlich
orientierte oder mehrdeutig verbundene Dreiecke begrenzen das Wachsen. Ein
Öffnungsrand muss ein eindeutiger geschlossener, unverzweigter Randring sein.
Berührende oder verzweigte Ränder werden mit einer Erklärung zurückgewiesen.
Es erfolgt keine automatische Reparatur oder Füllung.

Der begrenzte Auswahlversuch unterstützt bis zu 500.000 Dreiecke und
1.000.000 gespeicherte Punkte je Netz. Die Berechnung arbeitet getrennt von der
Oberfläche und kann abgebrochen werden. Sehr dichte oder problematisch verbundene
Netze können eine verständliche Ablehnung erhalten.

## Abnahme und nächster Umfang

Die eigene Ausgabe liegt unter `release-formnaro-netzauswahl-v0.33.0`; das
portable Archiv heißt `output/Formnaro-Netzauswahl-v0.33.0.zip`. Neue
Originalberichte und getrennte Nachweise erfolgreicher Prozessenden werden in
`work/mesh-selection/checks` an vollständige Quellen sowie die tatsächliche EXE
und ASAR gebunden. Maßgeblich sind `final-audit.json` und `delivery.json` nach
Prüfung von Quellen, Laufzeitdateien und Archiven. Diese Anleitung ersetzt
keinen positiven Prüfbericht.

Die gezielte Abnahme verwendet eigens erzeugte offene und geschlossene Netze,
CAD-Körper und Ansichtsvorlagen in isolierten Profilen. Sie prüft tatsächliche
Mausklicks, Auswahlarten, Modifizierer, Abbruch/Übernahme, unveränderte Geometrie,
Quellen und Sperren, affine Lagen, Dateirundlauf und vollständigen Objektexport.
Die betroffenen bisherigen Oberflächen- und Automatikprüfungen ergänzen sie.
Die unveränderten nativen Rechenkerne werden gegen ihre vorhandenen Hashwerte
geprüft; frühere Testläufe werden nicht als frisch ausgeführt ausgegeben.

Paket 15 ergänzt später Auswahlpinsel, Lasso und Schutzbereiche. Fehlerdiagnose,
Reparieren, Öffnungen schließen, Vereinfachen und die weiteren Pakete 16–27
bleiben getrennte folgende Werkzeuge.
