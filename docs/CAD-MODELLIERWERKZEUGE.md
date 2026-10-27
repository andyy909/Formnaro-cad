# CAD-Werkzeuge auf Abruf · Formnaro 0.81.0

Die große Windows-Ausgabe ergänzt fünf Werkzeuge direkt in Formnaro. Unter
**Normal → CAD-Werkzeuge** oder **Easy Tinker → CAD → Zeichnen & Netz** öffnen.
Die Werkzeuge berechnen erst bei einem Flächenklick beziehungsweise mit
**Vorschau berechnen**. Zahlen ändern startet keine neue Geometrieberechnung.

## Kontur von einer CAD-Fläche übernehmen

Ein CAD-Materialteil auswählen, **Kontur von CAD-Fläche …** öffnen und eine
ebene Fläche anklicken. Der Skizzeneditor erhält ihre Außenkontur und geeignete
Innenöffnungen als unabhängigen Entwurf. Linien, Kreise und Kreisbögen bleiben
native Konturen. Maße und Höhe bearbeiten, Vorschau prüfen und extrudieren.
Das Originalteil bleibt erhalten; die Skizze steht an der gewählten Fläche.

Die Kopie folgt späteren Änderungen des Originals nicht automatisch. Ellipsen,
Splines, gekrümmte Flächen, offene oder mehrdeutige Konturen werden abgewiesen.
Höchstens 128 Konturelemente. Für schwierige Konturen das vorhandene Zeichnen
und die vorhandenen Netzwerkzeuge verwenden.

## Einzelne CAD-Fläche versetzen

Ein Teil auswählen, **CAD-Fläche versetzen …** öffnen und die betreffende
Fläche anklicken. Versatz in Millimetern eingeben. Positive Werte fügen Material
hinzu, negative entfernen Material. An einer Bohrung macht positiver Versatz
das Loch kleiner und negativer Versatz größer; der Versatz ist der radiale
Betrag, die Durchmesseränderung beträgt das Doppelte.

Unterstützt werden ebene Flächen mit senkrechten ebenen oder passenden
zylindrischen Nachbarn sowie vollständige gerade Zylinderflächen zwischen zwei
ebenen Stirnflächen. Fasen, Rundungen, schräg angrenzende Flächen, Teilzylinder
und ungeeignete Schnitte werden ausdrücklich abgewiesen. Ungleichmäßig skalierte
Geometrie kann vom CAD-Kern als B-Spline geführt werden und fällt dann ebenfalls
außerhalb dieses engen Werkzeugumfangs. Dies ist eine begrenzte
native Flächenbearbeitung, kein universeller Ersatz für alle Direktwerkzeuge
großer CAD-Systeme. Vorhandene STEP-Geometrie muss ein gültiger Einzelkörper sein.
Diese Bearbeitungen sind auf 2.000 Flächen je Körper und 256 Kanten je geprüfter
Fläche begrenzt.

## CAD-Körper aushöhlen

Ein geeignetes massives CAD-Teil auswählen, **CAD-Körper aushöhlen …** öffnen,
die zu entfernende Öffnungsfläche anklicken und die Wandstärke einstellen.
Formnaro erzeugt die Schale nach innen. Die äußere Form bleibt erhalten.
Zu große Wandstärken, Engstellen oder andere nicht lösbare Formen führen zu
einer Fehlermeldung ohne Übernahme. Dieses Werkzeug erzeugt native CAD-Geometrie;
das bestehende Netz-Aushöhlen bleibt ein eigenes Werkzeug.

## Loft: Übergang zwischen zwei Skizzen

Zwei eigenständige native Skizzenkörper mit geschlossenen Außenkonturen erstellen
und im Raum an ihre gewünschten Querschnittspositionen stellen. Beide auswählen
und **Übergang zwischen Skizzen …** öffnen. Die Vorschau verbindet ihre
Außenkonturen, beispielsweise ein Rechteck mit einem Kreis. Übernehmen fügt ein
neues Teil hinzu und erhält beide Ausgangsskizzen unverändert.

Diese erste Oberfläche verbindet genau zwei Profile; das gespeicherte native
Rezept unterstützt bis zu acht Profile. Innenöffnungen sind noch nicht
zugelassen. Die Extrusionshöhe der Ausgangsskizzen wird für den Übergang nicht
verwendet; maßgeblich sind ihre Kontur und jeweilige Skizzenebene. Die Kopien im
Quellenbaum des Ergebnisses lassen sich unabhängig bearbeiten.

