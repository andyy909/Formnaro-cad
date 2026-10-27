# Flüssiger arbeiten – Formnaro 0.80.0

Die Bedienung bleibt gleich. Die Verbesserungen greifen beim Arbeiten mit
Skizzen, bei der Netzauswahl und beim Aufbau der CAD-Ansicht automatisch.

## Skizzen bearbeiten

Zoomen, Verschieben der Zeichenansicht, Punktauswahl und Einpassen verwenden
die bereits berechneten Konturen und Fangpunkte des Entwurfs weiter. Wenn Sie
ein Maß, eine Formel oder einen Punkt ändern, berechnet Formnaro die nötigen
Ansichtsdaten neu. Offene Konturen bleiben als Entwurf sichtbar und bearbeitbar.
Eine ungültige Formel zeigt eine Fehlermeldung; alte Fangpunkte werden dabei
verworfen. Vorschau und Übernehmen prüfen die Geometrie wie bisher.

## Netze auswählen und CAD anzeigen

Für eine zusammenhängende Netzoberfläche berechnet Formnaro die benötigten
Flächenrichtungen während der Suche. Einzelne Dreiecke, Bestandteile und
Öffnungsränder benötigen diese zusätzliche Oberflächenberechnung nicht.
Hintergrundabfragen erhalten gezielt die benötigten Daten des betroffenen
Netzteils. Gespeicherte Originalquellen und Schutzbereiche bleiben im Modell.

Mehrfach verwendete CAD-Anzeigepuffer werden innerhalb einer Antwort nur einmal
übertragen. Eine bereits vorhandene, geringfügig feinere Darstellung derselben
CAD-Geometrie kann bei gleicher Winkelgrenze weiterverwendet werden. Die
gewählte Anzeigetoleranz bleibt erfüllt. Die Grenze dieser Wiederverwendung
bezieht sich auf die lineare Abweichung, nicht auf eine feste Dreieckszahl.

## Grenzen

Komplexe gekrümmte CAD-Teile können beim ersten Anzeigen oder nach echten
Formänderungen weiterhin Zeit für die native Vernetzung benötigen. Bei
mehrfarbigen CAD-Gruppen bleibt die native Berechnung der Farbaufteilung
aufwendig. Datei, Geometrie und Rechnerlast bestimmen die tatsächliche Dauer;
eine Verbesserung einzelner Arbeitsschritte ist keine allgemeine FPS-Zusage.

Modellgeometrie, Genauigkeits- und Qualitätsvorgaben, Exporte, Quellen sowie
Rückgängig/Wiederholen behalten ihre bisherigen Verträge. Projekt- und
Bibliotheksformat bleiben bis Version 10, der Arbeitsplatz bei Version 4.
Ältere portable Ausgaben und die unabhängigen Mini-Versionen bleiben erhalten.

## Leistungsprüfung

Vergleiche unterscheiden die Vorbereitung einer Ansicht, die vollständige
Bedienreaktion und native Geometrieberechnungen. Messwerte gelten für die
jeweils geprüften Modelle und Arbeitsschritte. Die Abnahme kontrolliert daneben
Geometrie, Quellen, Vorschau, Abbruch, Qualitätswechsel und Rückgängig.
