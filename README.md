# Formnaro

**Deine lokale 3D-Werkstatt für Windows.**

Mit Formnaro konstruierst du technische Teile, bearbeitest 3D-Modelle und bereitest eigene Ideen für Modellbau und 3D-Druck vor. CAD-Körper, Netze, Skizzen und technische Zeichnungen stehen in einer Anwendung zur Verfügung. Die normale Modellierung funktioniert offline; Projekte bleiben auf deinem Rechner.

## Herunterladen

### [Formnaro 0.110.0-r1 für Windows herunterladen](https://github.com/andyy909/Formnaro-Downloads/releases/download/v0.110.0-r1/Formnaro-v0.110.0-r1-Windows.zip)

**Windows · 64 Bit · portable · ZIP ca. 1,05 GB · entpackt ca. 1,81 GiB**

[Versionshinweise, Prüfbericht und Prüfsummen](https://github.com/andyy909/Formnaro-Downloads/releases/tag/v0.110.0-r1) · [Alle Versionen](https://github.com/andyy909/Formnaro-Downloads/releases)

1. Die ZIP-Datei herunterladen und **vollständig in einen eigenen Ordner entpacken**.
2. Im entpackten Ordner **`App/Formnaro.exe`** starten. Eine Installation ist nicht erforderlich.
3. Die mitgelieferten Unterordner, Laufzeiten, Anleitungen und Lizenzen zusammenlassen. Die EXE allein reicht nicht aus.

Beim Versionswechsel den bisherigen eigenen **Datenordner** mit Einstellungen und Werkzeugen mitnehmen. Persönliche Modelle, Profile und Zugangsdaten sind im Download nicht enthalten.

## Neu in 0.110.0-r1

- **FreeCAD-Merkmale bearbeiten:** Den gespeicherten Konstruktionsbaum lesen und passende native Eigenschaften am vorhandenen Teil ändern.
- **Programme mit neuen Parametern ausführen:** Gespeicherte Skripte und CAD-Programme mit geänderten Parametern neu berechnen; native Eigenschaften und Programm-Neuläufe sind getrennte Bearbeitungswege.
- **Gemeinsame Maße und Varianten:** Projektparameter, Varianten und bestätigte Eingabequellen mit abhängigen FreeCAD-Konstruktionen verbinden. Folgeänderungen erscheinen in der Vorschau.
- **Konstruktionen austauschen:** Externe FCStd-Dateien importieren und ausgewählte Konstruktionen wieder als FCStd, STEP oder STL ausgeben.

Für diese zusätzlichen FreeCAD-Funktionen ist eine lokale FreeCAD-Installation erforderlich. Neue Parameter- und Eingabequellenbindungen verwenden Projektformat 23; ältere Programmversionen können neue Formate nicht öffnen.

## Was du mit Formnaro machen kannst

- **Einfach einsteigen:** Grundformen platzieren, Maße ändern, Teile verschieben, ausrichten, spiegeln und gruppieren.
- **Technisch konstruieren:** Skizzen, Maßformeln, Projektparameter und Varianten sowie CAD-Werkzeuge für Anbauten, Ausschnitte, Bohrungen und weitere Formänderungen verwenden.
- **3D-Druck-Modelle bearbeiten:** STL- und andere Netzmodelle importieren, prüfen, gezielt reparieren und mit Netzwerkzeugen bearbeiten; CAD über STEP austauschen.
- **Zeichnungen erstellen:** Technische Ansichten und Bemaßungen anlegen und als PDF, SVG oder DXF ausgeben.
- **Mit Referenzbildern arbeiten:** Projektfotos speichern, ebene Bilder entzerren und bestätigte Vorder-, Seiten- und Draufsichten zu einer bearbeitbaren CAD-Variante verbinden.
- **Optional KI nutzen:** Modellieraufträge, Foto-Unterstützung und Programmhilfe über einen eingerichteten Anbieter verwenden. Lokale Python-Werkzeuge sind enthalten; FreeCAD-Funktionen benötigen eine zusätzliche lokale FreeCAD-Installation.

Änderungen lassen sich vor der Übernahme in einer Vorschau prüfen und anschließend rückgängig machen. Für KI-Anfragen an einen Cloud-Anbieter wird eine Internetverbindung benötigt; abhängig vom eingerichteten Zugang können Anbietergebühren anfallen.

## Ein Blick ins Programm

Die folgenden Bildschirmbilder stammen aus der geprüften Windows-Ausgabe 0.108.0 und zeigen mitgelieferte Testbeispiele.

### Easy Tinker – Formen und Maße direkt im Blick

Die vereinfachte Oberfläche bietet eine Formenpalette, direkte Größenfelder und Griffe zum Verschieben und Drehen.

![Easy Tinker mit Formenpalette und direkt bearbeitbaren Maßen](bilder/easy-tinker.png)

### Solid – Werkzeuge und Modellbaum

Vier Bedienmodi stehen zur Wahl: **Easy Tinker, Normal, Solid und Fusion 360**. Hier ist der Solid-Modus mit dunkler Darstellung zu sehen.

![Solid-Modus mit Werkzeugregistern, Modellbaum und ausgewähltem CAD-Körper](bilder/solid-modus.png)

### Skizzen – Konturen, Öffnungen und Formeln

Bearbeitbare Skizzen verbinden technische Konturen mit benannten Maßen und Maßbeziehungen.

![Skizzeneditor mit Bohrungen, Langloch und benannten Maßen](bilder/skizzen.png)

### Neu in 0.108.0 – technische Fotoansichten verbinden

Bestätigte Vorder-, Seiten- und Draufsichten teilen sich Nullpunkte und Zielmaße. Aus den Profilen entsteht eine native CAD-Vorschau; jede Ansicht und die Funktionsmaße werden vor der Übernahme geprüft.

![Native CAD-Vorschau aus drei bestätigten technischen Ansichten](bilder/technische-fotoansichten.png)

Bilder zeigen nur sichtbare Konturen. Verdeckte Innengeometrie und die spätere Passung eines gedruckten Teils müssen gesondert geklärt und geprüft werden.

## Geprüfte Ausgabe

**0.110.0-r1** ist die aktuelle veröffentlichte Programmversion. Die technische Abnahme umfasst **467 Tests am eingefrorenen Quellstand und 856 Prüfgruppen an der tatsächlichen Windows-Anwendung**, darunter 71 FreeCAD-Dokument- und 11 Speicher-/Exportprüfungen. Die KI-Anbieterabläufe wurden dabei mit simulierten Antworten geprüft. Der [Prüfbericht](https://github.com/andyy909/Formnaro-Downloads/releases/download/v0.110.0-r1/Pruefergebnis.json) beschreibt Umfang und Grenzen.

Die Anleitungen liegen im Download unter `App/docs`. Dieses öffentliche Repository dient der Bereitstellung von Beschreibung, Bildern und fertigen Programmpaketen. Das Entwicklungsrepository und seine Git-Historie bleiben privat.