## Sweep: Profil entlang eines Pfads

Eine native Skizze als Querschnitt auswählen und **Profil entlang Pfad …**
öffnen. Eine Gerade mit Länge oder einen Kreisbogen mit Radius und Winkel
zwischen 1 und 180 Grad wählen. Der Pfad beginnt am Skizzenursprung in positiver
lokaler Z-Richtung; ein Bogen biegt in positive lokale X-Richtung. Für eine
andere Lage das Ausgangsprofil drehen oder verschieben.

Das Profil benötigt eine geschlossene Außenkontur ohne Innenöffnungen. Ein
Biegeradius muss den Abstand des Profils von seinem Ursprung ausreichend
übersteigen. Ungeeignete enge Bögen werden abgewiesen. Übernehmen fügt das neue
Teil hinzu; die Ausgangsskizze bleibt erhalten.

## Vorschau, Quellen und spätere Änderungen

Erst **Übernehmen** ändert das Modell und erzeugt einen Rückgängig-Schritt.
**Abbrechen** und Escape verwerfen Entwürfe; eine Modell-/Auswahländerung macht
die Vorschau ungültig. Gesperrte oder ausgeblendete Teile sind keine Ziele.
Während einer Berechnung bleibt der bestätigte Projektstand maßgeblich.

Bei Flächenversatz und Aushöhlen ersetzt ein Quellenkörper das ausgewählte Teil;
seine vollständige Originalquelle einschließlich CAD-Geometrie, Parametern und
Platzierung bleibt im Quellenbaum. Diese Ausgangsgeometrie ist geschützt, damit
gespeicherte Flächennummern niemals still auf andere Flächen angewendet werden.
Die Quelle bleibt kopier- und nachvollziehbar; für eine andere Ausgangsgeometrie
die betreffende Bearbeitung neu anlegen. Geänderte oder verlorene Referenzen
werden abgewiesen.

Eine gespeicherte Flächenbearbeitung, Schale oder ein Sweep lässt sich über
**CAD-Bearbeitung ändern …** beziehungsweise den Eigenschaftenknopf erneut
öffnen. Die Maße ändern dasselbe Rezept und erzeugen keine zusätzliche
Quellenebene. Loftprofile werden in ihren erhaltenen Skizzenquellen bearbeitet.

Neue CAD-Rezepte verwenden Projekt-/Bibliotheksformat 11. Bestehende Dateien
behalten ihr Format, sofern keine neuen Inhalte eingefügt werden. Alte
Formnaro-Versionen können Dateien mit Format 11 nicht öffnen. Neue Dateien
unter neuem Namen speichern, wenn ältere Programme weiterhin benötigt werden.
Autosicherung und Bibliothek verwenden die vorhandenen lokalen Speicherwege.
Mini-Ausgaben und frühere portable Ausgaben bleiben eigenständig.

## Geschwindigkeit und Grenzen

Es gibt keinen ständig laufenden Solver, keine neue automatische Verknüpfung
zwischen Teilen und keine neue Kontaktprüfung während der Bewegung. Konturen
werden einmal übernommen, Modellierrezepte bei ausdrücklichen Änderungen
berechnet. Fertige BReps und geeignete Anzeigedaten werden weiterverwendet.
Kameraänderungen starten diese Konstruktionswerkzeuge nicht neu.

Komplexe Flächenänderungen, Schalen, Lofts und Sweeps können bei der Vorschau,
Prüfung oder neuen Vernetzung Zeit benötigen. Der CAD-Worker verkürzt diese
Rechenzeit nicht; andere CAD-Aufträge können währenddessen warten. Komplizierte
fertige Geometrie benötigt auch mehr Darstellungsspeicher und kann spätere
Bearbeitungen verteuern. Die separate Ausgabe enthält einen Vergleich der
normalen Arbeitsabläufe gegen die unveränderte Version 0.80.0. Dessen Messungen
sind keine allgemeine FPS-, RAM- oder Großdateigarantie. Geometriequalität und
Exportgenauigkeit werden für diese Werkzeuge nicht abgesenkt.
