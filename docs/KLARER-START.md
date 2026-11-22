# Formnaro mit übersichtlichem Startordner

Die ZIP **Formnaro-v0.114.0-r7-Windows-Klarer-Start.zip** enthält dieselbe Programmversion 0.114.0-r7 und drei zusätzliche, bearbeitbare CAD-Beispiele.

## Starten

1. Die ZIP vollständig in einen eigenen Ordner entpacken.
2. Oben **Formnaro starten** doppelklicken.
3. Ein neues Projekt anlegen oder über **Projekte → Beispiele** eines der mitgelieferten Modelle öffnen.

Eine separate Installation von FreeCAD oder Python ist nicht erforderlich. Bei Bedarf lässt sich das Programm auch direkt über `Programmdateien/Formnaro.exe` starten.

## Die Einträge im Startordner

| Eintrag | Zweck |
| --- | --- |
| **Formnaro starten** | Verknüpfung zum Programm |
| **Projekte** | Verknüpfung zum tatsächlichen Projektordner |
| **Bibliothek und Einstellungen** | Verknüpfung zum tatsächlichen Datenordner mit gespeicherter Bauteilbibliothek und Einstellungen |
| **Programmdateien** | Alle zur Anwendung gehörenden Dateien, Laufzeiten, Anleitungen und Lizenzen |
| **LIES-MICH-ZUERST.txt** | Kurze Startanleitung |

Die Verknüpfungen bleiben beim gemeinsamen Verschieben des entpackten Ordners verwendbar. Die Unterordner und Programmdateien zusammenlassen.

Die eigentlichen Dateien liegen unter **Programmdateien/Projekte** und **Programmdateien/Daten**. Teile, die du über die Bibliotheksfunktion speicherst, bleiben in den Bibliotheksdateien im Datenordner.

## Mitgelieferte Beispiele

Im Projektordner **Beispiele** liegen Elektronikgehäuse, Lagerhalter und Getriebestudie. Alle drei Modelle enthalten native CAD-Geometrie und ihre bearbeitbaren Quellen.

Die Getriebestudie hat zwei unabhängig bedienbare Drehgelenke. Im Solid-Modus unter **Baugruppe → Gelenke** lassen sich die Winkel verändern. Eine automatische Zahnradkopplung ist nicht enthalten.

[Bilder und einzelne Projektdateien](../beispiele/README.md) · [Anleitung zu Gelenken](GELENKE-BEWEGUNG.md)

## Prüfung der Startausgabe

Alle ursprünglichen Programmeinträge sind unverändert übernommen. Die neuen Verknüpfungen wurden in einem frisch entpackten Ordner mit Leerzeichen und Umlaut aufgelöst; die tatsächliche EXE wurde von dort über die Startverknüpfung mit isolierten Prüfdaten gestartet. Die gezielte Prüfung umfasst 23 Prüfgruppen zur integrierten CAD-Laufzeit und den vier Bedienmodi. Dies ergänzt die ursprüngliche Freigabe um die Prüfung der neuen Ordneraufteilung.

[Windows-Download](https://github.com/andyy909/Formnaro-cad/releases/download/v0.114.0-r7/Formnaro-v0.114.0-r7-Windows-Klarer-Start.zip) · [SHA-256-Prüfsumme](https://github.com/andyy909/Formnaro-cad/releases/download/v0.114.0-r7/Formnaro-v0.114.0-r7-Windows-Klarer-Start-SHA256.txt)

